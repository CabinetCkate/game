import {t} from './i18n';

export function themeControl(){
 const light=localStorage.getItem('theme')==='light';
 return `<button type="button" data-theme-toggle class="theme-switch" aria-pressed="${light}" aria-label="${t('Switch theme')}" title="${t('Switch theme')}"><span aria-hidden="true">${light?'☀':'☾'}</span><span data-theme-label>${t(light?'Light theme':'Dark theme')}</span></button>`;
}
export function applyPreferences(){
 const light=localStorage.getItem('theme')==='light';
 document.documentElement.dataset.theme=light?'light':'dark';
 document.documentElement.classList.toggle('reduce-motion',localStorage.getItem('reduceMotion')==='true');
 const settingsToggle=document.querySelector('#theme-toggle');if(settingsToggle)settingsToggle.checked=light;
 document.querySelectorAll('[data-theme-toggle]').forEach(button=>{
  button.setAttribute('aria-pressed',String(light));
  button.innerHTML=`<span aria-hidden="true">${light?'☀':'☾'}</span><span data-theme-label>${t(light?'Light theme':'Dark theme')}</span>`;
 });
}
document.addEventListener('click',event=>{
 if(!event.target.closest('[data-theme-toggle]'))return;
 localStorage.setItem('theme',localStorage.getItem('theme')==='light'?'dark':'light');
 applyPreferences();
});
window.addEventListener('languagechange',applyPreferences);
