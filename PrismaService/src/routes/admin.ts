import {Router} from 'express';
import {prisma,HttpError} from '../prisma';
export const admin=Router();
const parseSetting=(setting:{key:string,value:string})=>({...setting,value:JSON.parse(setting.value)});
const models:Record<string,{delegate:any,fields:string[]}>= {
 courses:{delegate:prisma.course,fields:['title','description','category','imageUrl','difficulty','estimatedMinutes','isPublished']},
 levels:{delegate:prisma.level,fields:['courseId','title','description','order','requiredXP','isLocked']},
 topics:{delegate:prisma.topic,fields:['courseId','name','description']},
 tasks:{delegate:prisma.task,fields:['levelId','topicId','title','description','question','difficulty','taskType','xpReward','timeLimit','hint','correctAnswer','explanation','order']},
 achievements:{delegate:prisma.achievement,fields:['code','title','description','icon','condition','target','xpReward']},
 seasons:{delegate:prisma.season,fields:['title','description','startsAt','endsAt','rewards']},
 'daily-goals':{delegate:prisma.dailyGoal,fields:['title','target','xpReward','isActive']},
 students:{delegate:prisma.student,fields:['firstName','lastName','bio','avatarUrl']}
};
admin.get('/dashboard',async(_req,res,next)=>{try{res.json({students:await prisma.student.count(),courses:await prisma.course.count(),attempts:await prisma.attempt.count(),xp:(await prisma.xpEvent.aggregate({_sum:{amount:true}}))._sum.amount??0,reports:await prisma.taskReport.findMany({take:50,orderBy:{createdAt:'desc'},include:{task:{select:{title:true}},student:{select:{firstName:true,lastName:true}}}})});}catch(e){next(e);}});
admin.get('/reports',async(_req,res,next)=>{try{res.json(await prisma.student.findMany({select:{id:true,firstName:true,lastName:true,totalXP:true,level:true,currentStreak:true,_count:{select:{attempts:true,achievements:true}},topicProgress:{include:{topic:true}}}}));}catch(e){next(e);}});
admin.get('/settings',async(_req,res,next)=>{try{res.json((await prisma.setting.findMany()).map(parseSetting));}catch(e){next(e);}});
admin.post('/settings',async(req,res,next)=>{try{
 if(!['aiEnabled','aiPrompt'].includes(req.body.key))throw new HttpError(400,'Unsupported setting.');
 res.json(parseSetting(await prisma.setting.upsert({where:{key:req.body.key},create:{key:req.body.key,value:JSON.stringify(req.body.value)},update:{value:JSON.stringify(req.body.value)}})));
}catch(e){next(e);}});
admin.get('/:resource',async(req,res,next)=>{try{
 const model=models[req.params.resource];if(!model)throw new HttpError(404,'Unknown resource.');
 const page=Math.max(1,Number(req.query.page)||1);
 res.json({items:await model.delegate.findMany({skip:(page-1)*20,take:20,...(req.params.resource==='tasks'?{include:{options:{orderBy:{order:'asc'}}}}:{})}),total:await model.delegate.count(),page});
}catch(e){next(e);}});
admin.post('/:resource',async(req,res,next)=>{try{
 const resource=req.params.resource,model=models[resource];if(!model)throw new HttpError(404,'Unknown resource.');
 const data:any={};for(const key of model.fields)if(req.body[key]!==undefined)data[key]=req.body[key];
 if(resource==='seasons'){if(data.startsAt)data.startsAt=new Date(data.startsAt);if(data.endsAt)data.endsAt=new Date(data.endsAt);if(data.rewards!==undefined)data.rewards=JSON.stringify(data.rewards);}
 if(resource==='tasks'){
  if(!['MULTIPLE_CHOICE','TRUE_FALSE'].includes(data.taskType))throw new HttpError(400,'Only choice and true/false tasks are supported.');
  const options=req.body.options;
  if(!Array.isArray(options)||options.length<2||options.length>6||!options.every(o=>typeof o==='string'&&o.length>0&&o.length<1000)||!options.includes(data.correctAnswer))throw new HttpError(400,'Correct answer must match one of 2–6 options.');
  if(data.xpReward<0||data.xpReward>1000||data.timeLimit<10||data.timeLimit>3600)throw new HttpError(400,'Invalid reward or time limit.');
  data.options={...(req.body.id?{deleteMany:{}}:{}),create:options.map((text:string,order:number)=>({text,order}))};
 }
 if(resource==='students'&&!req.body.id)throw new HttpError(400,'Create students using registration.');
 const result=req.body.id?await model.delegate.update({where:{id:req.body.id},data}):await model.delegate.create({data});res.json(result);
}catch(e){next(e);}});
admin.delete('/:resource/:id',async(req,res,next)=>{try{
 const model=models[req.params.resource];if(!model)throw new HttpError(404,'Unknown resource.');
 await model.delegate.delete({where:{id:req.params.id}});res.json({ok:true});
}catch(e){next(e);}});
