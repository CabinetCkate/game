import {locale, t} from './i18n';

let bearIndex=0;
let currentRole='STUDENT',currentUserId='',postCall,pendingGoals=null,activeTour=null,tourIndex=0,teacherError='';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const identity=()=>currentUserId||currentRole.toLowerCase();
const storageKey=name=>`ascend-helper:${identity()}:${name}`;
const todayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Qyzylorda'}).format(new Date());

function bear(){const furId=`helper-fur-${++bearIndex}`,muzzleId=`helper-muzzle-${bearIndex}`;return `<svg class="helper-bear" viewBox="0 0 96 100" aria-hidden="true"><defs><radialGradient id="${furId}" cx="35%" cy="25%"><stop stop-color="#ffc78e"/><stop offset="1" stop-color="#a95637"/></radialGradient><radialGradient id="${muzzleId}" cx="40%" cy="25%"><stop stop-color="#fff1c7"/><stop offset="1" stop-color="#e8c98a"/></radialGradient></defs><ellipse cx="48" cy="94" rx="29" ry="4" fill="#171126" opacity=".28"/><ellipse cx="22" cy="27" rx="15" ry="16" fill="url(#${furId})" stroke="#573326" stroke-width="2.5"/><ellipse cx="74" cy="27" rx="15" ry="16" fill="url(#${furId})" stroke="#573326" stroke-width="2.5"/><ellipse cx="22" cy="27" rx="7" ry="8" fill="#e88975"/><ellipse cx="74" cy="27" rx="7" ry="8" fill="#e88975"/><ellipse cx="48" cy="39" rx="35" ry="32" fill="url(#${furId})" stroke="#573326" stroke-width="2.5"/><ellipse cx="35" cy="39" rx="7" ry="9" fill="#fff7e9"/><ellipse cx="61" cy="39" rx="7" ry="9" fill="#fff7e9"/><ellipse cx="36" cy="41" rx="3.3" ry="4.7" fill="#28202a"/><ellipse cx="60" cy="41" rx="3.3" ry="4.7" fill="#28202a"/><circle cx="37" cy="39" r="1.3" fill="white"/><circle cx="61" cy="39" r="1.3" fill="white"/><ellipse cx="48" cy="54" rx="19" ry="13" fill="url(#${muzzleId})"/><ellipse cx="48" cy="50" rx="5.5" ry="4" fill="#382321"/><path class="helper-smile" d="M41 57q7 7 14 0" fill="none" stroke="#563122" stroke-width="2" stroke-linecap="round"/><ellipse cx="28" cy="55" rx="6" ry="3.5" fill="#f27668" opacity=".6"/><ellipse cx="68" cy="55" rx="6" ry="3.5" fill="#f27668" opacity=".6"/><ellipse cx="48" cy="80" rx="25" ry="17" fill="url(#${furId})" stroke="#573326" stroke-width="2.5"/><ellipse cx="48" cy="80" rx="12" ry="10" fill="url(#${muzzleId})"/><ellipse cx="30" cy="89" rx="8" ry="5" fill="#88452f"/><ellipse cx="66" cy="89" rx="8" ry="5" fill="#88452f"/></svg>`;}

function widgetMarkup(){return `<section class="study-helper" id="study-helper" aria-label="${t('AI study assistant')}"><button class="study-helper-launcher" id="study-helper-launcher" type="button" aria-label="${t('Open AI study assistant')}" aria-expanded="false" title="${t('Need help? Tap me!')}"><span class="study-helper-mascot">${bear()}</span><i aria-hidden="true">✦</i></button><aside class="study-helper-panel" id="study-helper-panel" hidden><header class="study-helper-header"><span class="study-helper-avatar">${bear()}</span><span><strong>${t('Ascend study buddy')}</strong><small>${t('Here to help you learn')}</small></span><button class="study-helper-icon" id="study-helper-minimize" type="button" aria-label="${t('Close assistant')}">−</button><button class="study-helper-icon" id="study-helper-close" type="button" aria-label="${t('Close assistant')}">×</button></header><div class="study-helper-chat" id="study-helper-chat" aria-live="polite"></div><form id="study-helper-form" class="study-helper-form"><textarea id="study-helper-input" rows="1" maxlength="2000" placeholder="${t('Ask a learning question…')}" required></textarea><button type="submit" aria-label="${t('Send question')}">↗</button></form><footer class="study-helper-tools"><button type="button" id="study-helper-tour">${t('Take a mini tour')}</button><label><input type="checkbox" id="study-helper-reminders"> ${t('Task reminders')}</label></footer></aside><div class="study-helper-notice" id="study-helper-notice" role="status" aria-live="polite" hidden></div><aside class="study-helper-tour-tip" id="study-helper-tour-tip" role="status" aria-live="polite" hidden></aside></section>`;}

