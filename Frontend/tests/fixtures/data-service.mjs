// Deterministic private data-service fixture. Tests exercise the real C# API and SignalR hub.
// This file is never imported by production code and never reads the user's .env/database.
import {createServer} from 'node:http';
import {randomUUID,pbkdf2Sync,createHash} from 'node:crypto';

export function fixtureServer(serviceKey){
 const users=new Map(),tokens=new Map(),sessions=new Map(),results=new Map();
 const salt=Buffer.alloc(16,1),header=Buffer.alloc(13);header[0]=1;header.writeUInt32BE(2,1);header.writeUInt32BE(100000,5);header.writeUInt32BE(16,9);
 users.set('admin',{id:'admin',email:'admin@example.com',role:'ADMIN',passwordHash:Buffer.concat([header,salt,pbkdf2Sync('Admin123!',salt,100000,32,'sha512')]).toString('base64')});
 users.set('language-test',{id:'language-test',email:'language@example.com',role:'STUDENT',student:{id:'language-student',firstName:'Language',lastName:'Test',totalXP:0,level:1,currentStreak:0,longestStreak:0,version:0,user:{email:'language@example.com'}}});
 for(const name of ['Author','Friend','Library','LibraryOnline','LibraryGuest','LibraryApi','LibraryOther','Worksheet','Localized','Generated']){
  const id='studio-'+name.toLowerCase();users.set(id,{id,email:id+'@example.com',role:'STUDENT',student:{id:id+'-student',firstName:name,lastName:'Studio',totalXP:0,level:1,currentStreak:0,longestStreak:0,version:0,user:{email:id+'@example.com'}}});
  tokens.set(createHash('sha256').update('fixture-'+id+'-refresh').digest('hex').toUpperCase(),id);
 }
 for(const [token,userId] of [['fixture-admin-refresh','admin'],['fixture-language-refresh','language-test']])tokens.set(createHash('sha256').update(token).digest('hex').toUpperCase(),userId);
 const questions=[1,2,3].map(n=>({id:`test-q${n}`,title:`Question ${n}`,question:`Which type stores an integer? (${n})`,correctAnswer:'int',options:[{id:`q${n}-a`,text:'int',order:0},{id:`q${n}-b`,text:'string',order:1},{id:`q${n}-c`,text:'bool',order:2}]}));
 const course={id:'test-course',title:'Existing question bank',description:'Test course',category:'Programming',difficulty:'EASY',completed:0,taskCount:3,totalXP:300,estimatedMinutes:10,levels:[]};
 const student=id=>[...users.values()].find(u=>u.student?.id===id)?.student;
 return createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health'){send(200,{status:'healthy'});return;}
  if(url.pathname==='/v1/chat/completions'){
   let payload='';for await(const chunk of req)payload+=chunk;
   const request=JSON.parse(payload),prompt=request.messages[1].content;
   const input=JSON.parse(prompt.slice(prompt.indexOf('Input: ')+7));
   if(Array.isArray(input.questions)){
    if(req.headers.authorization!=='Bearer fixture-ai-key'){send(401,{error:'Unexpected fixture key.'});return;}
    const language=prompt.includes('to Kazakh.')?'kk':prompt.includes('to Russian.')?'ru':'en';
    const words={Mercury:['Меркурий','Меркурий'],Venus:['Шолпан','Венера'],Earth:['Жер','Земля'],Mars:['Марс','Марс']};
    const phrases={'Which planet is closest to the Sun?':['Күнге ең жақын планета қайсы?','Какая планета ближе всего к Солнцу?'],'Which planet is called the red planet?':['Қызыл планета деп қай планетаны атайды?','Какую планету называют красной планетой?']};
    const translate=value=>language==='en'?value:(words[value]||phrases[value])?.[language==='kk'?0:1]||value.replace('Which type stores an integer?',language==='kk'?'Бүтін санды қай тип сақтайды?':'Какой тип хранит целое число?');
    const questions=input.questions.map(q=>({id:q.id,title:language==='en'?q.title:language==='kk'?'Оқу сұрағы':'Учебный вопрос',question:translate(q.question),options:q.options.map(o=>({id:o.id,text:translate(o.text)}))}));
    send(200,{choices:[{message:{content:JSON.stringify({courseTitle:language==='en'?input.courseTitle:language==='kk'?'Күн жүйесі':'Солнечная система',questions})}}]});return;
   }
   const sentences=input.sourceSentences||[];
   if(req.headers.authorization!=='Bearer fixture-ai-key'||!sentences.some(s=>s.text==='Mercury is the closest planet to the Sun.')){send(400,{error:'Unexpected test source or key.'});return;}
   const questions=[{question:'Which planet is closest to the Sun?',options:['Mercury','Venus','Earth','Mars'],correctAnswer:'Mercury',evidenceId:sentences.find(s=>s.text==='Mercury is the closest planet to the Sun.').id},{question:'Which planet is called the red planet?',options:['Mercury','Venus','Earth','Mars'],correctAnswer:'Mars',evidenceId:sentences.find(s=>s.text==='Mars is called the red planet.').id}].slice(0,input.count);
   send(200,{choices:[{message:{content:JSON.stringify({questions})}}]});return;
  }
  if(req.headers['x-service-key']!==serviceKey){send(401,{message:'Private service authentication required.'});return;}
  if(url.pathname==='/health/ready'){send(200,{status:'healthy'});return;}
  let body={};try{let text='';for await(const chunk of req)text+=chunk;if(text)body=JSON.parse(text);}catch{send(400,{});return;}
  if(url.pathname==='/auth/register'){
   if([...users.values()].some(u=>u.email===body.email)){send(409,{message:'This record already exists.'});return;}
   const id=randomUUID(),sid=randomUUID(),u={id,email:body.email,passwordHash:body.passwordHash,role:'STUDENT',student:{id:sid,firstName:body.firstName,lastName:body.lastName,totalXP:0,level:1,currentStreak:0,longestStreak:0,version:0,user:{email:body.email}}};users.set(id,u);send(200,u);return;
  }
  if(url.pathname==='/auth/find'){send(200,[...users.values()].find(u=>u.email===body.email)||{});return;}
  if(url.pathname==='/auth/token'){tokens.set(body.tokenHash,body.userId);send(200,{ok:true});return;}
  if(url.pathname==='/auth/rotate'){const id=tokens.get(body.tokenHash);if(!id){send(401,{message:'Refresh token expired.'});return;}tokens.delete(body.tokenHash);tokens.set(body.newTokenHash,id);send(200,users.get(id));return;}
  if(url.pathname==='/auth/revoke'){tokens.delete(body.tokenHash);send(200,{ok:true});return;}
  if(url.pathname==='/admin/dashboard'){send(200,{students:users.size-1,courses:1,attempts:0,xp:0,reports:[]});return;}
  if(url.pathname==='/admin/reports'||url.pathname==='/admin/settings'){send(200,[]);return;}
  if(url.pathname.startsWith('/admin/')){send(200,{items:[],total:0});return;}
  if(url.pathname==='/students/me'){send(200,student(url.searchParams.get('studentId'))||{});return;}
  if(url.pathname==='/courses'){send(200,[course]);return;}
  if(url.pathname==='/show/catalog'){send(200,{characters:[{id:'nova',name:'Нова'},{id:'leo',name:'Лео'},{id:'maya',name:'Майя'},{id:'atlas',name:'Атлас'}],courses:[{...course,topics:[]}]});return;}
  if(url.pathname==='/show/active'){send(200,{session:null});return;}
  if(url.pathname==='/multiplayer/questions'){send(200,{courseTitle:course.title,questions});return;}
  if(/^\/tasks\/[^/]+\/start$/.test(url.pathname)){
   const q=questions.find(q=>q.id===url.pathname.split('/')[2]);if(!q){send(404,{message:'Challenge not found.'});return;}
   const sessionId=randomUUID();sessions.set(sessionId,{studentId:body.studentId,taskId:q.id,startedAt:new Date().toISOString()});
   const {correctAnswer,...safe}=q;send(200,{sessionId,startedAt:sessions.get(sessionId).startedAt,task:{...safe,xpReward:100,timeLimit:120,order:1,difficulty:'EASY',topic:{name:'Variables'},level:{order:1,courseId:course.id,course}}});return;
  }
  if(url.pathname==='/game/snapshot'){
   const replay=results.get(body.requestId);if(replay){send(200,{replayed:replay});return;}
   const s=student(body.studentId),q=questions.find(q=>q.id===body.taskId),session=sessions.get(body.sessionId);
   if(!s||!q||!session||session.studentId!==body.studentId||session.taskId!==body.taskId){send(400,{message:'Invalid session.'});return;}
   send(200,{student:s,task:{id:q.id,levelId:'level',topicId:'topic',correctAnswer:q.correctAnswer,xpReward:100,timeLimit:120,explanation:'The correct answer is int.'},attemptCount:0,alreadyCompleted:false,completedTasks:0,correctRun:0,courseCompleted:false,isLeader:false,lastDate:null,elapsedSeconds:Math.floor((Date.now()-new Date(session.startedAt))/1000),hintUsed:false,achievements:[],unlockedIds:[],goals:[]});return;
  }
  if(url.pathname==='/game/commit'){const s=student(body.studentId);Object.assign(s,{totalXP:body.totalXP,level:body.level});const result={isCorrect:body.isCorrect,xpEarned:body.xpEarned,totalXP:body.totalXP,level:body.level,achievements:[],explanation:body.explanation};results.set(body.requestId,result);send(200,result);return;}
  if(['/achievements','/daily-goals','/notifications'].includes(url.pathname)){send(200,[]);return;}
  send(404,{message:'Fixture route not implemented.'});
 });
}
