import { Prisma } from '@prisma/client';
import {prisma,eligible,HttpError,day} from '../prisma';
import {randomUUID} from 'node:crypto';
import {checkShowAnswer} from './show-rules';
const readResult=(value:string)=>JSON.parse(value);

export async function snapshot(b:any,options:{checkMaterials?:boolean}={}){
 const replay=await prisma.attempt.findUnique({where:{studentId_requestId:{studentId:b.studentId,requestId:b.requestId}}});
 if(replay){if(replay.taskId!==b.taskId)throw new HttpError(409,'Request ID belongs to another task.');return {replayed:readResult(replay.result)};}
 const {task,student}=await eligible(b.studentId,b.taskId,options);
 const session=await prisma.taskSession.findUnique({where:{id:b.sessionId}});
 if(!session||session.studentId!==student.id||session.taskId!==task.id||session.submittedAt)throw new HttpError(409,'Start a new challenge session.');
 const [attempts,completed,achievements,unlocked,goals,streak,recent,hints,leaders]=await Promise.all([
  prisma.attempt.findMany({where:{studentId:student.id,taskId:task.id}}),
  prisma.attempt.findMany({where:{studentId:student.id,isCorrect:true},distinct:['taskId'],select:{taskId:true}}),
  prisma.achievement.findMany({orderBy:{code:'asc'}}),prisma.studentAchievement.findMany({where:{studentId:student.id}}),
  prisma.dailyGoal.findMany({where:{isActive:true},include:{students:{where:{studentId:student.id,date:day()}}}}),
  prisma.streak.findUnique({where:{studentId:student.id}}),prisma.attempt.findMany({where:{studentId:student.id,OR:[{isCorrect:false},{xpEarned:{gt:0}}]},orderBy:{createdAt:'desc'},take:10}),
  prisma.hint.count({where:{studentId:student.id,taskId:task.id,createdAt:{gte:session.startedAt}}}),
  prisma.student.count({where:{totalXP:{gt:student.totalXP+task.xpReward*1.5}}})
 ]);
 const courseTasks=await prisma.task.findMany({where:{level:{courseId:task.level.courseId}},select:{id:true}});
 let correctRun=0;for(const a of recent){if(!a.isCorrect)break;if(a.xpEarned>0)correctRun++;}
 const canonicalAnswer=typeof b.answer==='string'&&['SEQUENCE','MATCHING','NUMERIC','PROBLEM'].includes(task.taskType)?
  (checkShowAnswer(task,b.answer)?task.correctAnswer:'\u0000INVALID:'+randomUUID()):undefined;
 return {student,task,canonicalAnswer,attemptCount:attempts.length,alreadyCompleted:attempts.some(a=>a.isCorrect),completedTasks:completed.length,correctRun,
 courseCompleted:courseTasks.every(t=>t.id===task.id||completed.some(c=>c.taskId===t.id)),isLeader:leaders===0,lastDate:streak?.lastDate??null,
 elapsedSeconds:Math.max(0,Math.floor((Date.now()-session.startedAt.getTime())/1000)),hintUsed:hints>0,achievements,
 unlockedIds:unlocked.map(a=>a.achievementId),goals:goals.map(g=>({...g,progress:g.students[0]?.progress??0,completed:!!g.students[0]?.completedAt}))};
}

export async function commit(p:any){
 if(p.date!==day())throw new HttpError(409,'The learning day changed. Recalculate the attempt.');
 for(let retry=0;retry<4;retry++){
  try{return await prisma.$transaction(async tx=>{
   return commitInTransaction(tx,p);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000});}
  catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2034','P2002'].includes(e.code)&&retry<3)continue;throw e;}
 }
 throw new HttpError(409,'Concurrent progress update; retry.');
}

