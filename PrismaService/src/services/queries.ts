import {prisma,safeTask,day,HttpError} from '../prisma';
import {learningInsights} from './learning-insights';
export async function courses(studentId:string,id?:string){
 const completed=studentId?await prisma.attempt.findMany({where:{studentId,isCorrect:true},distinct:['taskId'],select:{taskId:true}}):[];
 const done=new Set(completed.map(a=>a.taskId));
 const student=studentId?await prisma.student.findUnique({where:{id:studentId}}):null;
 const list=await prisma.course.findMany({where:{isPublished:true,...(id?{id}:{})},include:{materials:{orderBy:{order:'asc'},include:{progress:{where:{studentId},select:{studentId:true}}}},levels:{orderBy:{order:'asc'},include:{tasks:{orderBy:{order:'asc'},include:{options:{orderBy:{order:'asc'}}}}}},enrollments:{where:{studentId},select:{studentId:true}},reviews:{orderBy:{createdAt:'desc'},take:30,include:{student:{select:{firstName:true,lastName:true}}}}},orderBy:{createdAt:'asc'}});
 const ratings=await prisma.courseReview.groupBy({by:['courseId'],where:{courseId:{in:list.map(course=>course.id)}},_avg:{rating:true},_count:{rating:true}});
 return list.map(c=>{let priorComplete=true;const owned=!!student&&c.enrollments.length>0;const materials=c.materials.map(({progress,...material})=>({...material,completed:progress.length>0}));const materialsCompleted=materials.filter(m=>m.completed).length;const materialsReady=materialsCompleted===materials.length;const reviews=c.reviews;const rating=ratings.find(entry=>entry.courseId===c.id);const averageRating=rating?Math.round((rating._avg.rating??0)*10)/10:0;return {...c,enrolled:owned,canReview:owned,averageRating,reviewCount:rating?rating._count.rating:0,reviews:reviews.map(r=>({rating:r.rating,comment:r.comment,createdAt:r.createdAt,studentName:`${r.student.firstName} ${r.student.lastName}`.trim(),isMine:r.studentId===studentId})),materials:owned?materials:[],materialsCompleted:owned?materialsCompleted:0,materialsTotal:c.materials.length,materialsReady:owned&&materialsCompleted===c.materials.length,levels:owned?c.levels.map(l=>{
  const locked=!priorComplete||(student?.totalXP??0)<l.requiredXP;
  const count=l.tasks.filter(t=>done.has(t.id)).length;
  priorComplete=priorComplete&&count===l.tasks.length;
  return {...l,isLocked:locked||!materialsReady,completed:count,tasks:l.tasks.map(t=>({...safeTask(t),completed:done.has(t.id),isLocked:locked||!materialsReady}))};
 }):[],completed:owned?c.levels.flatMap(l=>l.tasks).filter(t=>done.has(t.id)).length:0,taskCount:c.levels.reduce((n,l)=>n+l.tasks.length,0),totalXP:c.levels.flatMap(l=>l.tasks).reduce((n,t)=>n+t.xpReward,0)};});
}
export async function statistics(studentId:string){
 const [student,attempts,events,topicProgress,achievements]=await Promise.all([
 prisma.student.findUniqueOrThrow({where:{id:studentId},include:{user:{select:{email:true}}}}),
 prisma.attempt.findMany({where:{studentId},include:{task:{select:{topicId:true,difficulty:true}}},orderBy:{createdAt:'asc'}}),
 prisma.xpEvent.findMany({where:{studentId},orderBy:{createdAt:'asc'}}),
 prisma.studentTopicProgress.findMany({where:{studentId},include:{topic:true}}),prisma.studentAchievement.count({where:{studentId}})]);
 const correct=attempts.filter(a=>a.isCorrect).length;
 const completed=new Set(attempts.filter(a=>a.isCorrect).map(a=>a.taskId)).size;
 const courseList=await courses(studentId);
 const weekly=Array.from({length:7},(_,i)=>{const d=day(new Date(Date.now()-(6-i)*86400000));return {date:d,xp:events.filter(e=>day(e.createdAt)===d).reduce((n,e)=>n+e.amount,0),tasks:attempts.filter(a=>day(a.createdAt)===d).length};});
 const currentDate=day(),yesterday=day(new Date(Date.now()-86400000));
 const activity=student.lastActivityAt?day(student.lastActivityAt):null;
 return {student:{...student,currentStreak:activity===currentDate||activity===yesterday?student.currentStreak:0},totalXP:student.totalXP,completedTasks:completed,attempts:attempts.length,accuracy:attempts.length?Math.round(correct/attempts.length*100):0,averageScore:attempts.length?Math.round(attempts.reduce((n,a)=>n+a.score,0)/attempts.length):0,
 completedCourses:courseList.filter(c=>c.taskCount>0&&c.completed===c.taskCount).length,achievements,weekly,...learningInsights(attempts,topicProgress),
 difficulties:['EASY','MEDIUM','HARD'].map(d=>{const group=attempts.filter(a=>a.task.difficulty===d);return {name:d,attempts:group.length,accuracy:group.length?Math.round(group.filter(a=>a.isCorrect).length/group.length*100):0};})};
}
export async function leaderboard(period:string,studentId:string,page=1){
 const students=await prisma.student.findMany({include:{achievements:{select:{achievementId:true}}}});
 let since:Date|undefined;const now=new Date();
 if(period==='weekly'){const weekday=(now.getUTCDay()+6)%7;since=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-weekday));}
 if(period==='monthly')since=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
 const events=since?await prisma.xpEvent.groupBy({by:['studentId'],where:{createdAt:{gte:since}},_sum:{amount:true}}):[];
 let seasonEntries:any[]=[];
 if(period==='seasonal'){const season=await prisma.season.findFirst({where:{startsAt:{lte:now},endsAt:{gte:now}},orderBy:{startsAt:'desc'}});if(season)seasonEntries=await prisma.studentSeason.findMany({where:{seasonId:season.id}});}
 const entries=students.map(s=>({id:s.id,firstName:s.firstName,lastName:s.lastName,avatarUrl:s.avatarUrl,level:s.level,achievements:s.achievements.length,xp:since?(events.find(e=>e.studentId===s.id)?._sum.amount??0):period==='seasonal'?(seasonEntries.find(e=>e.studentId===s.id)?.xp??0):s.totalXP,isMe:s.id===studentId})).sort((a,b)=>b.xp-a.xp||a.id.localeCompare(b.id)).map((e,i)=>({...e,rank:i+1}));
 return {entries:entries.slice((page-1)*20,page*20),total:entries.length,page,me:entries.find(e=>e.isMe)??null};
}
export async function aiContext(studentId:string){
 const list=await courses(studentId);
 const tasks=list.flatMap(c=>c.levels.flatMap(l=>l.isLocked?[]:l.tasks.filter(t=>!t.completed).map(t=>({...t,courseTitle:c.title}))));
 return {tasks,topics:await prisma.studentTopicProgress.findMany({where:{studentId},include:{topic:true}}),recent:await prisma.attempt.findMany({where:{studentId},orderBy:{createdAt:'desc'},take:10,include:{task:{select:{difficulty:true}}}})};
}
export async function seasons(){
 const list=await prisma.season.findMany({orderBy:{startsAt:'desc'},include:{students:{orderBy:[{xp:'desc'},{studentId:'asc'}],include:{student:{select:{firstName:true,lastName:true}}}}}});
 for(const s of list)if(s.endsAt<new Date()&&!s.finalizedAt){await prisma.$transaction(async tx=>{
  const claimed=await tx.season.updateMany({where:{id:s.id,finalizedAt:null},data:{finalizedAt:new Date()}});
  if(claimed.count)for(const [i,e] of s.students.entries())await tx.studentSeason.update({where:{studentId_seasonId:{studentId:e.studentId,seasonId:s.id}},data:{finalRank:i+1,badge:i<3?['GOLD','SILVER','BRONZE'][i]:null}});
 });}
 const seasons=await prisma.season.findMany({orderBy:{startsAt:'desc'},include:{students:{orderBy:[{xp:'desc'},{studentId:'asc'}],take:3,include:{student:{select:{firstName:true,lastName:true}}}}}});
 return seasons.map(s=>({...s,rewards:JSON.parse(s.rewards)}));
}
