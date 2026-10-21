import { informaticsCourseLocales, informaticsTopicName } from '../../prisma/show-informatics-locales';
import { subjectLocale, type ShowLanguage } from '../../prisma/show-subjects';

export function showLanguage(input:unknown, fallback:ShowLanguage='ru'):ShowLanguage {
  return input==='kk'||input==='en'||input==='ru'?input:fallback;
}
export function preparedCourseLocale(courseId:string,language:ShowLanguage) {
  return courseId==='informatics-show'?informaticsCourseLocales[language]:subjectLocale(courseId,language);
}
export function preparedTopicName(topicId:string,courseId:string,language:ShowLanguage) {
  return informaticsTopicName(topicId,language)??subjectLocale(courseId,language)?.topicName;
}
const contentOf=(task:any):any=>{try{return JSON.parse(task.content??'{}');}catch{return {};}};
const fields=['items','left','right','unit'] as const;

/** Keeps option IDs and the stored canonical answer separate from presentation. */
export function localizedShowTask(task:any,language:ShowLanguage) {
  const content=contentOf(task),locale=content.locales?.[language];
  if(!locale)return task;
  const publicFields=Object.fromEntries(fields.filter(field=>locale[field]!=null).map(field=>[field,locale[field]]));
  return {...task,title:locale.title??task.title,question:locale.question??task.question,explanation:locale.explanation??task.explanation,hint:locale.hint??task.hint,
    options:task.options?.map((option:any,index:number)=>({...option,text:locale.options?.[option.order??index]??option.text})),content:JSON.stringify({...content,...publicFields})};
}

function terms(task:any,language:ShowLanguage) {
  const base=contentOf(task),locale=base.locales?.[language],pairs:[string,string][]=[];
  if(locale)for(const field of ['items','left','right'] as const)
    (base[field]??[]).forEach((value:string,index:number)=>{if(typeof locale[field]?.[index]==='string')pairs.push([value,locale[field][index]]);});
  return pairs;
}

/** Convert translated drag/drop labels back to the server's stored key. */
export function canonicalShowAnswer(task:any,answer:string,language:ShowLanguage):string {
  const pairs=terms(task,language),canonical=(value:string)=>pairs.find(([,localized])=>localized===value)?.[0]??value;
  if(!pairs.length)return answer;
  try {
    const data=JSON.parse(answer);
    if(task.taskType==='SEQUENCE'&&Array.isArray(data)&&data.every(value=>typeof value==='string'))return JSON.stringify(data.map(canonical));
    if(task.taskType==='MATCHING'&&data&&typeof data==='object'&&!Array.isArray(data)&&Object.values(data).every(value=>typeof value==='string'))
      return JSON.stringify(Object.fromEntries(Object.entries(data).map(([key,value])=>[canonical(key),canonical(value as string)])));
  }catch{/* A malformed answer stays malformed and the ordinary checker rejects it. */}
  return answer;
}

/** Only called once a question is settled, when exposing its key is allowed. */
export function localizedShowAnswer(task:any,language:ShowLanguage):string {
  const displayed=localizedShowTask(task,language);
  if(task.taskType==='MULTIPLE_CHOICE') {
    const index=task.options.findIndex((option:any)=>option.text===task.correctAnswer);
    return displayed.options[index]?.text??task.correctAnswer;
  }
  const pairs=terms(task,language),localized=(value:string)=>pairs.find(([base])=>base===value)?.[1]??value;
  try {
    const data=JSON.parse(task.correctAnswer);
    if(task.taskType==='SEQUENCE'&&Array.isArray(data))return JSON.stringify(data.map(localized));
    if(task.taskType==='MATCHING'&&data&&typeof data==='object')return JSON.stringify(Object.fromEntries(Object.entries(data).map(([key,value])=>[localized(key),localized(value as string)])));
  }catch{/* Numeric keys and unchanged formats pass through. */}
  return task.correctAnswer;
}

export function privateQuestionTranslations(task:any) {
  const locales=contentOf(task).locales;
  // Untranslated legacy courses must fall back to real translation in the API;
  // returning English under a kk/ru label would incorrectly satisfy its cache.
  const languages=(['ru','kk','en'] as const).filter(language=>locales?.[language]||(language==='ru'&&locales&&task.id.startsWith('show-')));
  return Object.fromEntries(languages.map(language=>{
    const localized=localizedShowTask(task,language);
    return [language,{title:localized.title,question:localized.question,options:localized.options.map((option:any)=>({id:option.id,text:option.text}))}];
  }));
}
