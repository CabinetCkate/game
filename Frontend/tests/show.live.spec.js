// Opt-in test against the real API + SQL Server. Only new test students are created.
import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {showBank}=require('../../PrismaService/dist/prisma/show-bank.js');
const bank=new Map(showBank.tasks.map(task=>[task.id,task]));
const live=process.env.RUN_SHOW_E2E==='1';
async function register(request,suffix){const response=await request.post('/api/auth/register',{data:{email:`show-${Date.now()}-${suffix}@example.com`,firstName:'Show',lastName:'Test',password:'Student123!',confirmPassword:'Student123!'}});expect(response.ok()).toBeTruthy();return response.json();}
async function api(request,token,path,body){const response=await request[body===undefined?'get':'post']('/api/'+path,{headers:{Authorization:'Bearer '+token},...(body===undefined?{}:{data:body})});expect(response.ok(),await response.text()).toBeTruthy();return response.json();}

test('new students can start every listed topic and a stale character selection recovers',async({page,request})=>{
 test.skip(!live,'Requires live SQL Server stack.');
 page.on('pageerror',error=>console.error('Show page error:',error.message));
 page.on('requestfailed',request=>console.error('Show request failed:',request.url(),request.failure()?.errorText));
 const auth=await register(request,'catalog');
 const catalog=await api(request,auth.accessToken,'show/catalog');
 const csharp=catalog.courses.find(course=>course.id==='csharp');
 expect(csharp.topics.map(topic=>topic.id)).toEqual(['csharp-topic-1']);
 for(const course of catalog.courses)for(const topic of course.topics){
  const show=await api(request,auth.accessToken,'show/start',{courseId:course.id,topicId:topic.id,characterId:'nova'});
  expect(show.phase).toBe('intro');
  const question=await api(request,auth.accessToken,'show/'+show.id+'/next',{questionIndex:0});
  expect(question.phase).toBe('question');expect(question.currentQuestion.taskType).toBe('MULTIPLE_CHOICE');
  await api(request,auth.accessToken,'show/'+show.id+'/abandon',{});
 }
 await page.addInitScript(token=>{sessionStorage.setItem('refreshToken',token);localStorage.setItem('language','ru');localStorage.setItem('showCharacter','removed-character');localStorage.setItem('showSettings',JSON.stringify({muted:true,quality:'low',reducedMotion:true,subtitles:true}));},auth.refreshToken);
 await page.goto('/#show?mode=solo');await expect(page.locator('#show-start')).toBeVisible({timeout:60000});
 await expect(page.locator('[data-character="nova"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#show-course').selectOption('csharp');
 await expect(page.locator('#show-topic option')).toHaveCount(2);
 await page.locator('#show-topic').selectOption('csharp-topic-1');
 await page.locator('#show-start').click();await expect(page.locator('#show-next')).toBeVisible();
 await page.locator('#show-next').click();await expect(page.locator('#show-countdown')).toBeVisible();
 const active=await api(request,auth.accessToken,'show/active');
 expect(active.characterId).toBe('nova');await api(request,auth.accessToken,'show/'+active.id+'/abandon',{});
});
test('real SQL match: four formats, five rounds, save/reload, ownership and idempotent XP',async({page,request})=>{
 test.skip(!live,'RUN_SHOW_E2E=1 requires the live stack, additive migration, compiled service and seed.');
 const auth=await register(request,'play'),other=await register(request,'other');
 await page.addInitScript(token=>{if(!sessionStorage.getItem('refreshToken'))sessionStorage.setItem('refreshToken',token);localStorage.setItem('language','ru');localStorage.setItem('showSettings',JSON.stringify({muted:true,quality:'medium',reducedMotion:false,subtitles:true,volume:.2}));},auth.refreshToken);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/#show?mode=solo');await expect(page.locator('#show-start')).toBeVisible({timeout:60000});
 await expect(page.locator('.show-viewport canvas')).toBeVisible();await expect(page.locator('[data-character]')).toHaveCount(4);
 await page.locator('#show-course').selectOption('informatics-show');await page.locator('[data-character="nova"]').click();await page.locator('#show-start').click();await expect(page.locator('#show-next')).toBeVisible();
 let game=await api(request,auth.accessToken,'show/active');expect(game.phase).toBe('intro');
 const foreign=await request.get('/api/show/'+game.id,{headers:{Authorization:'Bearer '+other.accessToken}});expect(foreign.status()).toBe(404);
 await page.locator('#show-next').click();await expect(page.locator('#show-countdown')).toBeVisible();
 await page.reload();await expect(page.locator('#show-countdown')).toBeVisible({timeout:60000});const resumed=await api(request,auth.accessToken,'show/active');expect(resumed.id).toBe(game.id);expect(resumed.questionIndex).toBe(0);
 const rounds=new Set(),formats=new Set();let firstReplay,totalXP=0;
 await mkdir('../artifacts',{recursive:true});
 for(let index=0;index<10;index++){
  game=await api(request,auth.accessToken,'show/'+game.id);const q=game.currentQuestion,task=bank.get(q.taskId);expect(task).toBeTruthy();expect(game.questionIndex).toBe(index);rounds.add(q.round);formats.add(q.taskType);
  expect(q.correctAnswer).toBeUndefined();expect(q.explanation).toBeUndefined();expect(q.hint).toBeUndefined();expect(q.content?.correctAnswer).toBeUndefined();
  if(index===0){await page.screenshot({path:'../artifacts/show-studio-1440.png'});const forged=await request.post('/api/show/'+game.id+'/answer',{headers:{Authorization:'Bearer '+auth.accessToken},data:{questionIndex:index,answer:task.correctAnswer,requestId:crypto.randomUUID(),xpEarned:999999}});expect(forged.status()).toBe(400);}
  if(index===2){await page.locator('#show-hint').click();await expect(page.locator('.show-hint')).toBeVisible();}
  const sent=page.waitForRequest(r=>r.url().endsWith('/show/'+game.id+'/answer')&&r.method()==='POST');
  if(q.taskType==='MULTIPLE_CHOICE'){const option=q.options.findIndex(o=>o.text===task.correctAnswer);await page.locator('[data-answer="'+option+'"]').click();await page.locator('#show-submit').click();}
  else if(q.taskType==='SEQUENCE'){for(const item of JSON.parse(task.correctAnswer)){const option=q.content.items.indexOf(item);await page.locator('[data-sequence="'+option+'"]').click();}await page.locator('#show-submit').click();}
  else if(q.taskType==='MATCHING'){const answers=JSON.parse(task.correctAnswer);for(const [i,left]of q.content.left.entries())await page.locator('[data-match="'+i+'"]').selectOption(answers[left]);await page.locator('#show-submit').click();}
  else{await page.locator('#show-numeric').fill(task.correctAnswer);await page.locator('#show-submit').click();}
  const submitted=(await sent).postDataJSON();if(index<9)await expect(page.locator('.show-feedback-panel')).toBeVisible();else await expect(page.locator('.show-results-panel')).toBeVisible();
  const current=await api(request,auth.accessToken,'show/'+game.id);expect(current.feedback.isCorrect).toBe(true);expect(current.feedback.totalXP).toBeGreaterThanOrEqual(totalXP);totalXP=current.feedback.totalXP;
  const replay=await api(request,auth.accessToken,'show/'+game.id+'/answer',submitted);expect(replay.feedback.totalXP).toBe(totalXP);expect(replay.participants).toEqual(current.participants);if(index===0)firstReplay=submitted;
  if(index<9){await page.locator('#show-next').click();await expect(page.locator('#show-countdown')).toBeVisible();}
 }
 expect([...rounds]).toHaveLength(5);expect([...formats]).toHaveLength(4);expect(game.adaptive.source).toBe('fallback');
 const final=await api(request,auth.accessToken,'show/'+game.id);expect(final.status).toBe('COMPLETED');expect(final.summary.correct).toBe(10);expect(final.winnerId).toBe('player');
 await page.screenshot({path:'../artifacts/show-results-1440.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'../artifacts/show-results-390.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const statistics=await api(request,auth.accessToken,'statistics');expect(statistics.attempts).toBe(10);expect(statistics.accuracy).toBe(100);expect(statistics.totalXP).toBe(totalXP);expect(statistics.averageTimeSeconds).toBeGreaterThanOrEqual(0);
 const board=await api(request,auth.accessToken,'leaderboard');expect(board.me.xp).toBe(totalXP);expect(board.entries.some(p=>p.id.startsWith('bot-'))).toBe(false);
 const achievements=await api(request,auth.accessToken,'achievements');expect(achievements.find(a=>a.code==='first-step').unlockedAt).toBeTruthy();const goals=await api(request,auth.accessToken,'daily-goals');expect(goals[0].completed).toBe(true);
 const replayOld=await api(request,auth.accessToken,'show/'+game.id+'/answer',firstReplay);expect(replayOld.feedback.isCorrect).toBe(true);expect((await api(request,auth.accessToken,'statistics')).totalXP).toBe(totalXP);expect(errors).toEqual([]);
 await page.reload();await expect(page.locator('#show-start')).toBeVisible({timeout:60000});expect(await api(request,auth.accessToken,'show/active')).toBeNull();
});
test('mobile question keeps all four answers reachable',async({page,request})=>{
 test.skip(!live,'Requires live SQL Server stack.');
 const auth=await register(request,'mobile');await page.addInitScript(token=>{sessionStorage.setItem('refreshToken',token);localStorage.setItem('language','ru');localStorage.setItem('showSettings',JSON.stringify({muted:true,quality:'low',reducedMotion:true,subtitles:true}));},auth.refreshToken);
 await page.setViewportSize({width:390,height:844});await page.goto('/#show?mode=solo');await expect(page.locator('#show-start')).toBeVisible({timeout:60000});await page.locator('#show-course').selectOption('informatics-show');await page.locator('#show-start').click();await page.locator('#show-next').click();await expect(page.locator('[data-answer]')).toHaveCount(4);
 for(const answer of await page.locator('[data-answer]').all()){await expect(answer).toBeVisible();expect(await answer.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})).toBe(true);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'../artifacts/show-question-390.png',fullPage:true});
 let game=await api(request,auth.accessToken,'show/active');await api(request,auth.accessToken,'show/'+game.id+'/abandon',{});
});
test('leaving while models load releases the studio and restores navigation',async({page,request})=>{
 test.skip(!live,'Requires live stack.');const auth=await register(request,'load-exit');await page.addInitScript(token=>{sessionStorage.setItem('refreshToken',token);localStorage.setItem('language','ru');},auth.refreshToken);
 let release;const blocked=new Promise(resolve=>release=resolve);await page.route('**/assets/characters/manifest.json',async route=>{await blocked;await route.continue();});await page.goto('/#show?mode=solo',{waitUntil:'domcontentloaded'});await expect(page.locator('.show-loader')).toBeVisible();await page.locator('.show-loader-back').click();release();await expect(page.locator('body')).not.toHaveClass(/show-open/);await expect(page.locator('.sidebar')).toBeVisible();await expect(page.locator('.show-viewport canvas')).toHaveCount(0);await expect(page.locator('.show-dashboard-banner')).toBeVisible();
});