function root(){return document.querySelector('#study-helper');}
function setExpression(name){const mascot=root()?.querySelector('.study-helper-mascot');if(mascot)mascot.dataset.mood=name;}
function openPanel(seed=''){const panel=root()?.querySelector('#study-helper-panel'),launcher=root()?.querySelector('#study-helper-launcher');if(!panel)return;panel.hidden=false;launcher.setAttribute('aria-expanded','true');if(seed){const input=root().querySelector('#study-helper-input');input.value=seed;input.focus();}else root().querySelector('#study-helper-input').focus();}
function closeNotice(){const notice=root()?.querySelector('#study-helper-notice');if(notice){notice.hidden=true;notice.innerHTML='';}}
function notice(content){const element=root()?.querySelector('#study-helper-notice');if(!element)return;element.innerHTML=content;element.hidden=false;}
function safeTourSteps(){
 if(currentRole==='TEACHER')return [
  {href:'#teacher',selector:'a[href="#teacher"]',text:'Your courses are listed here. Select one to see student progress.'},
  {href:'#teacher',selector:'#teacher-fab',text:'Use this plus button when you are ready to create a course.'},
  {href:'#settings',selector:'a[href="#settings"]',text:'Settings are here. You can return to your courses at any time.'}
 ];
 if(currentRole==='ADMIN')return [
  {href:'#admin?resource=dashboard',selector:'a[href="#admin?resource=dashboard"]',text:'This is your admin overview.'},
  {href:'#admin?resource=courses',selector:'a[href="#admin?resource=courses"]',text:'Manage the course catalogue from here.'},
  {href:'#admin?resource=reports',selector:'a[href="#admin?resource=reports"]',text:'Review learning reports here.'}
 ];
 return [
  {href:'#courses',selector:'a[href="#courses"]',text:'Browse courses and find a topic you want to learn.'},
  {href:'#learning',selector:'a[href="#learning"]',text:'Your purchased courses and ongoing lessons are here.'},
  {href:'#dashboard',selector:'#notifications',text:'Open notifications here. You can switch daily goal reminders off from the helper settings.'}
 ];
}
function clearTourTarget(){document.querySelectorAll('.study-helper-tour-target').forEach(el=>el.classList.remove('study-helper-tour-target'));const tip=root()?.querySelector('#study-helper-tour-tip');if(tip){tip.hidden=true;tip.innerHTML='';}}
function endTour(){clearTourTarget();activeTour=null;localStorage.setItem(storageKey('tour-complete'),'true');}
function showTourStep(index){
 if(!activeTour)return;
 if(index>=activeTour.length){endTour();notice(`<span>${t('Mini tour complete. You can ask me for help any time.')}</span><button type="button" data-helper-close>${t('Dismiss')}</button>`);return;}
 tourIndex=index;const step=activeTour[index];
 if(location.hash!==step.href){location.hash=step.href;}
 let retries=0;const locate=()=>{if(!activeTour)return;let target=document.querySelector(step.selector);if(!target&&retries++<20){setTimeout(locate,180);return;}if(!target){notice(`<span>${t(step.text)}</span><button type="button" data-helper-next>${t('Next')}</button><button type="button" data-helper-skip>${t('Skip tour')}</button>`);return;}
  target.classList.add('study-helper-tour-target');target.scrollIntoView?.({block:'nearest',inline:'nearest'});const rect=target.getBoundingClientRect(),tip=root().querySelector('#study-helper-tour-tip'),width=Math.min(300,innerWidth-24);tip.innerHTML=`<p>${t(step.text)}</p><small>${index+1} / ${activeTour.length}</small><div><button type="button" data-helper-next>${index+1===activeTour.length?t('Finish tour'):t('Next')}</button><button type="button" data-helper-skip>${t('Skip tour')}</button></div>`;tip.style.width=`${width}px`;tip.hidden=false;const height=tip.offsetHeight,left=Math.max(12,Math.min(innerWidth-width-12,rect.left));const top=rect.top>height+20?rect.top-height-10:Math.min(innerHeight-height-12,rect.bottom+10);tip.style.left=`${left}px`;tip.style.top=`${Math.max(12,top)}px`;
 };
 clearTourTarget();setTimeout(locate,80);
}
function startTour(){activeTour=safeTourSteps();localStorage.setItem(storageKey('tour-complete'),'false');showTourStep(0);}
function renderChatWelcome(){const chat=root()?.querySelector('#study-helper-chat');if(chat&&!chat.children.length)chat.insertAdjacentHTML('beforeend',`<div class="study-helper-message helper-reply">${t('Hi! Ask me about a lesson and we’ll figure it out together.')}</div>`);}
function showTeacherOffer(message){
 if(localStorage.getItem(storageKey('teacher-help-declined'))===todayKey())return;
 const count=Number(sessionStorage.getItem(storageKey('teacher-errors'))||0)+1;sessionStorage.setItem(storageKey('teacher-errors'),String(count));if(count<2||sessionStorage.getItem(storageKey('teacher-help-offered'))==='true')return;sessionStorage.setItem(storageKey('teacher-help-offered'),'true');teacherError=message||'';
 notice(`<span>${t('I noticed the course form showed an error more than once. Would you like help understanding it?')}</span><button type="button" data-helper-teacher-yes>${t('Yes, help me')}</button><button type="button" data-helper-teacher-no>${t('No, thanks')}</button><button type="button" data-helper-close aria-label="${t('Dismiss')}">×</button>`);
}
function showStudentOffer(question=''){
 const key=storageKey('student-help-offered');if(sessionStorage.getItem(key)==='true')return;sessionStorage.setItem(key,'true');
 notice(`<span>${t('Would a short explanation help with this question?')}</span><button type="button" data-helper-student-yes>${t('Yes, help me')}</button><button type="button" data-helper-student-no>${t('No, thanks')}</button><button type="button" data-helper-close aria-label="${t('Dismiss')}">×</button>`);
 root().dataset.helpQuestion=question;
}
function showHelpChoices(type){
 const chat=root()?.querySelector('#study-helper-chat');if(!chat)return;
 const teacher=type==='teacher',choices=teacher?[
  ['course','Course details'],['lesson','Lesson content'],['test','Test questions'],['save','Saving or publishing']
 ]:[['question','Understand the question'],['idea','Review the main idea'],['steps','Work through the steps']];
 chat.insertAdjacentHTML('beforeend',`<div class="study-helper-message helper-reply">${t(teacher?'Which part would you like to look at first?':'What would be most useful: understanding the question, reviewing the idea, or working through the steps?')}</div><div class="study-helper-choices">${choices.map(([id,label])=>`<button type="button" data-helper-choice="${id}" data-helper-choice-type="${type}">${t(label)}</button>`).join('')}</div>`);chat.scrollTop=chat.scrollHeight;
}
function checkReminder(goals){
 if(currentRole!=='STUDENT'||localStorage.getItem(storageKey('reminders'))==='false')return;
 const introSeen=localStorage.getItem(storageKey('intro-seen'))==='true',noticeOpen=root()?.querySelector('#study-helper-notice')?.hidden===false,panelOpen=root()?.querySelector('#study-helper-panel')?.hidden===false;if(!introSeen||noticeOpen||panelOpen||activeTour)return;
 const goal=(goals||[]).find(item=>!item.completed&&item.progress<item.target);if(!goal||localStorage.getItem(storageKey('goal-reminder-date'))===todayKey())return;
 localStorage.setItem(storageKey('goal-reminder-date'),todayKey());
 notice(`<span>${t('Your daily goal')}: ${escapeHtml(goal.title)} (${goal.progress}/${goal.target}). ${t('Would you like to continue?')}</span><a href="#daily-goals" data-helper-close>${t('Open Daily Goals')}</a><button type="button" data-helper-close aria-label="${t('Dismiss')}">×</button><button type="button" data-helper-reminders-off>${t('Turn off reminders')}</button>`);
}

