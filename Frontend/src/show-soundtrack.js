import {finalistRevealDelay} from './show-cinematics';

export const SHOW_TRACKS=Object.freeze({
 menu:'/audio/brain-show/menu.mp3',
 characters:'/audio/brain-show/character-selection.mp3',
 gameplay:'/audio/brain-show/other-music.mp3',
 final:'/audio/brain-show/final-round.mp3',
 jingle:'/audio/brain-show/jingle.mp3',
 shortJingle:'/audio/brain-show/short-jingle.mp3'
});

// Local recordings share the game's gesture, mute, volume and scene lifecycle.
export function createShowSoundtrack(initial={}){
 let settings={volume:.3,muted:false,...initial},phase='intro',options={},unlocked=false,disposed=false;
 let music=null,clip=null,musicKey='',musicPlaying=false,clipPlaying=false,version=0,clipVersion=0,finaleTimer=null;
 const level=()=>settings.muted?0:Math.max(0,Math.min(1,Number(settings.volume)||0));
 const desiredMusic=()=>phase==='intro'?(options.selectingCharacter?'characters':'menu'):phase==='results'||options.finalRound?'final':'gameplay';
 function volumes(){
  if(music){music.muted=!!settings.muted;music.volume=level()*(clipPlaying?.12:.42);}
  if(clip){clip.muted=!!settings.muted;clip.volume=level()*.72;}
 }
 function stopClip(){clipVersion++;if(clip){clip.pause();clip.currentTime=0;}clipPlaying=false;volumes();}
 function syncMusic(){
  if(!unlocked||disposed||typeof globalThis.Audio!=='function')return;
  if(!music){music=new Audio();music.loop=true;music.preload='auto';music.onerror=()=>{musicPlaying=false;};}
  const next=desiredMusic();
  if(next!==musicKey){version++;music.pause();music.currentTime=0;musicPlaying=false;musicKey=next;music.src=SHOW_TRACKS[next];}
  volumes();
  if(settings.muted){version++;music.pause();musicPlaying=false;return;}
  if(!music.paused&&musicPlaying)return;
  const request=++version;
  try{Promise.resolve(music.play()).then(()=>{if(!disposed&&request===version)musicPlaying=true;}).catch(()=>{if(request===version)musicPlaying=false;});}catch{musicPlaying=false;}
 }
 function play(name){
  if(!unlocked||disposed||settings.muted||!SHOW_TRACKS[name]||typeof globalThis.Audio!=='function')return;
  stopClip();
  if(!clip){clip=new Audio();clip.preload='auto';clip.onended=clip.onerror=()=>{clipPlaying=false;volumes();};}
  clip.src=SHOW_TRACKS[name];clip.currentTime=0;clipPlaying=true;volumes();const request=++clipVersion;
  try{Promise.resolve(clip.play()).catch(()=>{if(request===clipVersion){clipPlaying=false;volumes();}});}catch{clipPlaying=false;volumes();}
 }
 function setPhase(next,nextOptions={}){
  if(disposed)return;
  const changed=phase!==next;
  phase=next||'intro';options={...nextOptions};
  if(changed){clearTimeout(finaleTimer);finaleTimer=null;stopClip();}
  syncMusic();
  if(changed&&phase==='results'){
   const count=Math.max(1,Math.min(4,Number(options.winnerCount)||4));
   const delay=options.reducedMotion?0:finalistRevealDelay(0,count)+.12;
   finaleTimer=setTimeout(()=>{finaleTimer=null;play('jingle');},delay*1000);
  }
 }
 function unlock(){if(disposed)return;unlocked=true;syncMusic();}
 function updateSettings(next){if(disposed)return;settings={...settings,...next};if(settings.muted)stopClip();volumes();syncMusic();}
 function dispose(){if(disposed)return;disposed=true;version++;clipVersion++;clearTimeout(finaleTimer);for(const element of [music,clip])if(element){element.pause();element.removeAttribute('src');element.load();}musicPlaying=clipPlaying=false;}
 return {unlock,setPhase,play,updateSettings,dispose,isPlaying:()=>musicPlaying};
}
