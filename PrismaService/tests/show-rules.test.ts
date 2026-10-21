import test from 'node:test';
import assert from 'node:assert/strict';
import {checkShowAnswer,publicContent,showScore,validWager,effectiveWager,chooseAdaptiveTask,ROUND_SCHEDULE,BOT_PROFILES,botPlan,unlockedShowTasks,hasClassicRound} from '../src/services/show-rules';

test('Show topics become available only after both previous tasks and XP requirements are met',()=>{
 const levels=[{requiredXP:0,tasks:[{...task('intro'),topicId:'first'}]},{requiredXP:100,tasks:[{...task('advanced'),topicId:'second'}]}];
 assert.deepEqual(unlockedShowTasks(levels,0,[]).map(t=>t.id),['intro']);
 assert.equal(unlockedShowTasks(levels,100,[],'second').length,0);
 assert.equal(unlockedShowTasks(levels,99,['intro'],'second').length,0);
 assert.deepEqual(unlockedShowTasks(levels,100,['intro'],'second').map(t=>t.id),['advanced']);
});
test('A selectable topic needs an unlocked classic question with at least two options',()=>{
 assert.equal(hasClassicRound([task('numeric','EASY','NUMERIC')]),false);
 assert.equal(hasClassicRound([{...task('broken'),options:[{id:'only'}]}]),false);
 assert.equal(hasClassicRound([task('valid')]),true);
});

const task=(id:string,difficulty='EASY',taskType='MULTIPLE_CHOICE')=>({id,difficulty,taskType,topicId:'topic',order:0,options:[{id:'a',text:'Да'},{id:'b',text:'Нет'}],correctAnswer:'Да',content:'{}'});
const history=(correct:boolean,count:number,difficulty='EASY')=>Array.from({length:count},(_,i)=>({taskId:'old-'+i,isCorrect:correct,timeSpent:5,hintUsed:false,task:{difficulty,timeLimit:40}}));