function wireWidget(){
 const widget=root(),launcher=widget.querySelector('#study-helper-launcher'),panel=widget.querySelector('#study-helper-panel'),noticeEl=widget.querySelector('#study-helper-notice'),tourTip=widget.querySelector('#study-helper-tour-tip');
 widget.querySelector('#study-helper-reminders').checked=localStorage.getItem(storageKey('reminders'))!=='false';
 launcher.onclick=()=>{if(widget.dataset.dragged==='true'){delete widget.dataset.dragged;return;}panel.hidden=!panel.hidden;launcher.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){renderChatWelcome();widget.querySelector('#study-helper-input').focus();}};
 widget.querySelector('#study-helper-close').onclick=widget.querySelector('#study-helper-minimize').onclick=()=>{panel.hidden=true;launcher.setAttribute('aria-expanded','false');};
 widget.querySelector('#study-helper-tour').onclick=startTour;
 widget.querySelector('#study-helper-reminders').onchange=event=>{localStorage.setItem(storageKey('reminders'),String(event.target.checked));if(!event.target.checked)closeNotice();};
 widget.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-helper-close')){closeNotice();if(pendingGoals)checkReminder(pendingGoals);}
  if(button.hasAttribute('data-helper-reminders-off')){localStorage.setItem(storageKey('reminders'),'false');widget.querySelector('#study-helper-reminders').checked=false;closeNotice();}
  if(button.hasAttribute('data-helper-later')){localStorage.setItem(storageKey('intro-seen'),'true');closeNotice();if(pendingGoals)checkReminder(pendingGoals);}
  if(button.hasAttribute('data-helper-tour-start')){localStorage.setItem(storageKey('intro-seen'),'true');closeNotice();startTour();}
  if(button.hasAttribute('data-helper-next')){clearTourTarget();showTourStep(tourIndex+1);}
  if(button.hasAttribute('data-helper-skip'))endTour();
  if(button.hasAttribute('data-helper-teacher-no')){localStorage.setItem(storageKey('teacher-help-declined'),todayKey());closeNotice();}
  if(button.hasAttribute('data-helper-teacher-yes')){closeNotice();openPanel();showHelpChoices('teacher');}
  if(button.hasAttribute('data-helper-student-no'))closeNotice();
  if(button.hasAttribute('data-helper-student-yes')){closeNotice();openPanel();showHelpChoices('student');}
  if(button.hasAttribute('data-helper-choice')){const type=button.dataset.helperChoiceType,id=button.dataset.helperChoice,question=widget.dataset.helpQuestion||'',labels={course:'Course details',lesson:'Lesson content',test:'Test questions',save:'Saving or publishing',question:'Understand the question',idea:'Review the main idea',steps:'Work through the steps'},input=widget.querySelector('#study-helper-input');input.value=type==='teacher'?`${t('I am a teacher creating a course. The form showed this error:')} ${teacherError}. ${t('I would like help with:')} ${t(labels[id])}. ${t('Please explain the likely cause and suggest clear steps. Do not edit, save or publish anything.')}`:`${t('I have tried this learning question a few times. Please help me with:')} ${t(labels[id])}. ${t('Do not guess details that are not in the question.')} ${question}`;input.focus();}
 });
 widget.querySelector('#study-helper-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,input=widget.querySelector('#study-helper-input'),chat=widget.querySelector('#study-helper-chat'),button=form.querySelector('button'),message=input.value.trim();if(!message||form.dataset.busy)return;form.dataset.busy='true';input.value='';chat.insertAdjacentHTML('beforeend',`<div class="study-helper-message helper-user">${escapeHtml(message)}</div><div class="study-helper-message helper-reply helper-thinking">${t('Thinking of a helpful way to explain…')}</div>`);chat.scrollTop=chat.scrollHeight;button.disabled=true;setExpression('thinking');try{const result=await postCall('ai/tutor',{message,language:locale().slice(0,2)},45000);chat.querySelector('.helper-thinking')?.remove();chat.insertAdjacentHTML('beforeend',`<div class="study-helper-message helper-reply">${escapeHtml(result.reply)}</div>`);setExpression('happy');}catch(error){chat.querySelector('.helper-thinking')?.remove();chat.insertAdjacentHTML('beforeend',`<div class="study-helper-message helper-reply">${escapeHtml(error.message||t('I could not get a reply. You can try again in a moment.'))}</div>`);setExpression('attentive');}finally{delete form.dataset.busy;button.disabled=false;input.focus();chat.scrollTop=chat.scrollHeight;}};
 const positionKey=storageKey('position');let pointer=null;
 try{const saved=JSON.parse(localStorage.getItem(positionKey)||'null');if(saved&&Number.isFinite(saved.left)&&Number.isFinite(saved.top))setPosition(saved.left,saved.top);}catch{}
 function setPosition(left,top){const maxLeft=Math.max(0,innerWidth-widget.offsetWidth),maxTop=Math.max(0,innerHeight-widget.offsetHeight),x=Math.max(0,Math.min(maxLeft,left)),y=Math.max(0,Math.min(maxTop,top));widget.style.left=`${x}px`;widget.style.top=`${y}px`;widget.style.right='auto';widget.style.bottom='auto';const above=y>innerHeight/2;for(const card of widget.querySelectorAll('.study-helper-panel,.study-helper-notice')){card.style.left=x>innerWidth/2?'auto':'0';card.style.right=x>innerWidth/2?'0':'auto';card.style.bottom=above?'74px':'auto';card.style.top=above?'auto':'74px';}}
 launcher.onpointerdown=event=>{if(!panel.hidden)return;const rect=widget.getBoundingClientRect();pointer={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,moved:false};launcher.setPointerCapture?.(event.pointerId);};
 launcher.onpointermove=event=>{if(!pointer)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;if(!pointer.moved&&Math.hypot(dx,dy)<6)return;pointer.moved=true;widget.dataset.dragged='true';setPosition(pointer.left+dx,pointer.top+dy);};
 const finish=()=>{if(!pointer)return;if(pointer.moved){const rect=widget.getBoundingClientRect();localStorage.setItem(positionKey,JSON.stringify({left:rect.left,top:rect.top}));setTimeout(()=>delete widget.dataset.dragged,0);}pointer=null;};launcher.onpointerup=finish;launcher.onpointercancel=finish;
 addEventListener('resize',()=>{const rect=widget.getBoundingClientRect();if(widget.style.left)setPosition(rect.left,rect.top);});
 const introKey=storageKey('intro-seen');if(!localStorage.getItem(introKey))setTimeout(()=>{if(!root())return;setExpression('happy');notice(`<span>${t('Hi! I’m your study buddy. I can show you around or answer a question. Would you like a short tour?')}</span><button type="button" data-helper-tour-start>${t('Take a mini tour')}</button><button type="button" data-helper-later>${t('Later')}</button><button type="button" data-helper-close aria-label="${t('Dismiss')}">×</button>`);localStorage.setItem(introKey,'true');},900);
 if(pendingGoals)checkReminder(pendingGoals);
 if(activeTour)setTimeout(()=>showTourStep(tourIndex),160);
}

let initialized=false;
export function mountStudyAssistant({role='STUDENT',userId='',post}){
 const priorIdentity=identity();currentRole=role;currentUserId=userId||'';if(priorIdentity!==identity())pendingGoals=null;postCall=post;
 if(!root()){document.body.insertAdjacentHTML('beforeend',widgetMarkup());wireWidget();}
 if(pendingGoals)checkReminder(pendingGoals);
 if(!initialized){initialized=true;
  addEventListener('study-assistant:goals',event=>{pendingGoals=event.detail?.goals||[];checkReminder(pendingGoals);});
  addEventListener('study-assistant:teacher-error',event=>showTeacherOffer(event.detail?.message||''));
  addEventListener('study-assistant:student-stuck',event=>showStudentOffer(event.detail?.question||''));
  addEventListener('hashchange',()=>{if(activeTour)setTimeout(()=>showTourStep(tourIndex),120);});
 }
}
export function unmountStudyAssistant(){clearTourTarget();activeTour=null;pendingGoals=null;root()?.remove();}
