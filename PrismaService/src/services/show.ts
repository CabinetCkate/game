import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {prisma,HttpError,day} from '../prisma';
import {snapshot,commitInTransaction} from './game';
import {PREPARED_COURSE_IDS,type ShowLanguage} from '../../prisma/show-subjects';
import {showLanguage,localizedShowTask,localizedShowAnswer,canonicalShowAnswer,preparedCourseLocale,preparedTopicName} from './show-localization';
import {Round,ROUND_SCHEDULE,ROUND_RULES,BOT_PROFILES,botPlan,publicContent,checkShowAnswer,showScore,validWager,effectiveWager,chooseAdaptiveTask,unlockedShowTasks,hasClassicRound} from './show-rules';

export const CHARACTERS=[
 {id:'nova',name:'Нова',description:'Смелая исследовательница',color:'#67e8f9',portrait:'/assets/characters/nova-portrait.png'},
 {id:'leo',name:'Лео',description:'Энергичный стратег',color:'#fbbf24',portrait:'/assets/characters/leo-portrait.png'},
 {id:'maya',name:'Майя',description:'Внимательная изобретательница',color:'#c4b5fd',portrait:'/assets/characters/maya-portrait.png'},
 {id:'atlas',name:'Атлас',description:'Спокойный аналитик',color:'#86efac',portrait:'/assets/characters/atlas-portrait.png'},
];
type Participant={id:string;name:string;characterId:string;isBot:boolean;score:number;accuracy?:number};
type BotAnswer={participantId:string;isCorrect:boolean;timeSpent:number;scoreDelta?:number};
type Question={index:number;taskId:string;taskSessionId:string;timeoutRequestId:string;startedAt:string;deadline:string;timeLimit:number;round:Round;duelOpponentId:string|null;bots:BotAnswer[];hint:string|null;wager?:number|null};
type ShowState={language?:ShowLanguage;phase:'intro'|'question'|'feedback'|'results';questionIndex:number;courseTitle:string;topicId:string|null;participants:Participant[];usedTaskIds:string[];current:Question|null;adaptive:any;history:any[];feedback:any;winnerId:string|null;summary:any;duelOpponentId:string|null};
const parse=(row:any):ShowState=>JSON.parse(row.state);
const inputIndex=(index:any)=>{if(!Number.isInteger(index)||index<0||index>=ROUND_SCHEDULE.length)throw new HttpError(400,'Invalid question index.');return index as number;};
const requestId=(id:any)=>{if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new HttpError(400,'A UUID requestId is required.');return id;};
async function owned(db:any,studentId:string,id:string){const row=await db.showSession.findFirst({where:{id,studentId}});if(!row)throw new HttpError(404,'Show session not found.');return row;}
async function atomic<T>(fn:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
 for(let retry=0;retry<4;retry++)try{return await prisma.$transaction(fn,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20000});}
 catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2034','P2002'].includes(e.code)&&retry<3)continue;throw e;}
 throw new HttpError(409,'Concurrent show update; retry.');
}
async function write(tx:Prisma.TransactionClient,row:any,state:ShowState,extra:any={}){
 const updated=await tx.showSession.updateMany({where:{id:row.id,studentId:row.studentId,version:row.version},data:{state:JSON.stringify(state),version:{increment:1},...extra}});
 if(updated.count!==1)throw new HttpError(409,'Show changed. Refresh the session.');
 return {...row,...extra,state:JSON.stringify(state),version:row.version+1};
}
async function available(db:any,studentId:string,courseId:string,topicId:string|null){
 if(!PREPARED_COURSE_IDS.includes(courseId))throw new HttpError(400,'Bot shows use prepared studio courses only.');
 const [student,course,completed]=await Promise.all([
  db.student.findUnique({where:{id:studentId}}),
  db.course.findFirst({where:{id:courseId,isPublished:true},include:{topics:true,levels:{orderBy:{order:'asc'},include:{tasks:{include:{options:{orderBy:{order:'asc'}}}}}}}}),
  db.attempt.findMany({where:{studentId,isCorrect:true},distinct:['taskId'],select:{taskId:true}}),
 ]);
 if(!student||!course)throw new HttpError(404,'Published course not found.');
 if(topicId&&!course.topics.some((t:any)=>t.id===topicId))throw new HttpError(400,'Topic does not belong to this course.');
 const tasks:any[]=unlockedShowTasks(course.levels,student.totalXP,completed.map((a:any)=>a.taskId),topicId);
 if(!tasks.length)throw new HttpError(403,'This topic has no unlocked show tasks. Complete earlier levels first.');
 if(!hasClassicRound(tasks))throw new HttpError(400,'This course needs multiple choice tasks for the classic round.');
 return {student,course,tasks};
}
async function publicSession(row:any,db:any=prisma,requestedLanguage?:unknown){
 const state=parse(row),q=state.current,task=q?await db.task.findUnique({where:{id:q.taskId},include:{options:{orderBy:{order:'asc'}}}}):null;
 const language=showLanguage(requestedLanguage,state.language??'ru'),displayed=task?localizedShowTask(task,language):null;
 const feedback=state.feedback&&task?{...state.feedback,correctAnswer:localizedShowAnswer(task,language),explanation:displayed.explanation}:state.feedback;
 const now=Date.now(),elapsed=q?(now-Date.parse(q.startedAt))/1000:0;
 return {id:row.id,language,courseId:row.courseId,courseTitle:preparedCourseLocale(row.courseId,language)?.title??state.courseTitle,topicId:state.topicId,characterId:row.characterId,status:row.status,
  phase:state.phase,questionIndex:state.questionIndex,questionCount:ROUND_SCHEDULE.length,serverNow:new Date(now).toISOString(),
  participants:state.participants.map(p=>({...p,answered:p.isBot?!!q?.bots.some(b=>b.participantId===p.id&&(state.phase!=='question'||b.timeSpent<=elapsed)):state.phase==='feedback'||state.phase==='results'})),
  currentQuestion:displayed&&q?{index:q.index,taskId:displayed.id,title:displayed.title,question:displayed.question,prompt:displayed.question,taskType:displayed.taskType,
   options:displayed.options.map((o:any)=>({id:o.id,text:o.text})),content:publicContent(displayed),deadline:q.deadline,startedAt:q.startedAt,timeLimit:q.timeLimit,
   round:q.round,roundTitle:ROUND_RULES[q.round].title,rules:ROUND_RULES[q.round].rules,duelOpponentId:q.duelOpponentId,
   maxWager:q.round==='wager'?Math.min(state.participants[0].score,300):0,wager:q.wager??0,wagerLocked:q.wager!=null}:null,
  feedback,adaptive:state.adaptive,winnerId:state.winnerId,summary:state.summary,hint:q?.hint&&displayed?displayed.hint:null};
}

