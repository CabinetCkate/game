import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {learningMessages} from '../src/learning-messages.js';
import {learningHelp} from '../src/learning-help.js';

test('Every bundled question, hint, explanation and prose answer has both translations',()=>{
 const seed=fs.readFileSync(new URL('../../PrismaService/prisma/seed.ts',import.meta.url),'utf8');
 const banks=Function('return ('+seed.match(/const banks:[^=]+=(\{[\s\S]*?\n\});/)[1]+')')();
 const translations={...learningMessages,...learningHelp};
 let count=0;
 for(const bank of Object.values(banks))for(const level of bank.questions)for(const [question,options,,explanation,hint] of level){
  count++;
  for(const text of [question,explanation,hint,...options.filter(text=>/[a-z]+ [a-z]+/.test(text)&&!text.includes('name ='))]){
   expect(translations[text],text).toHaveLength(2);
   expect(translations[text].every(value=>value&&value!==text),text).toBeTruthy();
  }
 }
 expect(count).toBe(75);
});

test('Admin sidebar opens each resource and highlights only the selected section',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('language','en');sessionStorage.setItem('refreshToken','fixture-admin-refresh');});
 await page.goto('/#admin');await expect(page.locator('#content h1')).toHaveText('Admin Studio');
 for(const resource of ['students','courses','levels','topics','tasks','achievements','seasons','daily-goals','reports','settings','dashboard']){
  const link=page.locator(`.sidebar a[href="#admin?resource=${resource}"]`);
  await link.click();await expect(page).toHaveURL(new RegExp('#admin\\?resource='+resource+'$'));
  await expect(link).toHaveClass(/active/);await expect(page.locator('.sidebar .nav-item.active')).toHaveCount(1);
  await expect(page.locator('#admin-body .skeleton')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'We couldn’t load this page.'})).toHaveCount(0);
 }
 await page.locator('[data-language]').selectOption('ru');await expect(page.locator('#content h1')).toHaveText('Панель администратора');
 await page.locator('[data-language]').selectOption('kk');await expect(page.locator('#content h1')).toHaveText('Әкімші панелі');
 await page.locator('[data-language]').selectOption('en');await expect(page.locator('#content h1')).toHaveText('Admin Studio');
 await page.locator('.sidebar a[href="#settings"]').click();await expect(page.locator('#theme-toggle')).toBeVisible();
});

test('Changing language preserves task selection and translates curriculum and attributes',async({page})=>{
 await page.addInitScript(()=>{sessionStorage.setItem('refreshToken','fixture-language-refresh');localStorage.setItem('language','en');});
 await page.route('**/api/tasks/test-q1/start',async route=>{
  const response=await route.fetch(),body=await response.json();
  body.task.question='Which C# type stores whole numbers?';body.task.title='Variables · Challenge 1';
  body.task.options[0].text='Infers the type at compile time';
  await route.fulfill({response,json:body});
 });
 await page.goto('/#task/test-q1');await page.locator('.answer-option input').first().check();
 const sessionRequest=[];page.on('request',request=>{if(request.url().endsWith('/start'))sessionRequest.push(request.url());});
 const translations=[['kk','C# тілінде бүтін сандарды қай тип сақтайды?','Курстарды іздеу','Компиляция кезінде типті анықтайды'],['ru','Какой тип C# хранит целые числа?','Поиск курсов','Определяет тип при компиляции'],['en','Which C# type stores whole numbers?','Search courses','Infers the type at compile time']];
 for(const [language,question,search,answer] of translations){
  await page.locator('[data-language]').selectOption(language);
  await expect(page.locator('.question')).toHaveText(question);await expect(page.locator('.answer-option').first()).toContainText(answer);
  await expect(page.locator('.answer-option input').first()).toBeChecked();await expect(page.locator('#global-search')).toHaveAttribute('aria-label',search);
 }
 expect(sessionRequest).toHaveLength(0);
});