test('All five rounds include a two-question duel and three-question final',()=>{
 assert.equal(ROUND_SCHEDULE.length,10);assert.equal(new Set(ROUND_SCHEDULE).size,5);
 assert.equal(ROUND_SCHEDULE.filter(r=>r==='duel').length,2);assert.equal(ROUND_SCHEDULE.filter(r=>r==='final').length,3);
});
test('MC validates server option IDs/text; blanks and unsupported formats fail',()=>{
 assert.equal(checkShowAnswer(task('q'),'a'),true);assert.equal(checkShowAnswer(task('q'),' нет '),false);
 assert.equal(checkShowAnswer({...task('q'),correctAnswer:''},''),false);
 assert.equal(checkShowAnswer({...task('q'),taskType:'UNKNOWN'},'Да'),false);
});
test('Sequence requires every item in the right order and rejects malformed keys',()=>{
 const q={...task('seq'),taskType:'SEQUENCE',content:JSON.stringify({items:['Вывод','Ввод','Расчёт']}),correctAnswer:JSON.stringify(['Ввод','Расчёт','Вывод'])};
 assert.equal(checkShowAnswer(q,JSON.stringify(['Ввод','Расчёт','Вывод'])),true);
 for(const answer of ['{}','[]',JSON.stringify(['Ввод','Вывод','Расчёт']),JSON.stringify(['Ввод','Расчёт']),JSON.stringify(['Ввод','Расчёт','Вывод','Вывод'])])assert.equal(checkShowAnswer(q,answer),false);
 assert.equal(checkShowAnswer({...q,correctAnswer:'[1,2,3]'},'[1,2,3]'),false);
});
test('Matching ignores JSON key order but rejects partial, extra, and wrong mappings',()=>{
 const q={...task('match'),taskType:'MATCHING',content:JSON.stringify({left:['SELECT','WHERE'],right:['Фильтр','Выборка']}),correctAnswer:JSON.stringify({SELECT:'Выборка',WHERE:'Фильтр'})};
 assert.equal(checkShowAnswer(q,JSON.stringify({WHERE:'Фильтр',SELECT:'Выборка'})),true);
 for(const answer of [JSON.stringify({SELECT:'Выборка'}),JSON.stringify({SELECT:'Фильтр',WHERE:'Выборка'}),JSON.stringify({SELECT:'Выборка',WHERE:'Фильтр',extra:'x'}),'null','[]'])assert.equal(checkShowAnswer(q,answer),false);
});
test('Numeric parsing accepts decimal commas and tolerance, rejects JS coercion and nonfinite inputs',()=>{
 const q={...task('number'),taskType:'NUMERIC',correctAnswer:'2.5',content:JSON.stringify({unit:'с',tolerance:.01})};
 assert.equal(checkShowAnswer(q,'2,5'),true);assert.equal(checkShowAnswer(q,'2.505'),true);assert.equal(checkShowAnswer(q,'2.52'),false);
 for(const value of ['',' ','Infinity','NaN','0x2','2.5 seconds','[]','2,5,0'])assert.equal(checkShowAnswer(q,value),false);
 assert.equal(checkShowAnswer({...q,correctAnswer:''},'0'),false);
});
test('Public format metadata strips arbitrary hidden answer fields',()=>{
 assert.deepEqual(publicContent({taskType:'SEQUENCE',content:JSON.stringify({items:['a','b'],correctAnswer:['b','a'],hint:'secret'})}),{items:['a','b']});
 assert.deepEqual(publicContent({taskType:'MULTIPLE_CHOICE',content:'{"correctAnswer":"secret"}'}),{});
});
test('Wager loss affects show score only; caps and speed/duel scoring are enforced',()=>{
 assert.equal(showScore('wager',false,1,35,300),-300);assert.equal(showScore('wager',true,1,35,150),250);
 assert.equal(validWager(301,900),false);assert.equal(validWager(200,100),false);assert.equal(validWager(-1,100),false);assert.equal(validWager(10.5,100),false);assert.equal(validWager(100,100),true);
 assert.equal(showScore('speed',true,0,22,0),250);assert.equal(showScore('speed',true,22,22,0),100);assert.equal(showScore('speed',true,-10,22,0),250);
 assert.equal(showScore('duel',true,5,30,0,true),225);assert.equal(showScore('duel',true,5,30,0,false),150);
});
test('Adaptive progression raises after three correct and lowers after two wrong, within bounds',()=>{
 const bank=[task('easy'),task('medium','MEDIUM'),task('hard','HARD')];
 const select=(h:any[],prior:string)=>chooseAdaptiveTask(bank,h,[],0,[],prior).adaptive;
 assert.equal(select(history(true,2),'EASY').trainingDifficulty,'EASY');
 assert.equal(select(history(true,3),'EASY').trainingDifficulty,'MEDIUM');
 assert.equal(select(history(true,4),'MEDIUM').trainingDifficulty,'MEDIUM');
 assert.equal(select(history(true,3),'HARD').trainingDifficulty,'HARD');
 assert.equal(select(history(false,1,'HARD'),'HARD').trainingDifficulty,'HARD');
 assert.equal(select(history(false,2,'HARD'),'HARD').trainingDifficulty,'MEDIUM');
 assert.equal(select(history(false,2),'EASY').trainingDifficulty,'EASY');
});
test('Committed wager cannot be reduced, replaced or added at answer time; timeout uses it',()=>{
 assert.equal(effectiveWager('wager',100,null,300),null);
 assert.equal(effectiveWager('wager',0,null,300),0);
 assert.equal(effectiveWager('wager',100,100,300),100);
 assert.equal(effectiveWager('wager',0,100,300),null);
 assert.equal(effectiveWager('wager',200,100,300),null);
 assert.equal(effectiveWager('classic',100,100,300),null);
 assert.equal(showScore('wager',false,36,35,effectiveWager('wager',100,100,300)!),-100);
});
test('Final chooses harder available tier; used tasks are avoided',()=>{
 const bank=[task('easy'),task('hard','HARD','MATCHING'),task('medium','MEDIUM','SEQUENCE')];
 assert.equal(chooseAdaptiveTask(bank,[],[],8,[],'MEDIUM').task.id,'hard');
 assert.equal(chooseAdaptiveTask([task('a'),task('b')],[],['a'],0,[]).task.id,'b');
});
test('Repeated mistakes, hint use and slow answers prioritize remediation within a tier',()=>{
 const bank=[task('a'),task('b')],attempt={taskId:'b',isCorrect:false,timeSpent:36,hintUsed:true,task:{difficulty:'EASY',timeLimit:40}};
 assert.equal(chooseAdaptiveTask(bank,[attempt],[],0,[]).task.id,'b');
 assert.match(chooseAdaptiveTask(bank,[attempt],[],0,[]).adaptive.reason,/1 подсказок.*1 долгих/);
});
test('Bots use different accuracy/timing profiles; plans stay inside the server timer',()=>{
 assert.equal(new Set(BOT_PROFILES.map(b=>b.accuracy)).size,3);assert.equal(new Set(BOT_PROFILES.map(b=>b.minSeconds)).size,3);
 for(let i=0;i<20;i++)for(const answer of botPlan('HARD',5)){assert.ok(answer.timeSpent<=5&&answer.timeSpent>=0);if(answer.timeSpent===5)assert.equal(answer.isCorrect,false);}
});