export async function showCatalog(studentId:string,requestedLanguage?:unknown){
 const language=showLanguage(requestedLanguage);
 const student=await prisma.student.findUnique({where:{id:studentId}});if(!student)throw new HttpError(403,'A student account is required.');
 const [courses,completed]=await Promise.all([
  prisma.course.findMany({where:{isPublished:true,id:{in:PREPARED_COURSE_IDS}},include:{topics:{select:{id:true,name:true}},levels:{orderBy:{order:'asc'},include:{tasks:{select:{id:true,topicId:true,taskType:true,options:{select:{id:true}}}}}}},orderBy:{createdAt:'desc'}}),
  prisma.attempt.findMany({where:{studentId,isCorrect:true},distinct:['taskId'],select:{taskId:true}})
 ]);
 const completedIds=completed.map(attempt=>attempt.taskId);
 const availableCourses=courses.flatMap(course=>{
  const tasks=unlockedShowTasks(course.levels,student.totalXP,completedIds);
  if(!hasClassicRound(tasks))return [];
  return [{id:course.id,title:course.title,description:course.description,category:course.category,...preparedCourseLocale(course.id,language),
   topics:course.topics.filter(topic=>hasClassicRound(tasks.filter(task=>task.topicId===topic.id))).map(topic=>({...topic,name:preparedTopicName(topic.id,course.id,language)??topic.name})),taskCount:tasks.length}];
 });
 return {title:'Лига знаний',characters:CHARACTERS,host:{id:'orion',name:'Марк'},rounds:ROUND_SCHEDULE.map((id,index)=>({id,index,...ROUND_RULES[id]})),
  courses:availableCourses,questionCount:ROUND_SCHEDULE.length};
}
export async function showStart(b:any){
 if(typeof b.courseId!=='string'||!CHARACTERS.some(c=>c.id===b.characterId)||b.topicId!=null&&typeof b.topicId!=='string')throw new HttpError(400,'Select a valid course, topic and character.');
 const row=await atomic(async tx=>{
  const {student,course}=await available(tx,b.studentId,b.courseId,b.topicId||null);
  // Serializes starts for one student without affecting their XP.
  await tx.student.update({where:{id:student.id},data:{version:{increment:1}}});
  const active=await tx.showSession.findFirst({where:{studentId:b.studentId,status:'ACTIVE'},orderBy:{updatedAt:'desc'}});
  if(active){
   const old=parse(active);
   if(active.courseId===b.courseId&&active.characterId===b.characterId&&old.topicId===(b.topicId||null))return active;
   throw new HttpError(409,'Resume or finish your active show before starting another.');
  }
  const others=CHARACTERS.filter(c=>c.id!==b.characterId);
  const participants:Participant[]=[{id:'player',name:`${student.firstName} ${student.lastName}`.trim(),characterId:b.characterId,isBot:false,score:0},
   ...BOT_PROFILES.map((bot,i)=>({id:bot.id,name:bot.name,characterId:others[i].id,isBot:true,score:0,accuracy:bot.accuracy}))];
  const state:ShowState={language:showLanguage(b.language),phase:'intro',questionIndex:0,courseTitle:course.title,topicId:b.topicId||null,participants,usedTaskIds:[],current:null,
   adaptive:{source:'fallback',reason:'Локальный адаптивный подбор из проверенного банка курса.',difficulty:'EASY',weakTopic:null},history:[],feedback:null,winnerId:null,summary:null,duelOpponentId:null};
  return tx.showSession.create({data:{studentId:b.studentId,courseId:b.courseId,characterId:b.characterId,state:JSON.stringify(state)}});
 });
 return publicSession(row,prisma,b.language);
}
// Internal read envelope: the API settles an expired question through the same C# XP engine.
export async function showRead(studentId:string,id?:string,language?:unknown){
 const row=id?await owned(prisma,studentId,id):await prisma.showSession.findFirst({where:{studentId,status:'ACTIVE'},orderBy:{updatedAt:'desc'}});
 if(!row)return {session:null,needsTimeout:false};
 const state=parse(row),q=state.current;
 return {session:await publicSession(row,prisma,language),needsTimeout:row.status==='ACTIVE'&&state.phase==='question'&&!!q&&Date.now()>=Date.parse(q.deadline),questionIndex:state.questionIndex,timeoutRequestId:q?.timeoutRequestId,timeoutWager:q?.wager??0};
}
export async function showNext(id:string,b:any){
 inputIndex(b.questionIndex);
 const row=await atomic(async tx=>{
  const row=await owned(tx,b.studentId,id),state=parse(row);
  if(row.status!=='ACTIVE')return row;
  // A retried Next request cannot advance twice or reset the clock.
  if(state.phase==='question'&&(b.questionIndex===state.questionIndex||b.questionIndex===state.questionIndex-1))return row;
  if(b.questionIndex!==state.questionIndex)throw new HttpError(409,'Question changed. Refresh the show.');
  if(state.phase!=='intro'&&state.phase!=='feedback')throw new HttpError(409,'Answer the current question first.');
  const index=state.phase==='intro'?0:state.questionIndex+1;
  if(index>=ROUND_SCHEDULE.length)return row;
  const {tasks}=await available(tx,b.studentId,row.courseId,state.topicId);
  const [attempts,weak,previousShows]=await Promise.all([tx.attempt.findMany({where:{studentId:b.studentId},orderBy:{createdAt:'desc'},take:30,include:{task:{select:{difficulty:true,timeLimit:true}}}}),tx.studentTopicProgress.findMany({where:{studentId:b.studentId}}),tx.showSession.findMany({where:{studentId:b.studentId},orderBy:{updatedAt:'desc'},take:10,select:{state:true}})]);
  const hints=attempts.length?await tx.hint.findMany({where:{studentId:b.studentId,taskId:{in:attempts.map(a=>a.taskId)},createdAt:{gte:new Date(attempts[attempts.length-1].createdAt.getTime()-3600000)}}}):[];
  const observations=new Map<string,any>(previousShows.flatMap(s=>parse(s).history.map(h=>[h.requestId,h] as [string,any])));
  const history=attempts.map(a=>{
   const show=observations.get(a.requestId);
   return {...a,task:{...a.task,timeLimit:show?.timeLimit??a.task.timeLimit},hintUsed:show?.hintUsed??hints.some(h=>h.taskId===a.taskId&&h.createdAt<=a.createdAt&&h.createdAt.getTime()>=a.createdAt.getTime()-(a.timeSpent+2)*1000)};
  });
  const {task,adaptive}=chooseAdaptiveTask(tasks,history,state.usedTaskIds,index,weak,state.adaptive?.trainingDifficulty);
  if(!task)throw new HttpError(404,'No course tasks are available.');
  // Three seconds reading the television, then a two-second camera pullback.
  // The answer clock starts afterwards, so the full response time is preserved.
  const round=ROUND_SCHEDULE[index],timeLimit=Math.max(5,Math.min(task.timeLimit,ROUND_RULES[round].seconds)),now=new Date(Date.now()+5000);
  const session=await tx.taskSession.create({data:{studentId:b.studentId,taskId:task.id,startedAt:now}});
  if(round==='duel'&&!state.duelOpponentId)state.duelOpponentId=state.participants.filter(p=>p.isBot).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))[0].id;
  state.current={index,taskId:task.id,taskSessionId:session.id,timeoutRequestId:randomUUID(),startedAt:now.toISOString(),deadline:new Date(now.getTime()+timeLimit*1000).toISOString(),timeLimit,round,
   duelOpponentId:round==='duel'?state.duelOpponentId:null,bots:botPlan(task.difficulty,timeLimit),hint:null,wager:null};
  state.phase='question';state.questionIndex=index;state.usedTaskIds.push(task.id);state.adaptive=adaptive;state.feedback=null;
  await tx.aIRecommendation.create({data:{studentId:b.studentId,taskId:task.id,source:'fallback',reason:adaptive.reason}});
  return write(tx,row,state);
 });
 return publicSession(row,prisma,b.language);
}
export async function showHint(id:string,b:any){
 inputIndex(b.questionIndex);
 const row=await atomic(async tx=>{
  const row=await owned(tx,b.studentId,id),state=parse(row),q=state.current;
  if(row.status!=='ACTIVE'||state.phase!=='question'||!q||q.index!==b.questionIndex||Date.now()>=Date.parse(q.deadline))throw new HttpError(409,'Hints are available only during the current question.');
  if(q.hint!==null)return row;
  const task=await tx.task.findUniqueOrThrow({where:{id:q.taskId}});
  await tx.hint.create({data:{studentId:b.studentId,taskId:task.id,text:task.hint}});
  await tx.student.update({where:{id:b.studentId},data:{version:{increment:1}}});
  q.hint=task.hint;return write(tx,row,state);
 });
 return publicSession(row,prisma,b.language);
}
export async function showAbandon(id:string,studentId:string,language?:unknown){
 const row=await atomic(async tx=>{const row=await owned(tx,studentId,id);if(row.status!=='ACTIVE')return row;return write(tx,row,parse(row),{status:'ABANDONED'});});
 return publicSession(row,prisma,language);
}
export async function showWager(id:string,b:any){
 inputIndex(b.questionIndex);
 const row=await atomic(async tx=>{
  const row=await owned(tx,b.studentId,id),state=parse(row),q=state.current;
  if(row.status!=='ACTIVE'||state.phase!=='question'||!q||q.index!==b.questionIndex||q.round!=='wager'||Date.now()>=Date.parse(q.deadline))throw new HttpError(409,'Commit a wager during the current wager question.');
  if(!validWager(b.wager,state.participants[0].score))throw new HttpError(400,'Invalid wager.');
  if(q.wager!=null){if(q.wager===b.wager)return row;throw new HttpError(409,'Your wager is already locked.');}
  q.wager=b.wager;return write(tx,row,state);
 });
 return publicSession(row,prisma,b.language);
}
export async function showSnapshot(id:string,b:any){
 inputIndex(b.questionIndex);requestId(b.requestId);
 if(typeof b.answer!=='string'||b.answer.length>1000)throw new HttpError(400,'Answer must be a string of at most 1000 characters.');
 const row=await owned(prisma,b.studentId,id),state=parse(row);
 const replay=state.history.find(h=>h.requestId===b.requestId);
 if(replay){if(replay.questionIndex!==b.questionIndex)throw new HttpError(409,'Request ID belongs to another question.');return {replayed:await publicSession(row,prisma,b.language)};}
 const q=state.current;
 if(row.status!=='ACTIVE'||state.phase!=='question'||!q||q.index!==b.questionIndex)throw new HttpError(409,'This question has already been answered. Refresh the show.');
 if(Date.now()<Date.parse(q.startedAt))throw new HttpError(409,'Wait for the question presentation to finish.');
 const wager=effectiveWager(q.round,b.wager,q.wager,state.participants[0].score);
 if(wager===null)throw new HttpError(400,'Answer wager must match the committed stake.');
 const game=await snapshot({studentId:b.studentId,taskId:q.taskId,sessionId:q.taskSessionId,requestId:b.requestId});
 if('replayed' in game)throw new HttpError(409,'Request ID was already used by another learning attempt.');
 const receivedAt=new Date().toISOString(),timedOut=Date.parse(receivedAt)>=Date.parse(q.deadline);
 const isCorrect=!timedOut&&checkShowAnswer(game.task,canonicalShowAnswer(game.task,b.answer,showLanguage(b.language,state.language??'ru')));
 game.task={...game.task,timeLimit:q.timeLimit};
 game.elapsedSeconds=timedOut?q.timeLimit+1:Math.max(0,Math.floor((Date.parse(receivedAt)-Date.parse(q.startedAt))/1000));
 return {gameSnapshot:game,canonicalAnswer:isCorrect?game.task.correctAnswer:'\u0000INVALID:'+randomUUID(),taskSessionId:q.taskSessionId,
  showVersion:row.version,receivedAt,wager,timedOut};
}
export async function showCommit(id:string,b:any){
 const p=b.plan;
 if(!p||p.studentId!==b.studentId||p.requestId!==b.requestId||p.date!==day())throw new HttpError(409,'Invalid or expired server award plan.');
 const row=await atomic(async tx=>{
  const row=await owned(tx,b.studentId,id),state=parse(row);
  const replay=state.history.find(h=>h.requestId===b.requestId);
  if(replay){if(replay.questionIndex!==b.questionIndex)throw new HttpError(409,'Request ID belongs to another question.');return row;}
  const q=state.current;
  if(row.status!=='ACTIVE'||row.version!==b.showVersion||state.phase!=='question'||!q||q.index!==b.questionIndex||q.taskId!==p.taskId||q.taskSessionId!==p.sessionId)throw new HttpError(409,'Show changed. Recalculate the answer.');
  const task=await tx.task.findUniqueOrThrow({where:{id:q.taskId},include:{options:true}});
  const usedRequest=await tx.attempt.findUnique({where:{studentId_requestId:{studentId:b.studentId,requestId:b.requestId}}});
  if(usedRequest)throw new HttpError(409,'Request ID was already used by another learning attempt.');
  const received=Date.parse(b.receivedAt),started=Date.parse(q.startedAt),now=Date.now();
  if(!Number.isFinite(received)||received<started||received>now||now-received>30000)throw new HttpError(409,'Expired answer snapshot.');
  const answer=canonicalShowAnswer(task,b.answer,showLanguage(b.language,state.language??'ru'));
  const timedOut=received>=Date.parse(q.deadline),correct=!timedOut&&checkShowAnswer(task,answer);
  if(correct!==p.isCorrect)throw new HttpError(409,'Question changed. Recalculate the answer.');
  const wager=effectiveWager(q.round,b.wager,q.wager,state.participants[0].score);
  if(wager===null)throw new HttpError(400,'Answer wager must match the committed stake.');
  const result=await commitInTransaction(tx,{...p,answer});
  const elapsed=Math.max(0,(received-started)/1000),opponent=q.bots.find(bot=>bot.participantId===q.duelOpponentId);
  const fastest=correct&&(!opponent?.isCorrect||elapsed<=opponent.timeSpent),delta=showScore(q.round,correct,elapsed,q.timeLimit,wager,fastest);
  state.participants[0].score=Math.max(0,state.participants[0].score+delta);
  if(q.round==='wager')q.wager=wager;
  const bots=q.bots.map(bot=>{
   const participant=state.participants.find(p=>p.id===bot.participantId)!;
   const competing=q.round!=='duel'||bot.participantId===q.duelOpponentId;
   const stake=q.round==='wager'?Math.min(participant.score,150):0;
   const scoreDelta=competing?showScore(q.round,bot.isCorrect,bot.timeSpent,q.timeLimit,stake,bot.isCorrect&&(!correct||bot.timeSpent<elapsed)):0;
   participant.score=Math.max(0,participant.score+scoreDelta);
   return {...bot,scoreDelta};
  });
  // Explanations and keys become public only after this question is settled.
  state.feedback={...result,isCorrect:correct,timedOut,answer:b.answer,correctAnswer:task.correctAnswer,explanation:task.explanation,scoreDelta:delta,bots};
  state.history.push({questionIndex:q.index,requestId:b.requestId,taskId:task.id,isCorrect:correct,xpEarned:result.xpEarned,scoreDelta:delta,hintUsed:q.hint!==null,timeLimit:q.timeLimit});
  state.phase='feedback';
  let extra:any={};
  if(q.index===ROUND_SCHEDULE.length-1){
   state.phase='results';const ranks=state.participants.slice().sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
   // Equal scores share victory; the student is chosen when tied at the top.
   state.winnerId=state.participants[0].score===ranks[0].score?'player':ranks[0].id;
   const completedAt=new Date();
   state.summary={correct:state.history.filter(h=>h.isCorrect).length,wrong:state.history.filter(h=>!h.isCorrect).length,
    xpEarned:state.history.reduce((sum,h)=>sum+h.xpEarned,0),rank:1+state.participants.filter(p=>p.score>state.participants[0].score).length,completedAt:completedAt.toISOString()};
   extra={status:'COMPLETED',completedAt};
  }
  return write(tx,row,state,extra);
 });
 return publicSession(row,prisma,b.language);
}
