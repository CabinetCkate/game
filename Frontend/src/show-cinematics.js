import {t,locale} from './i18n';
import {playerPortrait} from './quiz-library';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The TV holds for three seconds, then the director pulls back over two seconds.
// Shared timing keeps the camera, scoreboard reveal and original soundtrack together.
export const TV_HOLD_SECONDS=3;
export const CAMERA_PULLBACK_SECONDS=2;
export const FINAL_REVEAL=Object.freeze({leadIn:.65,step:2.05,fade:.65});
export function finalistRevealDelay(index,count){
 const size=Math.max(1,Math.min(4,count));
 return FINAL_REVEAL.leadIn+(size-1-index)*FINAL_REVEAL.step;
}
export function finaleDuration(count){return finalistRevealDelay(0,count)+FINAL_REVEAL.fade;}
export const finalRevealDuration=finaleDuration;
export function smoothCameraProgress(progress){const value=Math.max(0,Math.min(1,progress));return value*value*(3-2*value);}
// Correctness is intentionally ignored while players are choosing an answer.
export function revealedAnswerOutcome(state,participant,index){
 if(state?.phase!=='feedback')return null;
 if(state.online){
  const value=participant?.isCorrect??participant?.roundCorrect;
  if(typeof value==='boolean')return value;
  return participant?.id===state.selfId&&typeof state.result?.isCorrect==='boolean'?state.result.isCorrect:null;
 }
 const feedback=state.result||state.feedback||{};
 if(!participant?.isBot&&index===0)return typeof feedback.isCorrect==='boolean'?feedback.isCorrect:null;
 const answer=(feedback.bots||feedback.botAnswers||[]).find(item=>item.participantId===participant?.id||item.id===participant?.id);
 return typeof answer?.isCorrect==='boolean'?answer.isCorrect:null;
}
export function podiumMarkup(players){
 const finalists=players.slice(0,4);
 return `<div class="show-podium-ranking" style="--finale-duration:${finaleDuration(finalists.length)}s" aria-label="${t('Top 4')}">${finalists.map((p,i)=>`<article class="show-finalist" data-finalist-rank="${i+1}" style="--reveal-delay:${finalistRevealDelay(i,finalists.length)}s;--rank-color:${['#ffd38a','#b9d5ed','#e7b08a','#bfa8ed'][i]}"><span class="show-place-number">${i+1}</span>${playerPortrait(p)}<strong data-user-content>${esc(p.name)}</strong><b>${new Intl.NumberFormat(locale()).format(p.score)}</b><small>${t('Place')} ${i+1}</small></article>`).join('')}</div>`;
}
