import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url),{showBank}=require('../PrismaService/dist/prisma/show-bank.js'),bank=new Map(showBank.tasks.map(t=>[t.id,t]));
const base='http://localhost:5080/api/';
async function call(path,body,token='',status=200){if(body!==undefined&&path.endsWith('/answer')){const state=await call(path.slice(0,-7),undefined,token);if(state.phase==='question'&&state.questionIndex===body.questionIndex){const wait=Date.parse(state.currentQuestion.startedAt)-Date.parse(state.serverNow);if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait+100));}}const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,status,path+' '+JSON.stringify(data));return data;}
const register=suffix=>call('auth/register',{email:'server-show-'+Date.now()+'-'+suffix+'@example.com',firstName:'Server',lastName:'Test',password:'Student123!',confirmPassword:'Student123!'});
const auth=await register('player'),other=await register('foreign'),token=auth.accessToken;
let show=await call('show/start',{courseId:'informatics-show',characterId:'nova'},token);const id=show.id;
await call('show/'+id,undefined,other.accessToken,404);
assert.equal((await call('show/active',undefined,token)).id,id);
show=await call('show/'+id+'/next',{questionIndex:0},token);
const rounds=new Set(),formats=new Set(),replies=[];
for(let index=0;index<10;index++){
 const question=show.currentQuestion,task=bank.get(question.taskId);assert.ok(task);assert.equal(question.index,index);assert.equal(question.correctAnswer,undefined);assert.equal(question.explanation,undefined);rounds.add(question.round);formats.add(question.taskType);
 if(index===2)show=await call('show/'+id+'/hint',{questionIndex:index},token);
 if(index===4){show=await call('show/'+id+'/wager',{questionIndex:index,wager:100},token);assert.equal(show.currentQuestion.wagerLocked,true);await call('show/'+id+'/wager',{questionIndex:index,wager:0},token,409);assert.equal((await call('show/'+id,undefined,token)).currentQuestion.wager,100);}
 const submission={questionIndex:index,answer:task.correctAnswer,requestId:crypto.randomUUID(),wager:index===4?100:0};
 show=await call('show/'+id+'/answer',submission,token);assert.equal(show.feedback.isCorrect,true);const xp=show.feedback.totalXP;
 const duplicate=await call('show/'+id+'/answer',submission,token);assert.equal(duplicate.feedback.totalXP,xp);assert.deepEqual(duplicate.participants,show.participants);replies.push(submission);
 if(index<9)show=await call('show/'+id+'/next',{questionIndex:index},token);
}
assert.equal(show.status,'COMPLETED');assert.equal(show.summary.correct,10);assert.equal(rounds.size,5);assert.equal(formats.size,4);const stats=await call('statistics',undefined,token);assert.equal(stats.attempts,10);assert.equal(stats.accuracy,100);assert.equal((await call('leaderboard',undefined,token)).me.xp,stats.totalXP);assert.equal((await call('show/active',undefined,token)),null);
await call('show/'+id+'/answer',replies[0],token);assert.equal((await call('statistics',undefined,token)).totalXP,stats.totalXP);
const results={date:new Date().toISOString(),sessionId:id,rounds:[...rounds],formats:[...formats],correct:10,totalXP:stats.totalXP,checks:['ownership','keys private','five rounds','four formats','persistent resume','committed wager','duplicate XP prevention','old request replay','real statistics','real leaderboard','complete match']};await fs.writeFile('artifacts/show-server-report.json',JSON.stringify(results,null,2));console.log(results);