// Shared atomic writer for the existing C# rules engine and persisted TV shows.
export async function commitInTransaction(tx:Prisma.TransactionClient,p:any){
   const replay=await tx.attempt.findUnique({where:{studentId_requestId:{studentId:p.studentId,requestId:p.requestId}}});
   if(replay){if(replay.taskId!==p.taskId)throw new HttpError(409,'Request ID belongs to another task.');return readResult(replay.result);}
   const session=await tx.taskSession.findUnique({where:{id:p.sessionId}});
   if(!session||session.studentId!==p.studentId||session.taskId!==p.taskId||session.submittedAt)throw new HttpError(409,'Challenge session already submitted.');
   // C# is the trusted rules engine. This private service only accepts authenticated server plans.
   const coinsEarned=p.rewards.some((r:any)=>r.source==='TASK')?Math.floor(Math.max(0,p.xpEarned)/10):0;
   const wallet=await tx.student.findUnique({where:{id:p.studentId},select:{coins:true}});if(!wallet)throw new HttpError(404,'Student not found.');
   const updated=await tx.student.updateMany({where:{id:p.studentId,version:p.expectedVersion},data:{totalXP:p.totalXP,coins:{increment:coinsEarned},level:p.level,currentStreak:p.currentStreak,longestStreak:p.longestStreak,
    ...(p.rewards.some((r:any)=>r.source==='TASK')?{lastActivityAt:new Date()}:{}),version:{increment:1}}});
   if(updated.count!==1)throw new HttpError(409,'Progress changed.');
   const result={isCorrect:p.isCorrect,score:p.score,xpEarned:p.xpEarned,coinsEarned,coins:wallet.coins+coinsEarned,totalXP:p.totalXP,level:p.level,currentStreak:p.currentStreak,achievements:p.achievements,explanation:p.explanation,requestId:p.requestId};
   await tx.taskSession.update({where:{id:p.sessionId},data:{submittedAt:new Date()}});
   await tx.attempt.create({data:{studentId:p.studentId,taskId:p.taskId,answer:p.answer,isCorrect:p.isCorrect,score:p.score,xpEarned:p.xpEarned,timeSpent:p.timeSpent,attemptNumber:p.attemptNumber,requestId:p.requestId,result:JSON.stringify(result)}});
   for(const r of p.rewards)await tx.xpEvent.create({data:{studentId:p.studentId,amount:r.amount,source:r.source,sourceId:r.sourceId}});
   for(const a of p.achievements){
    await tx.studentAchievement.create({data:{studentId:p.studentId,achievementId:a.id}});
    await tx.notification.create({data:{studentId:p.studentId,title:'Achievement unlocked',message:`${a.title} · +${a.xpReward} XP`}});
   }
   const fresh=p.rewards.some((r:any)=>r.source==='TASK');
   if(fresh)await tx.streak.upsert({where:{studentId:p.studentId},create:{studentId:p.studentId,current:p.currentStreak,longest:p.longestStreak,lastDate:p.date},update:{current:p.currentStreak,longest:p.longestStreak,lastDate:p.date}});
   for(const g of p.goals)await tx.studentDailyGoal.upsert({where:{studentId_dailyGoalId_date:{studentId:p.studentId,dailyGoalId:g.id,date:p.date}},create:{studentId:p.studentId,dailyGoalId:g.id,date:p.date,progress:g.progress,completedAt:g.completed?new Date():null},update:{progress:g.progress,completedAt:g.completed?new Date():null}});
   const task=await tx.task.findUniqueOrThrow({where:{id:p.taskId}});
   await tx.studentTopicProgress.upsert({where:{studentId_topicId:{studentId:p.studentId,topicId:task.topicId}},create:{studentId:p.studentId,topicId:task.topicId,correct:p.isCorrect?1:0,wrong:p.isCorrect?0:1},update:p.isCorrect?{correct:{increment:1}}:{wrong:{increment:1}}});
   const board=await tx.leaderboard.upsert({where:{period:'global'},create:{period:'global',name:'Global league'},update:{}});
   await tx.leaderboardEntry.upsert({where:{leaderboardId_studentId:{leaderboardId:board.id,studentId:p.studentId}},create:{leaderboardId:board.id,studentId:p.studentId,xp:p.totalXP},update:{xp:p.totalXP}});
   const seasons=await tx.season.findMany({where:{startsAt:{lte:new Date()},endsAt:{gte:new Date()}}});
   for(const season of seasons)await tx.studentSeason.upsert({where:{studentId_seasonId:{studentId:p.studentId,seasonId:season.id}},create:{studentId:p.studentId,seasonId:season.id,xp:p.xpEarned},update:{xp:{increment:p.xpEarned}}});
   return result;

}
