import {FINAL_REVEAL,finalistRevealDelay,finaleDuration} from './show-cinematics';
import {createShowSoundtrack} from './show-soundtrack';

// Local Brain Show recordings accompany original outcome cues and timed drums.
// unlock() must run in a user gesture; settings apply to music and every cue.
export function createShowAudio(initial={}){
 const soundtrack=createShowSoundtrack(initial);
 let settings={volume:.3,muted:false,...initial},context=null,master=null,loop=null,beat=0,disposed=false;
 let phase='intro',phaseStartedAt=performance.now()/1000,phaseOptions={},finaleScheduled=false;
 const voices=new Set();
 const gain=()=>settings.muted?0:Math.max(0,Math.min(1,Number(settings.volume)||0));
 function voice(source,nodes,start,end){
  voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();nodes.forEach(node=>node.disconnect());};
  source.start(start);source.stop(end);
 }
 function tone(frequency,start,duration=.2,type='sine',volume=.15){
  if(!context||disposed)return;
  const osc=context.createOscillator(),env=context.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,start);
  env.gain.setValueAtTime(.0001,start);env.gain.linearRampToValueAtTime(volume,start+.012);env.gain.exponentialRampToValueAtTime(.0001,start+duration);
  osc.connect(env).connect(master);voice(osc,[env],start,start+duration+.02);
 }
 function melody(notes,step=.12,type='sine',volume=.15,start=context?.currentTime){
  if(!context||disposed)return;notes.forEach((note,i)=>tone(note,start+i*step,step*1.7,type,volume));
 }
 function noise(start,duration=.09,volume=.15,frequency=1400,type='bandpass'){
  if(!context||disposed)return;
  const buffer=context.createBuffer(1,Math.max(1,Math.ceil(context.sampleRate*duration)),context.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  const source=context.createBufferSource(),filter=context.createBiquadFilter(),env=context.createGain();source.buffer=buffer;
  filter.type=type;filter.frequency.setValueAtTime(frequency,start);filter.Q.value=.65;
  env.gain.setValueAtTime(volume,start);env.gain.exponentialRampToValueAtTime(.0001,start+duration);
  source.connect(filter).connect(env).connect(master);voice(source,[filter,env],start,start+duration+.02);
 }
 function drum(start,volume=.15){
  if(!context)return;const osc=context.createOscillator(),env=context.createGain();osc.type='sine';
  osc.frequency.setValueAtTime(145,start);osc.frequency.exponentialRampToValueAtTime(48,start+.15);
  env.gain.setValueAtTime(volume,start);env.gain.exponentialRampToValueAtTime(.0001,start+.24);
  osc.connect(env).connect(master);voice(osc,[env],start,start+.26);
 }
 function applause(start=context?.currentTime){if(!context)return;for(let i=0;i<12;i++)noise(start+i*.08,.13,.07,1050,'highpass');}
 function stopVoices(){for(const source of voices){try{source.stop();}catch{}}voices.clear();}
 function scoreBeat(){
  if(!context||context.state!=='running'||settings.muted||soundtrack.isPlaying()||!['preview','question','rules'].includes(phase))return;
  const now=context.currentTime,bass=[110,110,146.83,130.81][Math.floor(beat/8)%4],soft=phase==='question'?1:.6;
  if(beat%2===0)tone(bass,now,.48,'sine',.065*soft);
  if(beat%4===2)tone(bass*4,now,.27,'triangle',.024*soft);
  if(beat%4===0)drum(now,.045*soft);
  if(beat%2===1)noise(now,.035,.015*soft,3400,'highpass');
  beat++;
 }
 function scheduleFinale(){
  if(!context||disposed||finaleScheduled)return;finaleScheduled=true;
  if(settings.reducedMotion||phaseOptions.reducedMotion){
   melody([392,523.25,659.25,783.99,1046.5],.16,'triangle',.16);applause(context.currentTime+.4);return;
  }
  const count=Math.max(1,Math.min(4,Number(phaseOptions.winnerCount)||4));
  const elapsed=Math.max(0,performance.now()/1000-phaseStartedAt),origin=context.currentTime-elapsed;
  // Fourth place opens the ceremony. First place is held back for the final roll.
  for(let index=count-1;index>=0;index--){
   const reveal=finalistRevealDelay(index,count),rollStart=Math.max(0,reveal-(index===count-1?FINAL_REVEAL.leadIn:1.55));
   for(let time=rollStart;time<reveal-.025;){
    const progress=(time-rollStart)/Math.max(.01,reveal-rollStart);
    if(time>=elapsed) {noise(origin+time,.075,.045+progress*.10,1550);if(Math.floor(time*12)%2===0)drum(origin+time,.025+progress*.025);}
    time+=.10-progress*.045;
   }
   if(reveal>=elapsed){
    drum(origin+reveal,.20);noise(origin+reveal,.8,.13,4200,'highpass');
    const root=index===0?261.63:196;[root,root*1.25,root*1.5].forEach(note=>tone(note,origin+reveal,.65,'triangle',.065));
    if(index===0){melody([392,523.25,659.25,783.99,1046.5],.16,'triangle',.16,origin+reveal+.12);applause(origin+reveal+.5);}
   }
  }
  const end=finaleDuration(count);
  for(let time=0;time<end;time+=.82)if(time>=elapsed){tone([98,130.81,146.83,196][Math.floor(time/.82)%4],origin+time,.78,'sine',.042);}
 }
 async function unlock(){
  if(disposed)return;
  soundtrack.unlock();
  try{
   if(!context){
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    context=new Audio();master=context.createGain();master.gain.value=gain();master.connect(context.destination);loop=setInterval(scoreBeat,210);
   }
   if(context.state==='suspended')await context.resume();
   if(phase==='results')scheduleFinale();
  }catch{/* Gameplay remains available if the browser refuses sound. */}
 }
 function setPhase(next,options={}){
  soundtrack.setPhase(next,options);
  phaseOptions={...phaseOptions,...options};
  if(next===phase)return;
  phase=next||'intro';phaseStartedAt=performance.now()/1000;beat=0;finaleScheduled=false;
  stopVoices();if(phase==='results')scheduleFinale();
 }
 function play(name){
  if(!context||disposed||settings.muted)return;
  const now=context.currentTime;
  switch(name){
   case 'intro':soundtrack.play('jingle');break;
   case 'buzzer':tone(180,now,.15,'triangle',.18);tone(360,now+.04,.1,'sine',.10);break;
   case 'correct':soundtrack.play('shortJingle');melody([523.25,659.25,783.99],.13,'sine',.22);applause(now+.3);break;
   case 'wrong':melody([293.66,246.94,196],.14,'triangle',.18);tone(98,now,.38,'sine',.08);break;
   case 'tick':tone(880,now,.045,'sine',.13);break;
   case 'victory':if(phase!=='results'){setPhase('results');}break;
   case 'applause':applause();break;
  }
 }
 function updateSettings(next){settings={...settings,...next};soundtrack.updateSettings(next);if(master)master.gain.setTargetAtTime(gain(),context.currentTime,.05);}
 function dispose(){if(disposed)return;disposed=true;clearInterval(loop);stopVoices();soundtrack.dispose();context?.close().catch(()=>{});}
 return {unlock,play,setPhase,updateSettings,dispose};
}
