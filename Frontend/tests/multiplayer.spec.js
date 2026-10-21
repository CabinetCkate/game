import {test,expect} from '@playwright/test';

test.setTimeout(90000);

test('Two browsers play a real SignalR match, reconnect, change language and reach final scores',async({browser,request})=>{
 const contexts=[];const errors=[];
 async function player(name){const response=await request.post('/api/auth/register',{data:{firstName:name,lastName:'Player',email:`${name}-${crypto.randomUUID()}@example.com`,password:'Abcdef1!',confirmPassword:'Abcdef1!'}});expect(response.ok()).toBeTruthy();const session=await response.json();const context=await browser.newContext();contexts.push(context);await context.addInitScript(token=>{if(!sessionStorage.getItem('refreshToken'))sessionStorage.setItem('refreshToken',token);if(!localStorage.getItem('language'))localStorage.setItem('language','en');localStorage.setItem('showSettings',JSON.stringify({quality:'low',muted:true}));},session.refreshToken);const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('/#multiplayer');await expect(page.locator('.connection-state')).toHaveText('Connected');return page;}
 try{
  const host=await player('Host'),guest=await player('Guest');
  await expect(host.locator('.sidebar a[href="#multiplayer"]')).toHaveCount(0);await expect(host.locator('.show-viewport canvas')).toBeVisible();
  await host.locator('[data-online-avatar="maya"]').click();await expect(host.locator('[name=avatarId]')).toHaveValue('maya');
  await guest.locator('[data-online-avatar="leo"]').click();await expect(guest.locator('[name=avatarId]')).toHaveValue('leo');
  await host.locator('[name=questionCount]').fill('2');await host.locator('[name=code]').fill('ABC234');
  for(const [language,heading,status,join] of [['kk','Өз сұрақтарың. Онлайн жарыс.','Қосылды','Қосылу'],['ru','Твои вопросы. Живое соревнование.','Подключено','Войти'],['en','Your questions. A live competition.','Connected','Join']]){
   await host.locator('.show-top [data-language]').selectOption(language);await expect(host.locator('.online-heading h1')).toHaveText(heading);await expect(host.locator('.connection-state')).toHaveText(status);
   await expect(host.locator('#join-room button')).toHaveText(join);await expect(host.locator('[name=questionCount]')).toHaveValue('2');await expect(host.locator('[name=code]')).toHaveValue('ABC234');
  }
  await host.locator('[name=source]').selectOption('course');await host.locator('[name=questionCount]').fill('2');await host.locator('[name=roundSeconds]').fill('10');await host.getByRole('button',{name:'Create a room',exact:true}).click();await expect(host.locator('.room-code')).toBeVisible();const code=await host.locator('.room-code').innerText();
  await guest.locator('[name=code]').fill(code);await guest.getByRole('button',{name:'Join',exact:true}).click();await expect(host.locator('.quiz-player-list li')).toHaveCount(2);await expect(guest.locator('.quiz-player-list li')).toHaveCount(2);
  await host.locator('[data-online-avatar="atlas"]').click();await expect(host.locator('[data-online-avatar="atlas"]')).toHaveAttribute('aria-pressed','true');
  await host.getByRole('button',{name:'Start game'}).click();await expect(host.locator('.show-preview-note')).toBeVisible();await expect(host.locator('[data-option]')).toHaveCount(0);
  for(const page of [host,guest]){await expect(page.locator('.room-code,.quiz-player-list,.online-heading')).toHaveCount(0);await expect(page.locator('.show-scores')).toBeHidden();}
  await expect(host.locator('.quiz-stage .question')).toBeVisible({timeout:10000});const firstQuestion=await host.locator('.quiz-stage .question').innerText();await expect(guest.locator('.quiz-stage .question')).toHaveText(firstQuestion);
  const optionIds=await host.locator('[data-option]').evaluateAll(options=>options.map(o=>o.dataset.option));
  await host.getByRole('button',{name:/A int/}).click();await expect(host.locator('.answer-selected')).toHaveCount(1);await expect(host.locator('.answer-correct,.answer-wrong')).toHaveCount(0);await expect(guest.locator('.answer-correct,.answer-wrong')).toHaveCount(0);
  await host.locator('.show-top [data-language]').selectOption('kk');await expect(host.locator('.quiz-stage .question')).toHaveText(firstQuestion.replace('Which type stores an integer?','Бүтін санды қай тип сақтайды?'));
  expect(await host.locator('[data-option]').evaluateAll(options=>options.map(o=>o.dataset.option))).toEqual(optionIds);await expect(host.locator('.answer-selected')).toHaveCount(1);await expect(host.locator('.answer-correct,.answer-wrong')).toHaveCount(0);await expect(guest.locator('.quiz-stage .question')).toHaveText(firstQuestion);
  await guest.getByRole('button',{name:/B string/}).click();await expect(guest.locator('[data-option]:enabled')).toHaveCount(3);await guest.getByRole('button',{name:/C bool/}).click();await guest.getByRole('button',{name:/B string/}).click();await expect(host.locator('.answer-correct')).toHaveCount(1,{timeout:15000});await expect(guest.locator('.answer-wrong')).toHaveCount(1);await expect(guest.locator('.answer-correct')).toHaveCount(1);
  await guest.reload();await expect(guest.locator('.room-code,.quiz-player-list,.online-heading')).toHaveCount(0);await expect(guest.locator('.answer-wrong')).toHaveCount(1);await expect(guest.locator('.answer-correct')).toHaveCount(1);
  await expect(host.locator('.room-code,.quiz-player-list,.online-heading')).toHaveCount(0);
  await host.getByRole('button',{name:'Келесі сұрақ',exact:true}).click();await expect(host.locator('.quiz-stage .question')).toBeVisible({timeout:10000});await expect(host.locator('.quiz-stage .question')).not.toHaveText(firstQuestion);await expect(guest.locator('.quiz-stage [data-option]:enabled')).toHaveCount(3,{timeout:10000});expect(await host.locator('[data-option]').evaluateAll(options=>options.map(o=>o.dataset.option))).not.toEqual(optionIds);
  await host.getByRole('button',{name:/A int/}).click();await guest.getByRole('button',{name:/A int/}).click();await expect(host.locator('#next-round')).toBeVisible({timeout:15000});await host.getByRole('button',{name:'Келесі сұрақ',exact:true}).click();await expect(host.getByRole('heading',{name:'Қорытынды нәтиже'})).toBeVisible();await expect(guest.getByRole('heading',{name:'Final results'})).toBeVisible();
  await expect(host.locator('.show-modes')).toBeHidden();await expect(guest.locator('.show-modes')).toBeHidden();await host.evaluate(()=>scrollTo(0,0));await host.screenshot({path:'../artifacts/multiplayer-results-1440.png',fullPage:true});await host.setViewportSize({width:390,height:900});await host.waitForTimeout(250);expect(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await host.screenshot({path:'../artifacts/multiplayer-results-390.png',fullPage:true});expect(errors).toEqual([]);
  await host.locator('#exit-game').click();await expect(host.locator('.show-modes')).toBeVisible();await expect(host.locator('#create-room')).toBeVisible();await expect(host.locator('[name=questionCount]')).toHaveValue('2');expect(await host.evaluate(()=>sessionStorage.getItem('gameRoom'))).toBeNull();
 }finally{for(const context of contexts)await context.close();}
});
