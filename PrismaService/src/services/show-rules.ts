import {randomInt} from 'node:crypto';

export type Round = 'classic'|'speed'|'wager'|'duel'|'final';
export const ROUND_SCHEDULE:Round[] = ['classic','classic','speed','speed','wager','duel','duel','final','final','final'];
type ShowTaskRef={id:string;topicId:string;taskType:string};
export function unlockedShowTasks<T extends ShowTaskRef>(levels:{requiredXP:number;tasks:T[]}[],totalXP:number,completedIds:Iterable<string>,topicId:string|null=null):T[]{
 const completed=new Set(completedIds),previous:string[]=[],tasks:T[]=[];
 for(const level of levels){
  if(totalXP>=level.requiredXP&&previous.every(id=>completed.has(id)))tasks.push(...level.tasks.filter(task=>(!topicId||task.topicId===topicId)&&['MULTIPLE_CHOICE','SEQUENCE','MATCHING','NUMERIC','PROBLEM'].includes(task.taskType)));
  previous.push(...level.tasks.map(task=>task.id));
 }
 return tasks;
}
export const hasClassicRound=(tasks:{taskType:string;options:unknown[]}[])=>tasks.some(task=>task.taskType==='MULTIPLE_CHOICE'&&task.options.length>=2);
export const ROUND_RULES:Record<Round,{title:string;rules:string;seconds:number}> = {
 classic:{title:'Классический раунд',rules:'Верный ответ приносит 100 очков шоу. Учебный XP начисляется отдельно.',seconds:35},
 speed:{title:'На скорость',rules:'Верный ответ: от 100 до 250 очков. Чем быстрее ответ, тем выше награда.',seconds:22},
 wager:{title:'Ставка',rules:'Выберите ставку до ответа: максимум 300 и не больше ваших очков. Верно: 100 + ставка. Ошибка: потеря ставки; учебный XP сохраняется.',seconds:35},
 duel:{title:'Дуэль',rules:'Два задания против одного выбранного соперника. Верный ответ — 150 очков; самый быстрый верный ответ — ещё 75.',seconds:30},
 final:{title:'Финал',rules:'Три более сложных задания. Каждый верный ответ — 200 очков. Победитель определяется по сумме очков шоу.',seconds:40},
};
const normalized=(value:string)=>value.trim().toLocaleLowerCase('ru-RU');
const json=(value:string):any=>{try{return JSON.parse(value);}catch{return null;}};
export function publicContent(task:any):Record<string,unknown>{
 const content=json(task.content??'{}')??{};
 const strings=(v:any)=>Array.isArray(v)?v.filter((x:any)=>typeof x==='string').slice(0,16):[];
 switch(task.taskType){
  case 'SEQUENCE':return {items:strings(content.items)};
  case 'MATCHING':return {left:strings(content.left),right:strings(content.right)};
  case 'NUMERIC':case 'PROBLEM':return {unit:typeof content.unit==='string'?content.unit:'',tolerance:typeof content.tolerance==='number'?Math.max(0,content.tolerance):0};
  default:return {};
 }
}
// Answers are checked against the stored course bank, never a client supplied key.
export function checkShowAnswer(task:any,answer:string):boolean{
 if(typeof answer!=='string'||answer.length>1000)return false;
 if(task.taskType==='SEQUENCE'){
  const actual=json(answer),expected=json(task.correctAnswer),content=publicContent(task);
  return Array.isArray(actual)&&Array.isArray(expected)&&expected.length>0&&expected.every((v:any)=>typeof v==='string')&&actual.length===expected.length&&
   actual.length===(content.items as string[]).length&&actual.every((x:any,i:number)=>typeof x==='string'&&normalized(x)===normalized(expected[i]));
 }
 if(task.taskType==='MATCHING'){
  const actual=json(answer),expected=json(task.correctAnswer),left=publicContent(task).left as string[];
  return actual!==null&&expected!==null&&left.length>0&&!Array.isArray(actual)&&typeof actual==='object'&&
   Object.keys(actual).length===left.length&&left.every(k=>Object.hasOwn(actual,k)&&typeof actual[k]==='string'&&typeof expected[k]==='string'&&normalized(actual[k])===normalized(expected[k]));
 }
 if(task.taskType==='NUMERIC'||task.taskType==='PROBLEM'){
  const raw=answer.trim().replace(',','.');
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw))return false;
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(task.correctAnswer).trim()))return false;
  const actual=Number(raw),expected=Number(task.correctAnswer),tolerance=Number(publicContent(task).tolerance??0);
  return Number.isFinite(actual)&&Number.isFinite(expected)&&Number.isFinite(tolerance)&&Math.abs(actual-expected)<=tolerance+Number.EPSILON*Math.max(1,Math.abs(expected));
 }
 if(task.taskType!=='MULTIPLE_CHOICE')return false;
 const choice=task.options?.find((o:any)=>o.id===answer.trim());
 return !!answer.trim()&&typeof task.correctAnswer==='string'&&!!task.correctAnswer.trim()&&normalized(choice?.text??answer)===normalized(task.correctAnswer);
}
export function showScore(round:Round,correct:boolean,elapsed:number,limit:number,wager:number,fastest=false):number{
 if(!correct)return round==='wager'?-wager:0;
 switch(round){
  case 'speed':return 100+Math.round(150*Math.max(0,Math.min(1,1-elapsed/limit)));
  case 'wager':return 100+wager;
  case 'duel':return 150+(fastest?75:0);
  case 'final':return 200;
  default:return 100;
 }
}
export function validWager(value:unknown,score:number):boolean{return typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=Math.min(score,300);}
export function effectiveWager(round:Round,supplied:unknown,stored:number|null|undefined,score:number):number|null{
 const value=supplied??0;
 if(round!=='wager')return value===0?0:null;
 if(!validWager(value,score))return null;
 if(stored!=null)return value===stored?stored:null;
 return value===0?0:null; // Positive stakes must have been persisted before answering.
}
export const BOT_PROFILES=[
 {id:'bot-1',name:'Бот · Тактик',accuracy:.82,minSeconds:5,maxSeconds:15},
 {id:'bot-2',name:'Бот · Спринтер',accuracy:.64,minSeconds:2,maxSeconds:9},
 {id:'bot-3',name:'Бот · Исследователь',accuracy:.48,minSeconds:8,maxSeconds:20},
];
export function botPlan(difficulty:string,seconds:number){
 const penalty=difficulty==='HARD'?.16:difficulty==='MEDIUM'?.07:0;
 return BOT_PROFILES.map(b=>{
  const timeSpent=Math.min(seconds,randomInt(b.minSeconds*1000,b.maxSeconds*1000+1)/1000);
  return {participantId:b.id,isCorrect:timeSpent<seconds&&randomInt(10000)/10000<b.accuracy-penalty,timeSpent};
 });
}
export function chooseAdaptiveTask(tasks:any[],history:any[],used:string[],index:number,weakTopics:any[],previousDifficulty?:string){
 const levels=['EASY','MEDIUM','HARD'],recent=history.slice(0,8);
 let rank=Math.max(0,levels.indexOf(previousDifficulty??history[0]?.task?.difficulty??'EASY'));
 const first=history[0]?.isCorrect;
 let run=0;for(const attempt of history){if(attempt.isCorrect!==first)break;run++;}
 let change='Сложность сохраняется до серии из трёх верных ответов или двух ошибок.';
 if(first===true&&run>=3&&run%3===0){rank=Math.min(2,rank+1);change='Три верных ответа подряд: повышаем учебную сложность на одну ступень.';}
 if(first===false&&run>=2&&run%2===0){rank=Math.max(0,rank-1);change='Две ошибки подряд: снижаем учебную сложность на одну ступень.';}
 const trainingDifficulty=levels[rank],final=ROUND_SCHEDULE[index]==='final';
 if(final)rank=Math.min(2,rank+1);
 const difficulty=levels[rank];
 const weak=weakTopics.slice().sort((a,b)=>b.wrong/(b.correct+b.wrong||1)-a.wrong/(a.correct+a.wrong||1))[0];
 let pool=tasks.filter(t=>!used.includes(t.id));if(!pool.length)pool=tasks;
 const desired=index<2?'MULTIPLE_CHOICE':['SEQUENCE','NUMERIC','MATCHING','SEQUENCE','NUMERIC','MATCHING','SEQUENCE','NUMERIC'][index-2];
 if(index<2){const choices=pool.filter(t=>t.taskType==='MULTIPLE_CHOICE'&&(t.options?.length??0)>=2);if(choices.length)pool=choices;else pool=tasks.filter(t=>t.taskType==='MULTIPLE_CHOICE'&&(t.options?.length??0)>=2);}
 // The final prioritizes the harder available tier before its preferred format.
 if(final&&pool.length){const distance=Math.min(...pool.map(t=>Math.abs(levels.indexOf(t.difficulty)-rank)));pool=pool.filter(t=>Math.abs(levels.indexOf(t.difficulty)-rank)===distance);}
 const seen=new Set(history.filter(a=>a.isCorrect).map(a=>a.taskId));
 pool=pool.slice().sort((a,b)=>{
  const weight=(t:any)=>{
   const taskHistory=history.filter(h=>h.taskId===t.id),mistakes=taskHistory.filter(h=>!h.isCorrect).length;
   const support=taskHistory.filter(h=>h.hintUsed||h.timeSpent>(h.task?.timeLimit??40)*.7).length;
   return (t.taskType===desired?100:0)-Math.abs(levels.indexOf(t.difficulty)-rank)*40+
    (t.topicId===weak?.topicId?15:0)+(seen.has(t.id)?0:8)+Math.min(3,mistakes)*8+Math.min(2,support)*6;
  };
  return weight(b)-weight(a)||a.order-b.order||a.id.localeCompare(b.id);
 });
 const task=pool[0];
 const hints=recent.filter(a=>a.hintUsed).length,slow=recent.filter(a=>a.timeSpent>(a.task?.timeLimit??40)*.7).length;
 return {task,adaptive:{source:'fallback',reason:(recent.length?`${change} Подбор учитывает повторные ошибки, ${hints} подсказок и ${slow} долгих ответов из последних ${recent.length}.`:'Первая серия: начинаем с доступных заданий и чередуем учебные форматы.')+(final?' Финал выбирает более сложную доступную ступень.':''),difficulty:task?.difficulty??difficulty,trainingDifficulty,targetDifficulty:difficulty,weakTopic:weak?.topicId??null}};
}
