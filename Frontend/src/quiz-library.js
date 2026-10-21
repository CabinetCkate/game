import {t,getLanguage} from './i18n';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function savedQuizzes(api){const result=await api('quiz-library');return Array.isArray(result)?result:[];}
export async function extractQuizFile(api,file){
 if(file.size>5000000)throw Error(t('Choose a file up to 5 MB.'));
 const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error(t('The file could not be read.')));reader.readAsDataURL(file);});
 return (await api('quiz-library/extract',{method:'POST',body:{name:file.name,base64},timeoutMs:60000})).text;
}
export const quizFileAccept='.pdf,.docx,.txt,.md,.json,.csv';
export function openQuizCreator(parent,{api,onSaved=()=>{}}){
 const dialog=document.createElement('dialog');dialog.className='quiz-creator show-settings-dialog';
 dialog.innerHTML=`<header class="show-dialog-heading"><div><span class="show-eyebrow">${t('My question library')}</span><h2>${t('Create a topic')}</h2></div><button type="button" class="show-icon-button" data-close aria-label="${t('Close')}">×</button></header><form id="quiz-creator-form"><label>${t('Topic title')}<input name="title" maxlength="100" required placeholder="${t('For example: Biology, chapter 3')}"></label><div class="quiz-source-tabs" role="group" aria-label="${t('Question source')}"><label><input type="radio" name="kind" value="text" checked>${t('Lecture → AI questions')}</label><label><input type="radio" name="kind" value="ready">${t('I have a ready test')}</label></div><label class="quiz-file-label">${t('Upload a file')}<input type="file" name="file" accept="${quizFileAccept}"><small>PDF · DOCX · TXT · MD · JSON · CSV, 5 MB</small></label><label>${t('Text or file contents')}<textarea name="source" rows="8" maxlength="100000" required></textarea></label><p class="task-note" id="quiz-source-help"></p><details class="quiz-import-example" hidden><summary>${t('Ready test format')}</summary><pre data-user-content>1. What is 2 + 2?
A) 3
B) 4
C) 5
Answer: B

2. What is 3 + 3?
A) 6
B) 8
Answer: A</pre><p>${t('A separate answer key at the end is also supported:')}</p><pre data-user-content>Жауаптар кілті
1 — B    2 — A</pre><p>${t('Or upload JSON: questions with question, options and correctAnswer.')}</p></details><label class="quiz-count-label">${t('Questions')}<input name="count" type="number" min="1" max="20" value="5"></label><p class="quiz-creator-status" role="status"></p><div class="quiz-creator-actions"><button class="show-primary" type="submit">${t('Create and save')}</button><button class="show-secondary" type="button" data-close>${t('Cancel')}</button></div></form><section id="quiz-saved-preview" hidden></section>`;
 parent.append(dialog);const form=dialog.querySelector('form'),status=form.querySelector('[role=status]');let busy=false;
 const close=()=>{if(!busy)dialog.close();};dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 function updateKind(){const ready=form.elements.kind.value==='ready';form.querySelector('details').hidden=!ready;form.querySelector('.quiz-count-label').hidden=ready;form.elements.count.required=!ready;form.querySelector('#quiz-source-help').textContent=t(ready?'Ready questions and answer keys are imported without AI changes.':'AI uses only this material. The topic and all questions are saved to your account.');}
 form.querySelectorAll('[name=kind]').forEach(input=>input.onchange=updateKind);updateKind();
 form.elements.file.onchange=async()=>{const file=form.elements.file.files[0];if(!file)return;busy=true;form.querySelector('[type=submit]').disabled=true;status.textContent=t('Reading the file…');try{const text=await extractQuizFile(api,file);form.elements.source.value=text;if(!form.elements.title.value)form.elements.title.value=file.name.replace(/\.[^.]+$/,'').slice(0,100);status.textContent=file.name;}catch(error){status.textContent=error.message;}finally{busy=false;form.querySelector('[type=submit]').disabled=false;}};
 form.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;status.textContent=t(form.elements.kind.value==='ready'?'Importing questions…':'Generating and saving questions…');form.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=true);
  try{const quiz=await api('quiz-library',{method:'POST',body:{title:form.elements.title.value.trim(),sourceText:form.elements.source.value,sourceKind:form.elements.kind.value,questionCount:Number(form.elements.count.value),language:getLanguage()},timeoutMs:100000});form.hidden=true;const preview=dialog.querySelector('#quiz-saved-preview');preview.hidden=false;preview.innerHTML=`<p class="quiz-save-success" role="status">✓ ${t('Saved. You can play this topic again without generating it.')}</p><h3 data-user-content>${esc(quiz.title)}</h3><ol class="quiz-preview-list">${quiz.questions.map(q=>`<li><strong data-user-content>${esc(q.question)}</strong><ul>${q.options.map(o=>`<li data-user-content class="${o.text===q.correctAnswer?'quiz-key':''}">${esc(o.text)}${o.text===q.correctAnswer?' ✓':''}</li>`).join('')}</ul></li>`).join('')}</ol><button class="show-primary" id="use-saved-quiz">${t('Choose this topic')} →</button>`;preview.querySelector('button').onclick=()=>dialog.close();await onSaved(quiz);
  }catch(error){status.textContent=t(error.code||error.message);form.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=false);}finally{busy=false;}
 };
 dialog.showModal();form.elements.title.focus();return dialog;
}
export function playerPortrait(player,characters=[]){
 const character=player.avatarId||player.characterId||'nova';
 const photo=/^https:\/\//i.test(player.avatarUrl||'')?player.avatarUrl:characters.find(c=>c.id===character)?.portrait||`/assets/characters/${['nova','leo','maya','atlas'].includes(character)?character:'nova'}-portrait.png`;
 return `<img class="show-player-photo" src="${esc(photo)}" alt="${esc(player.name)}" width="40" height="40" loading="lazy" referrerpolicy="no-referrer">`;
}
