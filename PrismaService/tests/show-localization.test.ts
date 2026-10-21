import test from 'node:test';
import assert from 'node:assert/strict';
import {showBank,seedShowBank} from '../prisma/show-bank';
import {informaticsTaskLocales} from '../prisma/show-informatics-locales';
import {preparedSubjects,seedPreparedSubjects,PREPARED_COURSE_IDS,BOOK_SOURCES} from '../prisma/show-subjects';
import {localizedShowTask,localizedShowAnswer,canonicalShowAnswer,privateQuestionTranslations} from '../src/services/show-localization';
import {checkShowAnswer,publicContent} from '../src/services/show-rules';

const informatics=showBank.tasks.map(task=>({...task,content:JSON.stringify({...JSON.parse(task.content),locales:informaticsTaskLocales(task)})}));
const tasks=[...informatics,...preparedSubjects.flatMap(subject=>subject.tasks)].map(task=>({...task,options:task.options.map((text,order)=>({id:`${task.id}-o-${order}`,text,order}))}));

test('six prepared subjects have enough distinct authored questions for a full show',()=>{
  assert.equal(PREPARED_COURSE_IDS.length,6);
  assert.equal(tasks.length,86);
  assert.equal(new Set(tasks.map(task=>task.id)).size,86);
  for(const subject of preparedSubjects){
    assert.equal(subject.tasks.length,10);
    assert.deepEqual(new Set(subject.tasks.map(task=>task.difficulty)),new Set(['EASY','MEDIUM','HARD']));
    assert.ok(subject.courseId.length<=36&&subject.levelId.length<=36&&subject.topicId.length<=36);
    for(const language of ['ru','kk','en'] as const)assert.ok(subject.locales[language].title&&subject.locales[language].description);
  }
  assert.ok(BOOK_SOURCES.some(source=>source.startsWith('https://elibrary.kaznu.kz/')));
  assert.ok(BOOK_SOURCES.some(source=>source.startsWith('https://darynbaspa.kz/')));
});

test('all prepared questions are fully translated without changing stable answer option IDs',()=>{
  for(const task of tasks)for(const language of ['ru','kk','en'] as const){
    const displayed=localizedShowTask(task,language);
    assert.ok(displayed.question&&displayed.explanation&&displayed.hint,`${task.id}:${language}`);
    if(language==='en')assert.equal(/[А-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі]/.test(displayed.question),false,`${task.id}: English question`);
    if(language!=='ru')assert.notEqual(displayed.question,task.question,`${task.id}: actual translation`);
    assert.deepEqual(displayed.options.map((option:any)=>option.id),task.options.map(option=>option.id));
    if(task.taskType==='MULTIPLE_CHOICE'){
      assert.equal(displayed.options.length,4);
      assert.equal(new Set(displayed.options.map((option:any)=>option.text)).size,4);
      const answer=localizedShowAnswer(task,language);
      const selected=displayed.options.find((option:any)=>option.text===answer);
      assert.ok(selected,`${task.id}: displayed answer exists`);
      assert.equal(checkShowAnswer(task,selected.id),true,`${task.id}: option ID remains authoritative`);
    }
    assert.equal('locales' in publicContent(displayed),false);
    assert.equal('correctAnswer' in publicContent(displayed),false);
    assert.equal('explanation' in publicContent(displayed),false);
    assert.equal('hint' in publicContent(displayed),false);
  }
});

test('translated drag/drop answers round-trip to their stored keys and incorrect permutations fail',()=>{
  for(const task of tasks.filter(task=>['MATCHING','SEQUENCE'].includes(task.taskType)))for(const language of ['kk','en'] as const){
    const translated=localizedShowAnswer(task,language),canonical=canonicalShowAnswer(task,translated,language);
    assert.equal(checkShowAnswer(task,canonical),true,`${task.id}:${language}`);
    if(language==='en'&&/[А-Яа-я]/.test(task.correctAnswer))assert.notEqual(translated,task.correctAnswer,`${task.id}: labels translated`);
    const data=JSON.parse(translated);
    if(Array.isArray(data))data.reverse();else{
      const keys=Object.keys(data);[data[keys[0]],data[keys[1]]]=[data[keys[1]],data[keys[0]]];
    }
    assert.equal(checkShowAnswer(task,canonicalShowAnswer(task,JSON.stringify(data),language)),false);
    assert.equal(checkShowAnswer(task,canonicalShowAnswer(task,'[]',language)),false);
  }
});

test('private multiplayer locale envelope contains only aligned question presentation fields',()=>{
  for(const task of tasks.filter(task=>task.taskType==='MULTIPLE_CHOICE')){
    const translated=privateQuestionTranslations(task);
    assert.deepEqual(Object.keys(translated),['ru','kk','en']);
    for(const value of Object.values(translated) as any[]){
      assert.deepEqual(Object.keys(value),['title','question','options']);
      assert.deepEqual(value.options.map((option:any)=>option.id),task.options.map(option=>option.id));
      assert.ok(value.options.every((option:any)=>option.id.length<=36));
    }
  }
});

test('untranslated legacy courses do not masquerade as translated prepared questions',()=>{
  const legacy={id:'csharp-task-1-1',title:'First task',question:'What is an integer?',content:'{}',options:[{id:'one',order:0,text:'A whole number'},{id:'two',order:1,text:'A colour'}]};
  assert.deepEqual(privateQuestionTranslations(legacy),{});
});

test('targeted seed repeats safely and leaves unrelated courses and student progress untouched',async()=>{
  const stores=Object.fromEntries(['course','level','topic','task'].map(name=>[name,new Map<string,any>()]));
  stores.course.set('existing',{id:'existing',title:'Keep this course'});
  const mock=Object.fromEntries(Object.entries(stores).map(([name,rows])=>[name,{async upsert({where,create,update}:any){const row=rows.has(where.id)?{...rows.get(where.id),...update}:create;rows.set(where.id,structuredClone(row));return row;}}]));
  for(let pass=0;pass<2;pass++){await seedShowBank(mock as any);await seedPreparedSubjects(mock as any);}
  assert.equal(stores.course.size,7);
  assert.equal(stores.level.size,6);
  assert.equal(stores.topic.size,8);
  assert.equal(stores.task.size,86);
  assert.deepEqual(stores.course.get('existing'),{id:'existing',title:'Keep this course'});
  assert.ok([...stores.level.values()].every(level=>level.requiredXP===0&&level.isLocked===false));
  assert.ok([...stores.task.values()].every(task=>JSON.parse(task.content).locales.kk&&JSON.parse(task.content).locales.en));
});
