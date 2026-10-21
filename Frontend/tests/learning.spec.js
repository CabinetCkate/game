import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('language','en'));});
const live=process.env.RUN_LIVE_E2E==='1';
test('Live MySQL flow: register → task → XP → goals → ranking → AI → refresh',async({page,request})=>{
 test.skip(!live,'Set RUN_LIVE_E2E=1 with all services running. No API or database mocks are used.');
 await page.goto('/#register');await page.getByLabel('First name').fill('E2E');await page.getByLabel('Last name').fill('Learner');
 await page.getByLabel('Email address').fill(`e2e-${Date.now()}@example.com`);await page.getByLabel('Password',{exact:true}).fill('Student123!');await page.getByLabel('Confirm password').fill('Student123!');
 await page.getByRole('button',{name:'Create Account'}).click();await expect(page.getByRole('heading',{name:/Welcome back, E2E/})).toBeVisible();
 await page.goto('/#task/csharp-task-1-1');await page.getByRole('radio',{name:/int/}).check();await page.getByRole('button',{name:'Check Answer'}).click();
 await expect(page.getByText('Nicely done!')).toBeVisible();await expect(page.getByText('+150 XP',{exact:true})).toHaveCount(0); // Achievement XP is included in total reward.
 await page.keyboard.press('Escape');await page.goto('/#daily-goals');await expect(page.getByText('1 / 3',{exact:true})).toBeVisible();
 const refreshToken=await page.evaluate(()=>sessionStorage.getItem('refreshToken'));
 const tokens=await request.post('/api/auth/refresh',{data:{refreshToken}});expect(tokens.ok()).toBeTruthy();const {accessToken}=await tokens.json();const headers={Authorization:'Bearer '+accessToken};
 expect((await request.get('/api/statistics',{headers})).ok()).toBeTruthy();expect((await request.get('/api/ai/next-task',{headers})).ok()).toBeTruthy();
 expect((await request.post('/api/xp',{headers,data:{amount:999999}})).status()).toBe(405);
 expect((await request.get('/api/admin/dashboard',{headers})).status()).toBe(403);
 const task=await (await request.get('/api/tasks/csharp-task-1-1',{headers})).json();expect(task.correctAnswer).toBeUndefined();
 const session=await (await request.post('/api/tasks/csharp-task-1-1/start',{headers})).json();const submission={answer:'int',sessionId:session.sessionId,requestId:crypto.randomUUID()};
 const one=await (await request.post('/api/tasks/csharp-task-1-1/attempt',{headers,data:submission})).json();expect(one.xpEarned).toBe(0);
 const replay=await (await request.post('/api/tasks/csharp-task-1-1/attempt',{headers,data:submission})).json();expect(replay.totalXP).toBe(one.totalXP);
 const concurrent=await Promise.all([request.post('/api/tasks/csharp-task-1-2/start',{headers}),request.post('/api/tasks/csharp-task-1-2/start',{headers})]);
 const sessions=await Promise.all(concurrent.map(r=>r.json()));const results=await Promise.all(sessions.map(s=>request.post('/api/tasks/csharp-task-1-2/attempt',{headers,data:{answer:'3',sessionId:s.sessionId,requestId:crypto.randomUUID()}})));
 expect(results.every(r=>r.ok())).toBeTruthy();const outcomes=await Promise.all(results.map(r=>r.json()));expect(outcomes.filter(o=>o.xpEarned>0)).toHaveLength(1);
});
