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

const app=express();app.disable('x-powered-by');app.use(helmet());app.use(express.json({limit:'100kb'}));
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
 if(error instanceof Prisma.PrismaClientKnownRequestError){const status=error.code==='P2002'?409:error.code==='P2025'?404:400;res.status(status).json({message:status===409?'This record already exists.':status===404?'Record not found.':'Database constraint rejected this operation.'});return;}
 if(error instanceof Prisma.PrismaClientValidationError){res.status(400).json({message:'Invalid data or missing required fields.'});return;}
 console.error('Data operation failed:',error.name);res.status(500).json({message:'Unable to complete data operation.'});
});
const server=app.listen(Number(process.env.PORT??4000),'0.0.0.0',()=>console.log('Prisma data service listening on port '+(process.env.PORT??4000)));
async function shutdown(){server.close();await prisma.$disconnect();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
