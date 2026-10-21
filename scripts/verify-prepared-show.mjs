import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes,pbkdf2Sync,randomUUID} from 'node:crypto';

const environment=Object.fromEntries((await readFile(new URL('../.env',import.meta.url),'utf8')).split(/\r?\n/).filter(line=>line.includes('=')&&!line.trimStart().startsWith('#')).map(line=>{const split=line.indexOf('=');return [line.slice(0,split).trim(),line.slice(split+1).trim().replace(/^(['"])(.*)\1$/,'$2')];}));
const base=process.env.DATA_SERVICE_TEST_URL||'http://127.0.0.1:4000';
const key=process.env.DATA_SERVICE_KEY||environment.DATA_SERVICE_KEY;
assert.ok(key,'Private data service key must be configured.');
async function call(path,body,status=200){
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'X-Service-Key':key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal(response.status,status,`Unexpected status at ${path}`);
  return response.json();
}
function passwordHash(){
  const salt=randomBytes(16),header=Buffer.alloc(13);header[0]=1;header.writeUInt32BE(2,1);header.writeUInt32BE(100000,5);header.writeUInt32BE(16,9);
  return Buffer.concat([header,salt,pbkdf2Sync(randomBytes(32),salt,100000,32,'sha512')]).toString('base64');
}

// This dedicated fixture has a random unknown password and receives no XP.
const email='prepared-show-verification@example.test';
let account=await call('/auth/find',{email});
if(!account.student)account=await call('/auth/register',{email,passwordHash:passwordHash(),firstName:'Prepared',lastName:'Verification'});
const studentId=account.student.id;
const active=await call('/show/active?studentId='+encodeURIComponent(studentId));
if(active.session)await call(`/show/${active.session.id}/abandon`,{studentId});
let session;
try{
  for(const language of ['ru','kk','en']){
    const catalog=await call(`/show/catalog?studentId=${encodeURIComponent(studentId)}&language=${language}`);
    assert.equal(catalog.courses.length,6);
    assert.equal(catalog.courses.reduce((count,course)=>count+course.taskCount,0),86);
    assert.ok(catalog.courses.some(course=>course.id==='literature-show'));
    assert.equal(catalog.courses.some(course=>['csharp','sql','web'].includes(course.id)),false);
  }
  session=await call('/show/start',{studentId,courseId:'math-show',characterId:'nova',language:'kk'});
  session=await call(`/show/${session.id}/next`,{studentId,questionIndex:0,language:'kk'});
  const question=session.currentQuestion;
  const remainingPreview=Date.parse(question.startedAt)-Date.parse(session.serverNow);
  assert.ok(remainingPreview>4400&&remainingPreview<=5000,'Three-second TV reading plus a two-second camera return');
  assert.equal(Date.parse(question.deadline)-Date.parse(question.startedAt),question.timeLimit*1000,'Full answer time starts after the presentation');
  await call(`/show/${session.id}/snapshot`,{studentId,questionIndex:0,requestId:randomUUID(),answer:question.options[0].id,language:'kk'},409);
  const english=(await call(`/show/${session.id}?studentId=${encodeURIComponent(studentId)}&language=en`)).session;
  assert.equal(english.currentQuestion.taskId,question.taskId);
  assert.equal(english.currentQuestion.startedAt,question.startedAt);
  assert.equal(english.currentQuestion.deadline,question.deadline);
  assert.deepEqual(english.currentQuestion.options.map(option=>option.id),question.options.map(option=>option.id));
  assert.notEqual(english.currentQuestion.question,question.question);
  assert.equal(english.currentQuestion.correctAnswer,undefined);
  assert.equal(english.currentQuestion.explanation,undefined);
  assert.equal(english.feedback,null);
  const literature=await call('/multiplayer/questions?courseId=literature-show');
  assert.equal(literature.questions.length,10);
  assert.ok(literature.questions.every(question=>['ru','kk','en'].every(language=>question.translations[language]?.options.every((option,index)=>option.id===question.options[index].id))));
  const report={status:'passed',subjects:6,preparedQuestions:86,languages:['ru','kk','en'],presentationMilliseconds:5000,remainingPreviewMilliseconds:remainingPreview,earlyAnswerRejected:true,languageSwitchPreservesQuestionAndClock:true,preparedMultiplayerTranslationsVerified:true};
  await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
  await writeFile(new URL('../artifacts/prepared-show-report.json',import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}finally{
  if(session)await call(`/show/${session.id}/abandon`,{studentId,language:'kk'});
}
