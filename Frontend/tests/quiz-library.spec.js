import {test,expect} from '@playwright/test';
import {docx,pdf} from './fixtures/quiz-documents.mjs';
test.setTimeout(90000);
const ready='1. What is two plus two?\nA) 3\nB) 4\nC) 5\nAnswer: B';
const lecture='Mercury is the closest planet to the Sun. Venus has a thick atmosphere. Earth has one natural satellite. Mars is called the red planet.';
async function player(browser,name,viewport={width:1366,height:900}){
 const context=await browser.newContext({viewport});
 await context.addInitScript(({name})=>{if(!sessionStorage.getItem('refreshToken'))sessionStorage.setItem('refreshToken','fixture-studio-'+name.toLowerCase()+'-refresh');localStorage.setItem('language','en');localStorage.setItem('showSettings',JSON.stringify({quality:'low',muted:true,reducedMotion:true}));},{name});
 return {context,page:await context.newPage()};
}
test('a Kazakh SQL worksheet accepts a separate answer key through the save form',async({browser})=>{
 const {page,context}=await player(browser,'Worksheet');
 const source=`SQL бойынша тест
Аты-жөні: __________ Сыныбы: __________
Нұсқаулық: әр сұраққа бір дұрыс жауапты таңдаңыз.
1. SQL тілінде кестеден деректерді таңдау үшін қай оператор қолданылады?
A) DELETE
B) SELECT
C) UPDATE
D) INSERT
2. Жолдарды берілген шарт бойынша сүзу үшін қай сөйлем қолданылады?
A) ORDER BY
B) GROUP BY
C) WHERE
D) FROM
Жауаптар кілті
1 — B    2 — C`;
 try {
  await page.goto('/#show?mode=solo');await page.locator('#show-create-topic').click();
  await page.locator('.quiz-creator [value=ready]').check();
  await page.locator('.quiz-creator [name=title]').fill('SQL бойынша тест');
  await page.locator('.quiz-creator [name=source]').fill(source);
  await page.locator('.quiz-creator [type=submit]').click();
  await expect(page.locator('#quiz-saved-preview')).toBeVisible();
  await expect(page.locator('#quiz-saved-preview .quiz-preview-list > li')).toHaveCount(2);
  await expect(page.locator('#quiz-saved-preview .quiz-key')).toHaveText(['SELECT ✓','WHERE ✓']);
  await expect(page.locator('#quiz-saved-preview')).not.toContainText('Аты-жөні');
  await page.locator('#use-saved-quiz').click();await page.reload();
  await expect(page.locator('#show-saved-quiz option').filter({hasText:'SQL бойынша тест'})).toHaveCount(1);
 } finally {await context.close();}
});

