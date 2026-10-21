import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('language','en'));});
test('Registration and subsequent login leave the auth form',async({page})=>{
 const email=`auth-${crypto.randomUUID()}@example.com`;
 await page.goto('/#register');
 await page.locator('#firstName').fill('Auth');await page.locator('#lastName').fill('Test');
 await page.locator('#email').fill(email);await page.locator('#password').fill('Abcdef1!');await page.locator('#confirmPassword').fill('Abcdef1!');
 await page.getByRole('button',{name:'Create Account',exact:true}).click();
 await expect(page).toHaveURL(/#dashboard$/);await expect(page.locator('#content')).toBeVisible();
 await page.getByRole('button',{name:'Sign Out',exact:true}).click();
 await expect(page.locator('#auth-form')).toBeVisible();
 await page.locator('#email').fill(email);await page.locator('#password').fill('Abcdef1!');
 await page.getByRole('button',{name:'Sign In',exact:true}).click();
 await expect(page).toHaveURL(/#dashboard$/);await expect(page.locator('#auth-form')).toHaveCount(0);
});
for(const mode of ['login','register'])test(`${mode} recovers from an unresponsive server`,async({page})=>{
 await page.clock.install();
 await page.route(`**/api/auth/${mode}`,()=>new Promise(()=>{}));
 await page.goto('/#'+mode);
 if(mode==='register'){await page.locator('#firstName').fill('Auth');await page.locator('#lastName').fill('Test');await page.locator('#confirmPassword').fill('Abcdef1!');}
 await page.locator('#email').fill('timeout@example.com');await page.locator('#password').fill('Abcdef1!');
 const submit=page.locator('button[type=submit]');await submit.click();await expect(submit).toBeDisabled();
 await page.clock.fastForward(21000);
 await expect(page.locator('#auth-error')).toHaveText('Unable to connect to the server. Try again.');
 await expect(submit).toBeEnabled();await expect(page.locator('#email')).toHaveValue('timeout@example.com');
 await page.unrouteAll({behavior:'ignoreErrors'});
});
test('Auth is keyboard accessible and fits desktop/mobile without horizontal overflow',async({page})=>{
 for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:900});await page.goto('/#login');
  await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();await expect(page.getByRole('button',{name:'Sign In'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  if(width===1440||width===390)await page.screenshot({path:`../artifacts/auth-${width}.png`,fullPage:true});
 }
 await page.getByLabel('Email address').fill('student@example.com');await page.getByLabel('Password',{exact:true}).fill('Student123!');
 await page.getByRole('button',{name:'Sign In'}).focus();expect(await page.evaluate(()=>document.activeElement.tagName)).toBe('BUTTON');
});
