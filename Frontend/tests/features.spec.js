import {test,expect} from '@playwright/test';

test('Three languages persist and preserve entered passwords; eye buttons work in login and registration',async({page})=>{
 await page.goto('/#register');
 await expect(page.locator('html')).toHaveAttribute('lang','ru');
 await page.getByLabel('Имя',{exact:true}).fill('Test');await page.locator('#password').fill('Abcdef1!');
 await page.getByRole('button',{name:'Показать пароль',exact:true}).first().click();await expect(page.locator('#password')).toHaveAttribute('type','text');
 await page.getByRole('button',{name:'Скрыть пароль'}).click();await expect(page.locator('#password')).toHaveAttribute('type','password');
 await page.locator('[data-language]').selectOption('ru');await expect(page.getByRole('heading',{name:'Начни обучение',exact:true})).toBeVisible();await expect(page.locator('#password')).toHaveValue('Abcdef1!');await expect(page.locator('#firstName')).toHaveValue('Test');
 await page.locator('[data-language]').selectOption('en');await expect(page.getByRole('heading',{name:'Start your journey',exact:true})).toBeVisible();
 await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.goto('/#login');await page.getByLabel('Password',{exact:true}).fill('test1234');await page.getByRole('button',{name:'Show password'}).click();await expect(page.locator('#password')).toHaveAttribute('type','text');
});

test('Validation is localized, highlights the field and accepts exactly 8 characters at the API',async({page,request})=>{
 await page.goto('/#register');await page.locator('[data-language]').selectOption('ru');
 await page.locator('#firstName').fill('Test');await page.locator('#lastName').fill('Student');await page.locator('#email').fill('test@example.com');await page.locator('#password').fill('Abcde1!');await page.locator('#confirmPassword').fill('Abcde1!');await page.getByRole('button',{name:'Создать аккаунт'}).click();
 await expect(page.locator('#password-error')).toHaveText('Пароль должен содержать не менее 8 символов.');await expect(page.locator('#password')).toHaveAttribute('aria-invalid','true');
 await page.locator('[data-language]').selectOption('kk');await page.locator('#confirmPassword').fill('Different1!');await page.getByRole('button',{name:'Тіркелу'}).click();await expect(page.locator('#confirmPassword-error')).toHaveText('Парольдер сәйкес келмейді.');
 const payload={firstName:'Test',lastName:'Student',email:`eight-${Date.now()}@example.com`,password:'Abcdef1!',confirmPassword:'Abcdef1!'};
 const accepted=await request.post('/api/auth/register',{data:payload});expect(accepted.ok()).toBeTruthy();
 const rejected=await request.post('/api/auth/register',{data:{...payload,email:`seven-${Date.now()}@example.com`,password:'Abcde1!',confirmPassword:'Abcde1!'}});expect(rejected.status()).toBe(400);expect((await rejected.json()).errors.some(e=>e.code==='passwordShort')).toBeTruthy();
 await page.goto('/#login');await page.locator('#email').fill(payload.email);await page.locator('#password').fill('Wrong123!');await page.getByRole('button',{name:'Кіру',exact:true}).click();await expect(page.locator('#auth-error')).toHaveText('Пошта немесе пароль қате. Тексеріп, қайта енгіз.');await expect(page.locator('#password')).toHaveAttribute('aria-invalid','true');
});

async function account(request){const r=await request.post('/api/auth/register',{data:{firstName:'Answer',lastName:'Test',email:`answer-${crypto.randomUUID()}@example.com`,password:'Abcdef1!',confirmPassword:'Abcdef1!'}});expect(r.ok()).toBeTruthy();return r.json();}
for(const correct of [true,false])test(`Solo answer: ${correct?'green selected answer':'red selected answer without revealing the correct answer'}`,async({page,request})=>{
 const session=await account(request);await page.addInitScript(token=>{sessionStorage.setItem('refreshToken',token);localStorage.setItem('language','en');},session.refreshToken);
 await page.goto('/#task/test-q1');const selected=page.getByRole('radio',{name:correct?/A int/:/B string/});await selected.check();await page.getByRole('button',{name:'Check Answer'}).click();
 await expect(page.locator('.answer-option.'+(correct?'answer-correct':'answer-wrong'))).toHaveCount(1);
 await expect(page.locator('.answer-option.'+(correct?'answer-wrong':'answer-correct'))).toHaveCount(0);
 if(!correct)await expect(page.locator('#answer-result')).not.toContainText('The correct answer is int.');
 await page.setViewportSize({width:390,height:900});await page.waitForTimeout(250);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(await page.locator('.question').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();expect(await page.locator('.answer-options').evaluate(el=>el.getBoundingClientRect().right<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`../artifacts/answer-${correct?'correct':'wrong'}-390.png`,fullPage:true});
});