test('a ready test file is saved, survives reload, and awards points in bot practice',async({browser})=>{
 const {page,context}=await player(browser,'Library');const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/#show?mode=solo');await page.locator('#show-create-topic').click();
  await page.locator('.quiz-creator [value=ready]').check();
  await page.locator('.quiz-creator [name=file]').setInputFiles({name:'Arithmetic.txt',mimeType:'text/plain',buffer:Buffer.from(ready)});
  await expect(page.locator('.quiz-creator [name=source]')).toHaveValue(ready);
  await page.locator('.quiz-creator [type=submit]').click();
  await expect(page.locator('.quiz-save-success')).toBeVisible();await expect(page.locator('.quiz-key')).toHaveText('4 ✓');
  await page.screenshot({path:'../artifacts/quiz-library-saved.png'});
  await page.locator('#use-saved-quiz').click();await page.reload();
  await expect(page.locator('#show-saved-quiz option').filter({hasText:'Arithmetic'})).toHaveCount(1);
  await page.locator('#show-play-saved').click();await expect(page.locator('.room-code,#join-room,#start-game')).toHaveCount(0);
  await expect(page.locator('[data-option]:enabled')).toHaveCount(3,{timeout:15000});
  await expect(page.locator('.show-scores')).toBeVisible();
  await page.locator('[data-option]').filter({hasText:/^[A-H]\s*3$/}).click();await expect(page.locator('#confirm-solo-answer')).toBeEnabled();
  await page.locator('[data-option]').filter({hasText:/^[A-H]\s*4$/}).click();
  await page.locator('#confirm-solo-answer').click();
  await expect(page.locator('.quiz-round-points')).toHaveText(/\+1[,\s]?\d{3} match points/,{timeout:3000});
  await page.screenshot({path:'../artifacts/quiz-library-bot-points.png'});
  await page.locator('#next-round').click();await expect(page.locator('.show-online-results')).toBeVisible();
  await expect(page.locator('.show-online-results a[href="#statistics"]')).toHaveCount(0);await expect(page.locator('.show-modes')).toBeHidden();
  await page.locator('#exit-game').click();await expect(page.locator('.show-modes')).toBeVisible();await expect(page.locator('#show-saved-quiz')).toBeVisible();
  expect(errors).toEqual([]);
 }finally{await context.close();}
});
test('saved ready tests create online rooms with names, portraits and points for two players',async({browser})=>{
 const host=await player(browser,'LibraryOnline'),guest=await player(browser,'LibraryGuest',{width:390,height:844});
 try{
  await host.page.goto('/#show?mode=online');await expect(host.page.locator('.connection-state')).toHaveText('Connected');
  await host.page.locator('[name=source]').selectOption('ready');
  await host.page.locator('[name=title]').fill('Online arithmetic');await host.page.locator('[name=roundSeconds]').fill('10');
  await host.page.locator('#online-quiz-file').setInputFiles({name:'online-test.txt',mimeType:'text/plain',buffer:Buffer.from(ready)});
  await expect(host.page.locator('[name=sourceText]')).toHaveValue(ready);
  await host.page.locator('#create-room .btn-primary').click();await expect(host.page.locator('.room-code')).toBeVisible();const code=await host.page.locator('.room-code').innerText();
  await guest.page.goto('/#show?mode=online&room='+code);await expect(host.page.locator('.quiz-player-list li')).toHaveCount(2);
  await expect(host.page.locator('.quiz-player-list')).toContainText('LibraryOnline Studio');await expect(host.page.locator('.quiz-player-list')).toContainText('LibraryGuest Studio');
  await host.page.locator('#start-game').click();
  for(const page of [host.page,guest.page]){await expect(page.locator('[data-option]:enabled')).toHaveCount(3,{timeout:15000});await page.locator('[data-option]').filter({hasText:/^[A-H]\s*4$/}).click();}
  for(const page of [host.page,guest.page])await expect(page.locator('.quiz-round-points')).toContainText('match points',{timeout:15000});
  await guest.page.screenshot({path:'../artifacts/quiz-library-online-mobile.png'});
  expect(await guest.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await host.page.locator('#next-round').click();
  await expect(host.page.locator('.show-online-results')).toBeVisible();
  for(const page of [host.page,guest.page])await page.locator('#exit-game').click();
 }finally{await host.context.close();await guest.context.close();}
});
test('saved English questions use the selected language in bot practice and preserve changed answers',async({browser})=>{
 const {page,context}=await player(browser,'Localized');
 try {
  await page.goto('/#show?mode=solo');
  await page.locator('.show-top [data-language]').selectOption('kk');
  await page.locator('#show-create-topic').click();await page.locator('.quiz-creator [value=ready]').check();
  await page.locator('.quiz-creator [name=title]').fill('Planets');
  await page.locator('.quiz-creator [name=source]').fill('1. Which planet is closest to the Sun?\nA) Mercury\nB) Venus\nC) Earth\nD) Mars\nAnswer: A');
  await page.locator('.quiz-creator [type=submit]').click();await expect(page.locator('.quiz-save-success')).toBeVisible();
  await page.locator('#use-saved-quiz').click();await page.locator('#show-play-saved').click();
  await expect(page.locator('.quiz-stage .question')).toHaveText('Күнге ең жақын планета қайсы?',{timeout:15000});
  await expect(page.locator('.room-code,#join-room,#start-game')).toHaveCount(0);
  await expect(page.locator('.show-modes')).toBeHidden();
  await page.locator('[data-option]').filter({hasText:'Шолпан'}).click();
  await page.locator('[data-option]').filter({hasText:'Меркурий'}).click();
  await expect(page.locator('.answer-selected')).toContainText('Меркурий');
  const selected=await page.locator('.answer-selected').getAttribute('data-option');
  await page.locator('.show-top [data-language]').selectOption('ru');
  await expect(page.locator('.quiz-stage .question')).toHaveText('Какая планета ближе всего к Солнцу?');
  await expect(page.locator('.answer-selected')).toHaveAttribute('data-option',selected);
  await expect(page.locator('.answer-correct,.answer-wrong')).toHaveCount(0);
  await expect(page.locator('#show-course')).toHaveCount(0);
  await page.locator('#confirm-solo-answer').click();
  await expect(page.locator('.quiz-feedback.correct')).toBeVisible({timeout:3000});
  await page.screenshot({path:'../artifacts/quiz-localized-bot-answer.png'});
  await page.locator('#next-round').click();await expect(page.locator('.show-online-results')).toBeVisible();
  await expect(page.locator('.show-modes')).toBeHidden();
  await page.locator('#exit-game').click();await expect(page.locator('.show-modes')).toBeVisible();
  await expect(page.locator('#show-saved-quiz')).toBeVisible();
 } finally {await context.close();}
});

test('generated lecture questions and their correct answers are saved in the selected language',async({request})=>{
 const session=await (await request.post('/api/auth/refresh',{data:{refreshToken:'fixture-studio-generated-refresh'}})).json();
 const response=await request.post('/api/quiz-library',{headers:{Authorization:'Bearer '+session.accessToken},data:{title:'Planets',sourceText:lecture,sourceKind:'text',questionCount:2,language:'kk'}});
 expect(response.status()).toBe(200);const quiz=await response.json();
 expect(quiz.language).toBe('kk');expect(quiz.questions[0].question).toBe('Күнге ең жақын планета қайсы?');
 expect(quiz.questions[0].correctAnswer).toBe('Меркурий');
 expect(quiz.questions[0].options.filter(o=>o.text===quiz.questions[0].correctAnswer)).toHaveLength(1);
});

test('lecture AI saves every question and the library enforces account ownership',async({request})=>{
 const tokens=await (await request.post('/api/auth/refresh',{data:{refreshToken:'fixture-studio-libraryapi-refresh'}})).json();
 const headers={Authorization:'Bearer '+tokens.accessToken};
 const response=await request.post('/api/quiz-library',{headers,data:{title:'Solar study',sourceText:lecture,sourceKind:'text',questionCount:2,language:'en'}});
 expect(response.status()).toBe(200);const quiz=await response.json();expect(quiz.questions).toHaveLength(2);
 const loaded=await (await request.get('/api/quiz-library/'+quiz.id,{headers})).json();expect(loaded.questions).toEqual(quiz.questions);expect(loaded.sourceText).toBe(lecture);
 const other=await (await request.post('/api/auth/refresh',{data:{refreshToken:'fixture-studio-libraryother-refresh'}})).json();
 expect((await request.get('/api/quiz-library/'+quiz.id,{headers:{Authorization:'Bearer '+other.accessToken}})).status()).toBe(404);
 const invalid=await request.post('/api/quiz-library',{headers,data:{title:'Bad test',sourceText:'1. No key?\nA) Yes\nB) No',sourceKind:'ready',questionCount:1,language:'en'}});expect(invalid.status()).toBe(400);
 const extracted=await request.post('/api/quiz-library/extract',{headers,data:{name:'lecture.txt',base64:Buffer.from(lecture).toString('base64')}});expect((await extracted.json()).text).toBe(lecture);
 for(const [name,buffer,text] of [['lecture.docx',docx('Қазақша дәріс: Жердің бір серігі бар.'),'Қазақша дәріс'],['lecture.pdf',pdf('Mercury is the closest planet to the Sun.'),'Mercury']]){
  const response=await request.post('/api/quiz-library/extract',{headers,data:{name,base64:buffer.toString('base64')}});expect(response.status()).toBe(200);expect((await response.json()).text).toContain(text);
 }
});
