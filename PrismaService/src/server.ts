import './environment';
import express from 'express';
import helmet from 'helmet';
import {timingSafeEqual} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {prisma,eligible,safeTask,HttpError,day} from './prisma';
import {auth} from './routes/auth';
import {admin} from './routes/admin';
import {snapshot,commit} from './services/game';
import {courses,statistics,leaderboard,aiContext,seasons} from './services/queries';
import {showCatalog,showStart,showRead,showNext,showHint,showSnapshot,showCommit,showAbandon,showWager} from './services/show';
import {privateQuestionTranslations,preparedCourseLocale} from './services/show-localization';

const app=express();app.disable('x-powered-by');app.use(helmet());app.use(express.json({limit:'2mb'}));
const secret=process.env.DATA_SERVICE_KEY;
if(!secret||secret.length<32)throw new Error('DATA_SERVICE_KEY must contain at least 32 characters.');
const health:express.RequestHandler=async(_req,res)=>{try{await prisma.$queryRaw`SELECT 1`;res.json({status:'healthy'});}catch{res.status(503).json({status:'unavailable'});}};
app.get('/health',health);
app.use((req,res,next)=>{const input=Buffer.from(req.header('X-Service-Key')??''),expected=Buffer.from(secret);if(input.length!==expected.length||!timingSafeEqual(input,expected)){res.status(401).json({message:'Private service authentication required.'});return;}next();});
app.get('/health/ready',health);
app.use('/auth',auth);app.use('/admin',admin);
// Private service route: the API uses these answers to run a quiz; it is never proxied to clients.
app.get('/multiplayer/questions',async(req,res,next)=>{try{
 const course=await prisma.course.findFirst({where:{id:String(req.query.courseId??''),isPublished:true},include:{levels:{include:{tasks:{where:{taskType:'MULTIPLE_CHOICE'},include:{options:{orderBy:{order:'asc'}}}}}}}});
 if(!course)throw new HttpError(404,'Course not found.');
 res.json({courseTitle:course.title,courseTitles:Object.fromEntries((['ru','kk','en'] as const).map(language=>[language,preparedCourseLocale(course.id,language)?.title??course.title])),questions:course.levels.flatMap(l=>l.tasks.map(t=>({id:t.id,title:t.title,question:t.question,correctAnswer:t.correctAnswer,options:t.options.map(o=>({id:o.id,text:o.text})),translations:privateQuestionTranslations(t)})))});
}catch(e){next(e);}});
const route=(method:'get'|'post',path:string,handler:(req:express.Request)=>Promise<any>)=>app[method](path,async(req,res,next)=>{try{res.json(await handler(req));}catch(e){next(e);}});
const sid=(req:express.Request)=>String(req.query.studentId??req.body.studentId??'');
route('post','/game/snapshot',req=>snapshot(req.body));route('post','/game/commit',req=>commit(req.body));
route('get','/show/catalog',req=>showCatalog(sid(req),req.query.language));
route('post','/show/start',req=>showStart(req.body));
route('get','/show/active',req=>showRead(sid(req),undefined,req.query.language));
route('get','/show/:id',req=>showRead(sid(req),req.params.id,req.query.language));
route('post','/show/:id/next',req=>showNext(req.params.id,req.body));
route('post','/show/:id/hint',req=>showHint(req.params.id,req.body));
route('post','/show/:id/wager',req=>showWager(req.params.id,req.body));
route('post','/show/:id/abandon',req=>showAbandon(req.params.id,req.body.studentId,req.body.language));
// These two routes carry answer keys/award plans and are private to the ASP.NET API.
route('post','/show/:id/snapshot',req=>showSnapshot(req.params.id,req.body));
route('post','/show/:id/commit',req=>showCommit(req.params.id,req.body));
route('get','/courses',req=>courses(sid(req)));
route('get','/courses/:id',async req=>{const c=(await courses(sid(req),req.params.id))[0];if(!c)throw new HttpError(404,'Course not found.');return c;});
route('post','/courses/:id/purchase',async req=>{
 const studentId=String(req.body.studentId??'');if(!studentId)throw new HttpError(400,'Student account required.');
 return prisma.$transaction(async tx=>{
  const course=await tx.course.findFirst({where:{id:req.params.id,isPublished:true},select:{id:true,price:true,title:true}});if(!course)throw new HttpError(404,'Course not found.');
  const existing=await tx.courseEnrollment.findUnique({where:{studentId_courseId:{studentId,courseId:course.id}}});if(existing){const student=await tx.student.findUniqueOrThrow({where:{id:studentId},select:{coins:true}});return {purchased:true,alreadyOwned:true,coins:student.coins,courseTitle:course.title};}
  const charged=await tx.student.updateMany({where:{id:studentId,coins:{gte:course.price}},data:{coins:{decrement:course.price},version:{increment:1}}});if(!charged.count)throw new HttpError(402,'Not enough coins. Complete challenges to earn more.');
  await tx.courseEnrollment.create({data:{studentId,courseId:course.id}});const student=await tx.student.findUniqueOrThrow({where:{id:studentId},select:{coins:true}});
  return {purchased:true,alreadyOwned:false,coins:student.coins,courseTitle:course.title,price:course.price};
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
});
route('post','/courses/:id/reviews',async req=>{
 const studentId=String(req.body.studentId??''),rating=Number(req.body.rating),comment=req.body.comment;
 if(!Number.isInteger(rating)||rating<1||rating>5||typeof comment!=='string'||comment.trim().length<3||comment.length>2000)throw new HttpError(400,'Choose 1–5 stars and write a comment of 3–2000 characters.');
 const enrollment=await prisma.courseEnrollment.findUnique({where:{studentId_courseId:{studentId,courseId:req.params.id}}});if(!enrollment)throw new HttpError(403,'Purchase this course before leaving a review.');
 return prisma.courseReview.upsert({where:{studentId_courseId:{studentId,courseId:req.params.id}},create:{studentId,courseId:req.params.id,rating,comment:comment.trim()},update:{rating,comment:comment.trim()}});
});
route('post','/courses/:courseId/materials/:materialId/complete',async req=>{
 const studentId=String(req.body.studentId??'');
 const enrollment=await prisma.courseEnrollment.findUnique({where:{studentId_courseId:{studentId,courseId:req.params.courseId}}});if(!enrollment)throw new HttpError(403,'Purchase this course with coins before opening lessons.');
 const material=await prisma.courseMaterial.findFirst({where:{id:req.params.materialId,courseId:req.params.courseId,course:{isPublished:true}}});
 if(!material||!studentId)throw new HttpError(404,'Lesson not found.');
 return prisma.studentMaterialProgress.upsert({where:{studentId_materialId:{studentId,materialId:material.id}},create:{studentId,materialId:material.id},update:{}});
});
const youtubeUrl=(value:unknown)=>{
 if(typeof value!=='string'||value.length>1000)return false;
 try{const url=new URL(value);if(!['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(url.hostname.toLowerCase()))return false;
  return url.hostname.toLowerCase().endsWith('youtu.be')?/^\/[A-Za-z0-9_-]{11}$/.test(url.pathname):/^\/(watch|embed|shorts)$/.test(url.pathname)&&/^[A-Za-z0-9_-]{11}$/.test(url.pathname==='/watch'?url.searchParams.get('v')??'':url.pathname.split('/')[2]??'');
 }catch{return false;}
};
async function requireTeacher(userId:string){const user=await prisma.user.findUnique({where:{id:userId},select:{role:true}});if(user?.role!=='TEACHER')throw new HttpError(403,'A teacher account is required.');}
route('get','/teacher/courses',async req=>{
 const userId=String(req.query.userId??'');await requireTeacher(userId);
 return prisma.course.findMany({where:{createdByUserId:userId},orderBy:{createdAt:'desc'},include:{materials:{orderBy:{order:'asc'},select:{id:true,title:true,videoUrl:true}},levels:{include:{tasks:true}}}});
});
route('get','/teacher/courses/:id/statistics',async req=>{
 const userId=String(req.query.userId??'');await requireTeacher(userId);
 const course=await prisma.course.findFirst({where:{id:req.params.id,createdByUserId:userId},include:{enrollments:{include:{student:{select:{id:true,firstName:true,lastName:true}}}},materials:{include:{progress:{include:{student:{select:{id:true,firstName:true,lastName:true}}}}}},levels:{include:{tasks:{include:{attempts:{include:{student:{select:{id:true,firstName:true,lastName:true}}}}}}}}}});
 if(!course)throw new HttpError(404,'Course not found.');
 const tasks=course.levels.flatMap(level=>level.tasks),byStudent=new Map<string,any>();
 for(const enrollment of course.enrollments){const s=enrollment.student;byStudent.set(s.id,{id:s.id,name:`${s.firstName} ${s.lastName}`.trim(),lessonsCompleted:0,attempts:0,correct:0,completedTaskIds:new Set<string>(),lastActivity:enrollment.purchasedAt});}
 for(const material of course.materials)for(const progress of material.progress){const entry=byStudent.get(progress.studentId)??{id:progress.studentId,name:`${progress.student.firstName} ${progress.student.lastName}`.trim(),lessonsCompleted:0,attempts:0,correct:0,completedTaskIds:new Set<string>(),lastActivity:null};entry.lessonsCompleted++;entry.lastActivity=!entry.lastActivity||progress.completedAt>entry.lastActivity?progress.completedAt:entry.lastActivity;byStudent.set(progress.studentId,entry);}
 for(const task of tasks)for(const attempt of task.attempts){const student=attempt.student,entry=byStudent.get(student.id)??{id:student.id,name:`${student.firstName} ${student.lastName}`.trim(),lessonsCompleted:0,attempts:0,correct:0,completedTaskIds:new Set<string>(),lastActivity:null};entry.name=`${student.firstName} ${student.lastName}`.trim();entry.attempts++;if(attempt.isCorrect){entry.correct++;entry.completedTaskIds.add(task.id);}entry.lastActivity=!entry.lastActivity||attempt.createdAt>entry.lastActivity?attempt.createdAt:entry.lastActivity;byStudent.set(student.id,entry);}
 const students=[...byStudent.values()].map(({completedTaskIds,...student})=>({...student,accuracy:student.attempts?Math.round(student.correct/student.attempts*100):0,completed:tasks.length>0&&completedTaskIds.size>=tasks.length})).sort((a,b)=>a.name.localeCompare(b.name));
 const attemptCount=students.reduce((sum,student)=>sum+student.attempts,0),correct=students.reduce((sum,student)=>sum+student.correct,0);
 return {course:{id:course.id,title:course.title},studentCount:students.length,attemptCount,accuracy:attemptCount?Math.round(correct/attemptCount*100):0,completedStudents:students.filter(student=>student.completed).length,lessonCount:course.materials.length,questionCount:tasks.length,students};
});
route('post','/teacher/courses',async req=>{
 const userId=String(req.body.userId??'');await requireTeacher(userId);
 const c=req.body.course,m=req.body.materials,q=req.body.questions;
 if(!c||typeof c.title!=='string'||c.title.trim().length<3||c.title.length>255||typeof c.description!=='string'||c.description.trim().length<10||c.description.length>20000||typeof c.category!=='string'||!c.category.trim()||c.category.length>100||!['EASY','MEDIUM','HARD'].includes(c.difficulty)||!Number.isInteger(c.estimatedMinutes)||c.estimatedMinutes<1||c.estimatedMinutes>10000||!Number.isInteger(c.price)||c.price<0||c.price>1000000||typeof c.isPublished!=='boolean')throw new HttpError(400,'Add a course title, description, subject, level, price, time and publish choice.');
 const imageUrl=typeof c.imageUrl==='string'?c.imageUrl:'';
 if(imageUrl.length>500000||imageUrl&&!(/^https:\/\//i.test(imageUrl)||/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageUrl)))throw new HttpError(400,'Choose a JPEG, PNG or WebP cover image, or use an HTTPS image URL.');
 if(!Array.isArray(m)||m.length<1||m.length>20||!Array.isArray(q)||q.length<1||q.length>100)throw new HttpError(400,'Add at least one lesson and one test question.');
 for(const lesson of m){if(typeof lesson.title!=='string'||!lesson.title.trim()||lesson.title.length>255||typeof lesson.content!=='string'||lesson.content.length>20000||lesson.content.trim().length<10&&!lesson.videoUrl||lesson.videoUrl&&!youtubeUrl(lesson.videoUrl))throw new HttpError(400,'Each lesson needs readable text or a valid YouTube link.');}
 for(const question of q){const choices=Array.isArray(question.options)?question.options.map((option:any)=>typeof option==='string'?option.trim():''):[];const answer=typeof question.correctAnswer==='string'?question.correctAnswer.trim():'';if(typeof question.question!=='string'||question.question.trim().length<5||question.question.length>2000||choices.length<2||choices.length>6||!choices.every((option:string)=>option.length>0&&option.length<=500)||new Set(choices).size!==choices.length||!choices.includes(answer)||typeof question.explanation!=='string'||question.explanation.length>2000)throw new HttpError(400,'Check each test question, its 2–6 answer choices and correct answer.');question.options=choices;question.correctAnswer=answer;}
 return prisma.$transaction(async tx=>{
  const course=await tx.course.create({data:{title:c.title.trim(),description:c.description.trim(),category:c.category.trim(),difficulty:c.difficulty,estimatedMinutes:c.estimatedMinutes,price:c.price,isPublished:c.isPublished,imageUrl,createdByUserId:userId}});
  for(const [index,lesson] of m.entries())await tx.courseMaterial.create({data:{courseId:course.id,title:lesson.title.trim(),content:lesson.content.trim(),videoUrl:String(lesson.videoUrl??'').trim(),order:index+1}});
  const level=await tx.level.create({data:{courseId:course.id,title:'Course test',description:'Questions based on the lessons above.',order:1,requiredXP:0}});
  const topic=await tx.topic.create({data:{courseId:course.id,name:'Course test',description:'Review the course lessons before answering.'}});
  for(const [index,question] of q.entries())await tx.task.create({data:{levelId:level.id,topicId:topic.id,title:`Question ${index+1}`,description:'',question:question.question.trim(),difficulty:'EASY',taskType:'MULTIPLE_CHOICE',content:'{}',xpReward:100,timeLimit:120,hint:'Review the lesson material and think about the key idea.',correctAnswer:question.correctAnswer,explanation:question.explanation.trim(),order:index+1,options:{create:question.options.map((text:string,order:number)=>({text:text.trim(),order}))}}});
  return tx.course.findUnique({where:{id:course.id},include:{materials:{orderBy:{order:'asc'}},levels:{include:{tasks:{orderBy:{order:'asc'},include:{options:true}}}}}});
 });
});
route('get','/levels/:id',async req=>{const l=await prisma.level.findUnique({where:{id:req.params.id}});if(!l)throw new HttpError(404,'Level not found.');return (await courses(sid(req),l.courseId))[0]?.levels.find(l=>l.id===req.params.id)??{};});
route('get','/tasks/:id',async req=>safeTask((await eligible(sid(req),req.params.id)).task));
route('post','/tasks/:id/start',async req=>{const {task}=await eligible(req.body.studentId,req.params.id);const session=await prisma.taskSession.create({data:{studentId:req.body.studentId,taskId:task.id}});return {task:safeTask(task),sessionId:session.id,startedAt:session.startedAt};});
route('post','/tasks/:id/report',async req=>{if(typeof req.body.message!=='string'||req.body.message.length<5||req.body.message.length>2000)throw new HttpError(400,'Report must contain 5–2000 characters.');return prisma.taskReport.create({data:{studentId:req.body.studentId,taskId:req.params.id,message:req.body.message}});});
route('get','/statistics',req=>statistics(sid(req)));
route('get','/students/me',async req=>(await statistics(sid(req))).student);
route('get','/students/me/progress',req=>courses(sid(req)));
route('post','/students/me',async req=>{const {firstName,lastName,bio,avatarUrl}=req.body;
 if(typeof firstName!=='string'||!firstName.trim()||firstName.length>80||typeof lastName!=='string'||!lastName.trim()||lastName.length>80||typeof bio!=='string'||bio.length>2000||typeof avatarUrl!=='string'||avatarUrl.length>500||avatarUrl&& !/^https:\/\//.test(avatarUrl))throw new HttpError(400,'Invalid profile; use an HTTPS avatar URL.');
 return prisma.student.update({where:{id:req.body.studentId},data:{firstName,lastName,bio,avatarUrl}});
});
route('get','/achievements',async req=>{const unlocked=await prisma.studentAchievement.findMany({where:{studentId:sid(req)}});return (await prisma.achievement.findMany()).map(a=>({...a,unlockedAt:unlocked.find(u=>u.achievementId===a.id)?.unlockedAt??null}));});
route('get','/attempts',req=>prisma.attempt.findMany({where:{studentId:sid(req)},orderBy:{createdAt:'desc'},skip:(Math.max(1,Number(req.query.page)||1)-1)*20,take:20,include:{task:{select:{title:true}}}}));
route('get','/xp',req=>prisma.xpEvent.findMany({where:{studentId:sid(req)},orderBy:{createdAt:'desc'},take:100}));
route('get','/daily-goals',async req=>(await prisma.dailyGoal.findMany({where:{isActive:true},include:{students:{where:{studentId:sid(req),date:day()}}}})).map(g=>({...g,progress:g.students[0]?.progress??0,completed:!!g.students[0]?.completedAt})));
route('get','/streaks',async req=>{const s=await prisma.streak.findUnique({where:{studentId:sid(req)}});return {...s,current:s?.lastDate===day()||s?.lastDate===day(new Date(Date.now()-86400000))?s.current:0};});
route('get','/leaderboard',req=>leaderboard(String(req.query.period??'global'),sid(req),Math.max(1,Number(req.query.page)||1)));
route('get','/seasons',()=>seasons());
route('get','/notifications',req=>prisma.notification.findMany({where:{studentId:sid(req)},orderBy:{createdAt:'desc'},take:50}));
route('post','/notifications/read',async req=>{await prisma.notification.updateMany({where:{studentId:req.body.studentId,readAt:null},data:{readAt:new Date()}});return {ok:true};});
route('get','/ai/context',req=>aiContext(sid(req)));
route('post','/ai/hint',async req=>{const {task}=await eligible(req.body.studentId,req.body.taskId);return prisma.$transaction(async tx=>{
 await tx.student.update({where:{id:req.body.studentId},data:{version:{increment:1}}});
 return tx.hint.create({data:{studentId:req.body.studentId,taskId:task.id,text:task.hint}});
});});
route('post','/ai/recommendation',req=>prisma.aIRecommendation.create({data:req.body}));
route('post','/ai/hint-text',async req=>{await prisma.hint.updateMany({where:{id:req.body.hintId,studentId:req.body.studentId},data:{text:req.body.text}});return {ok:true};});
app.use((_req,res)=>res.status(404).json({message:'Unknown data service route.'}));
app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
 if(error instanceof HttpError){res.status(error.status).json({message:error.message});return;}
 if(error instanceof Prisma.PrismaClientKnownRequestError){
  if(['P2021','P2022','P2004'].includes(error.code)){console.error('Database schema update required:',error.code);res.status(503).json({message:'The database schema is missing a required update. Run database/sqlserver/04_CourseLessonsAndTeachers.sql and database/sqlserver/05_CourseMarketAndCurrency.sql after 03_ShowSessions.sql, then restart the services.'});return;}
  if(error.code==='P2003')console.error('Database foreign key rejected an operation:',error.meta?.field_name??'unknown field');
  const status=error.code==='P2002'?409:error.code==='P2025'?404:400;res.status(status).json({message:status===409?'This record already exists.':status===404?'Record not found.':'Database constraint rejected this operation.'});return;
 }
 if(error instanceof Prisma.PrismaClientValidationError){res.status(400).json({message:'Invalid data or missing required fields.'});return;}
 if(error?.name==='PrismaClientInitializationError'){console.error('SQL Server connection failed.');res.status(503).json({message:'SQL Server is unavailable. Start or restart the SQL Server service and confirm that TCP port 1433 is listening, then restart the data service.'});return;}
 console.error('Data operation failed:',error.name);res.status(500).json({message:'Unable to complete data operation.'});
});
const server=app.listen(Number(process.env.PORT??4000),'0.0.0.0',()=>console.log('Prisma data service listening on port '+(process.env.PORT??4000)));
async function shutdown(){server.close();await prisma.$disconnect();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
