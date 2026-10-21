import {test,expect} from '@playwright/test';

async function question(page,wager=false){
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  // HTTP LAN origins expose getRandomValues, but not randomUUID.
  Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true});
  localStorage.setItem('language','ru');
  localStorage.setItem('showSettings',JSON.stringify({muted:true,quality:'low',reducedMotion:true}));
 });
 await page.goto('/');
 await page.evaluate(async(wager)=>{
  document.body.innerHTML='<main id="content"></main>';
  history.replaceState(null,'','#show?mode=solo');
  const now=Date.now();
  let session={id:'click-test',phase:'question',questionIndex:0,questionCount:10,participants:[{id:'player',name:'Test',characterId:'nova',score:0,isBot:false}],adaptive:{difficulty:'EASY'},currentQuestion:{index:0,round:'classic',roundTitle:'Классика',title:'Проверка ответов',question:'Какой вариант выбран?',rules:'Выберите один ответ.',taskType:'MULTIPLE_CHOICE',content:{},options:['Первый','Второй','Третий','Четвёртый'].map((text,index)=>({id:String(index),text})),startedAt:new Date(now-1000).toISOString(),deadline:new Date(now+120000).toISOString(),timeLimit:120}};
  if(wager){session.currentQuestion={...session.currentQuestion,round:'wager',maxWager:300,wager:0,wagerLocked:false};session.participants[0].score=1000;}
  window.answerTest={requests:[],failures:0,wagers:[]};
  const api=async(path,options)=>{
   if(path.startsWith('show/catalog'))return {characters:['nova','leo','maya','atlas'].map(id=>({id,name:id})),courses:[]};
   if(path.endsWith('/wager')){window.answerTest.wagers.push(options.body.wager);session.currentQuestion.wagerLocked=true;session.currentQuestion.wager=options.body.wager;}
   if(path.endsWith('/answer')){
    window.answerTest.requests.push(structuredClone(options.body));
    if(window.answerTest.failures-->0)throw Error('Temporary connection error');
    session={...session,phase:'feedback',feedback:{isCorrect:true,scoreDelta:1000,xpEarned:100,totalXP:100,level:1,explanation:'Ответ принят.',achievements:[]}};
   }
   return {...structuredClone(session),serverNow:new Date().toISOString()};
  };
  const {showPage}=await import('/src/show.js');
  window.disposeAnswerTest=await showPage(document.querySelector('#content'),{api,refresh:async()=>{},getToken:()=>'',icon:()=>'',hydrate:()=>{},toast:()=>{},student:{id:'player',firstName:'Test'}});
 },wager);
 await expect(page.locator('[data-answer]')).toHaveCount(4);
 return errors;
}

for(const mobile of [false,true])test(`solo answers submit over LAN HTTP with ${mobile?'touch':'mouse'}`,async({browser})=>{
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:768},hasTouch:mobile});
 try{
  const page=await context.newPage(),errors=await question(page);
  const answer=page.locator('[data-answer="3"]');
  if(mobile)await answer.tap();else await answer.click();
  await expect(answer).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>window.answerTest.requests.length)).toBe(0);
  await page.locator('[data-answer="0"]').click();
  await answer.click();
  await page.locator('#show-submit').click();
  await expect(page.locator('.show-feedback-panel')).toBeVisible();
  const requests=await page.evaluate(()=>window.answerTest.requests);
  expect(requests).toHaveLength(1);expect(requests[0].answer).toBe('Четвёртый');
  expect(requests[0].requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('selecting a stake and clicking an answer commits the stake and submits',async({page})=>{
 await question(page,true);
 await page.locator('#show-wager').fill('150');
 await page.locator('[data-answer="1"]').click();
 await page.locator('#show-submit').click();
 await expect(page.locator('.show-feedback-panel')).toBeVisible();
 const result=await page.evaluate(()=>window.answerTest);
 expect(result.wagers).toEqual([150]);expect(result.requests).toHaveLength(1);expect(result.requests[0].wager).toBe(150);
});

test('solo keyboard answers retry with the same request ID after a connection failure',async({page})=>{
 const errors=await question(page);
 await page.evaluate(()=>window.answerTest.failures=1);
 await page.keyboard.press('2');await page.keyboard.press('Enter');await expect(page.locator('.show-error')).toBeVisible();
 await expect(page.locator('[data-answer="1"]')).toBeEnabled();
 await page.keyboard.press('2');await page.keyboard.press('Enter');await expect(page.locator('.show-feedback-panel')).toBeVisible();
 const requests=await page.evaluate(()=>window.answerTest.requests);
 expect(requests).toHaveLength(2);expect(requests[0].answer).toBe('Второй');
 expect(requests[1].requestId).toBe(requests[0].requestId);expect(errors).toEqual([]);
});
