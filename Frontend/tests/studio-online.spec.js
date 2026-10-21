import {test,expect} from '@playwright/test';
const source='Mercury is the closest planet to the Sun. Venus has a thick atmosphere. Earth has one natural satellite. Mars is called the red planet.';
test.setTimeout(90000);

async function readableText(page,selector,surface){
 const contrast=await page.locator(selector).first().evaluate((node,surface)=>{
  const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number),lum=color=>{const values=rgb(color).map(value=>{const channel=value/255;return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;});return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
  const background=surface?node.closest(surface):node;
  const foreground=lum(getComputedStyle(node).color),back=lum(getComputedStyle(background).backgroundColor);
  return (Math.max(foreground,back)+.05)/(Math.min(foreground,back)+.05);
 },surface);
 expect(contrast,selector+' text contrast').toBeGreaterThanOrEqual(4.5);
}

test('source text creates a real room, preserves drafts, and reveals synchronized questions and podiums',async({browser,request})=>{
 const contexts=[],errors=[];
 async function player(name){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);
  await context.addInitScript(token=>{if(!sessionStorage.getItem('refreshToken'))sessionStorage.setItem('refreshToken',token);localStorage.setItem('language','en');localStorage.setItem('showSettings',JSON.stringify({quality:'low',muted:true}));},'fixture-studio-'+name.toLowerCase()+'-refresh');
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return page;
 }
 try{
  const host=await player('Author'),guest=await player('Friend');
  await host.goto('/#show?mode=online');await expect(host.locator('.connection-state')).toHaveText('Connected');
  await host.locator('[name=title]').fill('Solar system');await host.locator('[name=sourceText]').fill(source);await host.locator('[name=questionCount]').fill('2');await host.locator('[name=roundSeconds]').fill('10');await host.locator('[data-online-avatar="maya"]').click();await expect(host.locator('[name=avatarId]')).toHaveValue('maya');
  await host.locator('.show-top [data-language]').selectOption('kk');await expect(host.locator('[name=title]')).toHaveValue('Solar system');await expect(host.locator('[name=sourceText]')).toHaveValue(source);
  await host.locator('.show-top [data-theme-toggle]').click();await expect(host.locator('html')).toHaveAttribute('data-theme','light');
  await host.locator('.show-top [data-language]').selectOption('en');await expect(host.locator('[name=avatarId]')).toHaveValue('maya');
  await host.locator('.show-top [data-language]').selectOption('kk');await host.locator('#create-room .btn-primary').click();await expect(host.locator('.room-code')).toBeVisible();const code=await host.locator('.room-code').innerText();
  await guest.goto('/#show?mode=online&room='+code);await expect(guest.locator('.room-code')).toHaveText(code);await expect(host.locator('.quiz-player-list li')).toHaveCount(2);
  await guest.locator('[data-online-avatar="leo"]').click();await expect(guest.locator('[data-online-avatar="leo"]')).toHaveAttribute('aria-pressed','true');
  await host.locator('#start-game').click();await expect(host.locator('.show-preview-note')).toBeVisible();await expect(guest.locator('.show-preview-note')).toBeVisible();await expect(host.locator('[data-option]')).toHaveCount(0);
  for(const page of [host,guest])expect((await page.locator('.show-viewport').boundingBox()).height).toBe(1000);
  for(const page of [host,guest]){await expect(page.locator('.room-code,.quiz-player-list,.online-heading')).toHaveCount(0);await expect(page.locator('.show-scores')).toBeHidden();}
  await host.screenshot({path:'../artifacts/show/online-television.png'});
  await expect(host.locator('.quiz-stage .question')).toHaveText('Күнге ең жақын планета қайсы?',{timeout:10000});await expect(guest.locator('.quiz-stage .question')).toHaveText('Which planet is closest to the Sun?');
  for(const page of [host,guest]){expect((await page.locator('.show-viewport').boundingBox()).height).toBe(1000);expect((await page.locator('.quiz-stage').boundingBox()).y).toBeGreaterThan(600);}
  for(const page of [host,guest]){await readableText(page,'.quiz-stage .question','.quiz-stage');await readableText(page,'.quiz-stage h2','.quiz-stage');await readableText(page,'.quiz-stage .answer-option');}
  await host.screenshot({path:'../artifacts/show/online-question-light.png'});
  await guest.screenshot({path:'../artifacts/show/online-question-dark.png'});
  const correctId=await host.locator('[data-option]').filter({hasText:'Меркурий'}).getAttribute('data-option');
  await host.locator('[data-option]').filter({hasText:'Меркурий'}).click();await expect(host.locator('.answer-selected')).toHaveCount(1);await expect(host.locator('.answer-correct,.answer-wrong')).toHaveCount(0);await expect(guest.locator('.answer-correct,.answer-wrong')).toHaveCount(0);
  await host.locator('.show-top [data-language]').selectOption('en');await expect(host.locator('.quiz-stage .question')).toHaveText('Which planet is closest to the Sun?');await expect(host.locator('.answer-selected')).toHaveAttribute('data-option',correctId);await expect(host.locator('.answer-correct,.answer-wrong')).toHaveCount(0);
  await guest.locator('[data-option]').filter({hasText:'Venus'}).click();await expect(host.locator('.answer-correct')).toHaveCount(1,{timeout:15000});await expect(guest.locator('.answer-wrong')).toHaveCount(1);await expect(guest.locator('.answer-correct')).toHaveCount(1);
  await readableText(host,'.answer-correct');await readableText(host,'.quiz-feedback.correct','.quiz-stage');await readableText(guest,'.answer-wrong');
  for(const page of [host,guest]){await expect(page.locator('.room-code,.quiz-player-list,.online-heading')).toHaveCount(0);await expect(page.locator('.show-scores')).toBeVisible();}
  await guest.reload();await expect(guest.locator('.answer-wrong')).toHaveCount(1);await expect(guest.locator('.answer-correct')).toHaveCount(1);await expect(guest.locator('.room-code')).toHaveCount(0);
  await host.getByRole('button',{name:'Next question',exact:true}).click();await expect(host.locator('.show-preview-note')).toBeVisible();await expect(host.locator('[data-option]')).toHaveCount(0);
  await expect(host.locator('.quiz-stage .question')).toHaveText('Which planet is called the red planet?',{timeout:10000});
  await host.locator('[data-option]').filter({hasText:'Mars'}).click();await guest.locator('[data-option]').filter({hasText:'Mars'}).click();
  await expect(host.locator('#next-round')).toBeVisible({timeout:15000});await host.getByRole('button',{name:'Next question',exact:true}).click();await expect(host.locator('.show-finalist')).toHaveCount(2);await expect(guest.locator('.show-finalist')).toHaveCount(2);await expect(host.locator('.show-place-number')).toHaveText(['1','2']);
  await expect(host.locator('.show-modes')).toBeHidden();await expect(guest.locator('.show-modes')).toBeHidden();await host.waitForTimeout(4800);await host.screenshot({path:'../artifacts/show/online-podium-1440.png',fullPage:true});
  await host.setViewportSize({width:390,height:844});await host.waitForTimeout(300);expect(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await host.screenshot({path:'../artifacts/show/online-podium-390.png',fullPage:true});
  await host.locator('#exit-game').click();await expect(host.locator('.show-modes')).toBeVisible();await expect(host.locator('[name=sourceText]')).toHaveValue(source);await expect(host.locator('[name=title]')).toHaveValue('Solar system');await expect(host.locator('[name=avatarId]')).toHaveValue('maya');expect(await host.evaluate(()=>sessionStorage.getItem('gameRoom'))).toBeNull();
  await host.screenshot({path:'../artifacts/show/online-create-light-390.png',fullPage:true});
  await host.evaluate(()=>{window.onlineModeFlashes=[];window.modeObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof Element&&(node.matches('.show-online,.room-banner,#create-room')||node.querySelector('.show-online,.room-banner,#create-room')))window.onlineModeFlashes.push(node.className);});window.modeObserver.observe(document.querySelector('.show-overlay'),{childList:true,subtree:true});});
  await host.getByRole('button',{name:'Solo with bots',exact:true}).click();await expect(host.locator('.knowledge-show')).toHaveAttribute('data-mode','solo');await expect(host.locator('#show-course')).toBeVisible();await expect(host.locator('.show-online,.room-banner,#create-room')).toHaveCount(0);await host.waitForTimeout(400);
  expect(await host.evaluate(()=>{window.modeObserver.disconnect();return window.onlineModeFlashes;})).toEqual([]);
  expect(errors).toEqual([]);
 }finally{for(const context of contexts)await context.close();}
});

test('studio supports eight real characters, ranked lights, repeated television holds and reduced motion',async({page})=>{
 await page.goto('/');
 const initial=await page.evaluate(async()=>{
  const {createStudio}=await import('/src/show-studio.js');
  document.body.innerHTML='<div id="scene-check" style="position:fixed;inset:0"></div>';
  window.sceneCheck=createStudio(document.querySelector('#scene-check'),{quality:'low'});await window.sceneCheck.ready;
  const participants=Array.from({length:8},(_,i)=>({id:'p'+i,avatarId:['maya','leo','nova','atlas'][i%4],name:'Player '+(i+1),score:800-i*100}));
  window.sceneCheck.setState({id:'room',online:true,phase:'preview',questionIndex:0,question:{question:'Which planet is closest to the Sun?'},participants,serverNow:new Date().toISOString(),answerOpensAt:new Date(Date.now()+5000).toISOString()});
  return {count:window.sceneCheck.characters.length,camera:window.sceneCheck.cameraName};
 });
 expect(initial).toEqual({count:8,camera:'television'});
 await page.waitForTimeout(2200);expect(await page.evaluate(()=>window.sceneCheck.cameraName)).toBe('television');
 await expect.poll(()=>page.evaluate(()=>window.sceneCheck.cameraName),{timeout:3000}).toBe('game');
 const moving=await page.evaluate(()=>{const s=window.sceneCheck;return {remaining:s.camera.position.distanceTo(s.cameraDestination),duration:s.cameraTransition?.duration};});
 expect(moving.duration).toBe(2);expect(moving.remaining).toBeGreaterThan(.1);
 await page.waitForTimeout(700);
 expect(await page.evaluate(()=>window.sceneCheck.camera.position.distanceTo(window.sceneCheck.cameraDestination))).toBeGreaterThan(.1);
 const continuous=await page.evaluate(()=>{const s=window.sceneCheck,now=performance.now();Object.defineProperty(performance,'now',{value:()=>now,configurable:true});try{s.updateCameraMotion();const from=s.camera.position.clone(),gaze=s.lookAt.clone(),end=s.cameraTransition.startedAt+s.cameraTransition.duration;s.container.style.height='95vh';s.resize();return {position:s.camera.position.distanceTo(from),gaze:s.lookAt.distanceTo(gaze),end:s.cameraTransition.startedAt+s.cameraTransition.duration,previousEnd:end};}finally{delete performance.now;}});
 expect(continuous.position).toBeLessThan(.2);expect(continuous.gaze).toBeLessThan(.1);expect(continuous.end).toBeCloseTo(continuous.previousEnd,1);
 await page.waitForTimeout(1500);
 expect(await page.evaluate(()=>window.sceneCheck.camera.position.distanceTo(window.sceneCheck.cameraDestination))).toBeLessThan(.01);
 const heads=await page.evaluate(()=>{const s=window.sceneCheck;s.container.style.height='';s.resize();return s.characters.map(actor=>{const point=actor.root.position.clone();point.y+=1.7;point.project(s.camera);return (1-point.y)/2;});});expect(heads.every(y=>y>0&&y<.55)).toBeTruthy();
 const desktopViewport=page.viewportSize();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1100);
 const portraitHeads=await page.evaluate(()=>{const s=window.sceneCheck;return s.characters.map(actor=>{const point=actor.root.position.clone();point.y+=1.7;point.project(s.camera);return {x:(point.x+1)/2,y:(1-point.y)/2};});});expect(portraitHeads.every(point=>point.x>.01&&point.x<.99&&point.y>0&&point.y<.55)).toBeTruthy();
 await page.screenshot({path:'../artifacts/show/eight-players-game-390.png'});await page.setViewportSize(desktopViewport);await page.waitForTimeout(1100);
 const early=await page.evaluate(()=>{
  const s=window.sceneCheck;s.setState({...s.state,phase:'question',participants:s.state.participants.map((p,i)=>({...p,answered:true,isCorrect:i%2===0}))});
  return s.podiums.map(p=>p.outcome);
 });expect(early.every(outcome=>outcome===null)).toBeTruthy();
 await page.evaluate(()=>{const s=window.sceneCheck;s.setState({...s.state,phase:'feedback'});});await page.waitForTimeout(600);
 const revealed=await page.evaluate(()=>window.sceneCheck.podiums.map(p=>({correct:p.outcome,color:p.accent.color.getHexString(),lit:p.answerLight.intensity>0})));
 expect(revealed.map(p=>p.correct)).toEqual([true,false,true,false,true,false,true,false]);
 expect(revealed.every(p=>p.lit&&p.color===(p.correct?'46e69a':'ff536d'))).toBeTruthy();
 const repeated=await page.evaluate(()=>{
  const studio=window.sceneCheck;
  studio.setState({...studio.state,phase:'preview',questionIndex:1,question:{question:'A new question'},participants:studio.state.participants.map(p=>({...p,answered:false,isCorrect:null})),serverNow:new Date().toISOString(),answerOpensAt:new Date(Date.now()+5000).toISOString()});return studio.cameraName;
 });expect(repeated).toBe('television');
 await page.evaluate(()=>{const studio=window.sceneCheck;studio.setState({...studio.state,phase:'results',participants:studio.state.participants.slice(0,4),winnerId:'p0'});});
 await page.waitForTimeout(1000);
 const fourth=await page.evaluate(()=>window.sceneCheck.finalLights.map(l=>l.intensity));
 expect(fourth.slice(0,3)).toEqual([0,0,0]);expect(fourth[3]).toBeGreaterThan(0);
 await page.waitForTimeout(2000);
 const third=await page.evaluate(()=>window.sceneCheck.finalLights.map(l=>l.intensity));
 expect(third.slice(0,2)).toEqual([0,0]);expect(third[2]).toBeGreaterThan(0);
 await page.waitForTimeout(4700);
 const final=await page.evaluate(()=>({camera:window.sceneCheck.cameraName,characters:window.sceneCheck.characters.map(c=>c.participantId),lights:window.sceneCheck.finalLights.map(l=>l.intensity),ambient:window.sceneCheck.ambientLight.intensity}));
 expect(final.camera).toBe('finale');expect(final.characters).toEqual(['p0','p1','p2','p3']);expect(final.lights.every(n=>n>0)).toBeTruthy();expect(final.ambient).toBeLessThan(.2);
 await page.screenshot({path:'../artifacts/show/online-four-winners-scene.png'});
 expect(await page.evaluate(()=>{const s=window.sceneCheck;s.updateSettings({reducedMotion:true});s.setState({...s.state,phase:'preview',questionIndex:2,serverNow:new Date().toISOString(),answerOpensAt:new Date(Date.now()+5000).toISOString()});return s.camera.position.distanceTo(s.cameraDestination);})).toBe(0);
 await page.evaluate(()=>window.sceneCheck.dispose());await expect(page.locator('canvas')).toHaveCount(0);
});

test('fallback sound starts after interaction, honors mute and schedules a separate drum roll for every finalist',async({page})=>{
 await page.goto('/');
 const sound=await page.evaluate(async()=>{
  const original=window.AudioContext,originalAudio=window.Audio,created=[],starts=[],frequencies=[];let closed=false;
  const parameter=()=>({value:0,setValueAtTime(value){this.value=value;},linearRampToValueAtTime(value){this.value=value;},exponentialRampToValueAtTime(value){this.value=value;},setTargetAtTime(value){this.value=value;}});
  class Node{constructor(kind){this.kind=kind;this.type=kind;this.frequency=parameter();this.gain=parameter();this.Q={value:0};}connect(next){return next;}disconnect(){}start(time){starts.push({type:this.kind,time});if(this.kind==='oscillator')frequencies.push(this.frequency.value);}stop(){}}
  class Context{constructor(){created.push(this);this.currentTime=10;this.state='suspended';this.sampleRate=1000;this.destination=new Node('destination');}createGain(){return new Node('gain');}createOscillator(){return new Node('oscillator');}createBiquadFilter(){return new Node('filter');}createBufferSource(){return new Node('noise');}createBuffer(_,length){return {getChannelData:()=>new Float32Array(length)};}resume(){this.state='running';return Promise.resolve();}close(){closed=true;return Promise.resolve();}}
  window.AudioContext=Context;
  window.Audio=class{constructor(){this.paused=true;}play(){return Promise.reject(Error('Recording unavailable'));}pause(){this.paused=true;}removeAttribute(){}load(){}};
  try{
   const {createShowAudio}=await import('/src/show-audio.js'),audio=createShowAudio({volume:.3});
   audio.setPhase('question');const before=created.length;await audio.unlock();await new Promise(resolve=>setTimeout(resolve,240));const music=starts.length;
   audio.updateSettings({muted:true});const mutedAt=starts.length;audio.play('correct');const muted=starts.length===mutedAt;
   audio.updateSettings({muted:false});audio.setPhase('feedback');audio.play('correct');const correct=frequencies.slice(-3);
   audio.play('wrong');const wrong=frequencies.slice(-4);
   const finaleAt=starts.length;audio.setPhase('results',{winnerCount:4});const finale=starts.slice(finaleAt);const once=starts.length;audio.setPhase('results',{winnerCount:4});const stable=starts.length===once;
   audio.dispose();return {before,music,muted,correct,wrong,stable,closed,noiseCount:finale.filter(s=>s.type==='noise').length,finalTime:Math.max(...finale.map(s=>s.time))-10,earliest:Math.min(...finale.map(s=>s.time))};
  }finally{window.AudioContext=original;window.Audio=originalAudio;}
 });
 expect(sound.before).toBe(0);expect(sound.music).toBeGreaterThan(0);expect(sound.muted).toBeTruthy();expect(sound.correct).toEqual([523.25,659.25,783.99]);expect(sound.wrong).toEqual([293.66,246.94,196,98]);expect(sound.stable).toBeTruthy();expect(sound.noiseCount).toBeGreaterThan(55);expect(sound.finalTime).toBeGreaterThan(7);expect(sound.earliest).toBeGreaterThanOrEqual(10);expect(sound.closed).toBeTruthy();
});
test('Brain Show recordings decode locally and follow phase, mute, volume and disposal',async({page})=>{
 await page.goto('/#login');
 const report=await page.evaluate(async()=>{
  const {SHOW_TRACKS,createShowSoundtrack}=await import('/src/show-soundtrack.js');
  const durations={};
  for(const [name,url] of Object.entries(SHOW_TRACKS)){
   const element=new Audio(url);element.preload='metadata';
   durations[name]=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Audio metadata timeout: '+name)),10000);element.onloadedmetadata=()=>{clearTimeout(timer);resolve(element.duration);};element.onerror=()=>{clearTimeout(timer);reject(Error('Audio decode failed: '+name));};});
   element.removeAttribute('src');element.load();
  }
  const original=window.Audio,elements=[],plays=[];
  class Recording{constructor(){this.paused=true;this.src='';this.volume=0;elements.push(this);}play(){this.paused=false;plays.push(this.src);return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){this.src='';}load(){}}
  window.Audio=Recording;
  try{
   const soundtrack=createShowSoundtrack({volume:.5});soundtrack.setPhase('intro');const before=elements.length;
   soundtrack.unlock();await Promise.resolve();const menu=elements[0].src;
   soundtrack.setPhase('intro',{selectingCharacter:true});await Promise.resolve();const characters=elements[0].src;
   soundtrack.setPhase('question');await Promise.resolve();const gameplay=elements[0].src;
   soundtrack.setPhase('question',{finalRound:true});await Promise.resolve();const final=elements[0].src;
   soundtrack.play('shortJingle');const correct=elements[1].src,ducked=elements[0].volume;
   soundtrack.updateSettings({muted:true});const muted=elements.every(element=>element.paused&&element.volume===0);
   soundtrack.updateSettings({muted:false,volume:.6});await Promise.resolve();const resumed=!elements[0].paused&&elements[0].src===final,volume=elements[0].volume;
   soundtrack.setPhase('results',{winnerCount:1});await new Promise(resolve=>setTimeout(resolve,900));const award=elements[1].src;
   soundtrack.dispose();const stopped=elements.every(element=>element.paused&&element.src===''),count=plays.length;
   soundtrack.unlock();soundtrack.play('jingle');soundtrack.setPhase('intro');
   return {durations,before,menu,characters,gameplay,final,correct,award,ducked,muted,resumed,volume,stopped,disposedStable:plays.length===count};
  }finally{window.Audio=original;}
 });
 expect(Object.keys(report.durations)).toHaveLength(6);for(const duration of Object.values(report.durations))expect(duration).toBeGreaterThan(5);
 expect(report.before).toBe(0);expect(report.menu).toMatch(/menu\.mp3$/);expect(report.characters).toMatch(/character-selection\.mp3$/);expect(report.gameplay).toMatch(/other-music\.mp3$/);expect(report.final).toMatch(/final-round\.mp3$/);expect(report.correct).toMatch(/short-jingle\.mp3$/);expect(report.award).toMatch(/jingle\.mp3$/);expect(report.ducked).toBeLessThan(.1);expect(report.muted).toBeTruthy();expect(report.resumed).toBeTruthy();expect(report.volume).toBeCloseTo(.252);expect(report.stopped).toBeTruthy();expect(report.disposedStable).toBeTruthy();
});
test('solo question formats remain readable when switching studio themes',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('/#login');await expect(page.locator('#auth-form')).toBeVisible();
 await page.evaluate(async()=>{
  localStorage.setItem('showSettings',JSON.stringify({quality:'low',muted:true}));localStorage.setItem('theme','light');document.documentElement.dataset.theme='light';history.replaceState(null,'','#show?mode=solo');
  document.body.innerHTML='<main id="content"></main>';
  const now=Date.now(),characters=['nova','leo','maya','atlas'].map(id=>({id,name:id}));
  let session={id:'theme-session',phase:'question',questionIndex:0,questionCount:10,serverNow:new Date(now).toISOString(),participants:characters.map((character,index)=>({id:index?'bot'+index:'player',characterId:character.id,name:character.name,isBot:index>0,score:0})),adaptive:{difficulty:'EASY'},currentQuestion:{index:0,round:'classic',roundTitle:'Классикалық раунд',title:'Қазақстан географиясы',question:'Қазақстанның ең үлкен қалаларының бірі қайсы?',rules:'Берілген жауаптардың бірін таңдаңыз.',taskType:'MULTIPLE_CHOICE',options:[{id:'a',text:'Алматы'},{id:'b',text:'Париж'},{id:'c',text:'Лондон'}],content:{},startedAt:new Date(now-1000).toISOString(),deadline:new Date(now+120000).toISOString(),timeLimit:120}};
  window.nextSoloFormat=(type,round='classic')=>{session={...session,hint:round==='wager'?'Сұрақтағы ақпаратқа назар аударыңыз.':null,currentQuestion:{...session.currentQuestion,taskType:type,round,maxWager:100,wager:0,content:type==='SEQUENCE'?{items:['Бірінші','Екінші','Үшінші']}:type==='MATCHING'?{left:['Қала','Ел'],right:['Алматы','Қазақстан']}:type==='NUMERIC'?{unit:'км'}:{}}};};
  window.soloThemeFeedback=()=>{session={...session,phase:'feedback',feedback:{isCorrect:true,roundTitle:'Классикалық раунд',scoreDelta:1000,xpEarned:100,level:2,totalXP:100,explanation:'Алматы — Қазақстанның ірі қалаларының бірі.',achievements:[]}};};
  const {showPage}=await import('/src/show.js');
  const api=async path=>path.startsWith('show/catalog')?{characters,courses:[]}:{...structuredClone(session),serverNow:new Date().toISOString()};
  window.disposeThemeStudio=await showPage(document.querySelector('#content'),{api,refresh:async()=>{},getToken:()=>'',icon:()=>'',hydrate:()=>{},toast:()=>{},student:{id:'theme-player',firstName:'Theme'},registerDispose:()=>{}});
 });
 await expect(page.locator('.show-question-panel')).toBeVisible();
 expect((await page.locator('.show-viewport').boundingBox()).height).toBe(1000);expect((await page.locator('.show-question-panel').boundingBox()).y).toBeGreaterThan(600);
 for(const theme of ['light','dark']){
  if(theme==='dark')await page.locator('.show-top [data-theme-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await readableText(page,'.show-question-panel h1','.show-question-panel');await readableText(page,'.show-answer');await readableText(page,'.show-round-tag','.show-question-panel');await readableText(page,'.show-question-meta','.show-question-panel');
 }
 await page.locator('.show-top [data-theme-toggle]').click();
 await page.screenshot({path:'../artifacts/show/solo-question-light-1440.png'});
 for(const [format,selector] of [['SEQUENCE','.show-format-help'],['MATCHING','.show-matching label'],['NUMERIC','.show-numeric-label']]){
  await page.evaluate(format=>window.nextSoloFormat(format),format);await page.locator('#show-hint').click();await expect(page.locator(selector).first()).toBeVisible();await readableText(page,selector,'.show-question-panel');
 }
 await page.evaluate(()=>window.nextSoloFormat('MULTIPLE_CHOICE','wager'));await page.locator('#show-hint').click();await expect(page.locator('.show-wager-label')).toBeVisible();await readableText(page,'.show-wager-label','.show-question-panel');await readableText(page,'.show-small-button','.show-question-panel');await readableText(page,'.show-hint','.show-question-panel');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1100);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'../artifacts/show/solo-question-light-390.png'});
 expect((await page.locator('.show-question-panel').boundingBox()).y).toBeGreaterThan(450);expect((await page.locator('.show-viewport').boundingBox()).height).toBe(844);
 await page.evaluate(()=>window.soloThemeFeedback());await page.locator('[data-answer]').first().click();await page.locator('#show-submit').click();await expect(page.locator('.show-feedback-panel')).toBeVisible();await readableText(page,'.show-feedback-panel h1','.show-feedback-panel');await readableText(page,'.show-explanation','.show-feedback-panel');await readableText(page,'.show-feedback-panel .show-rewards strong','.show-feedback-panel');await readableText(page,'.show-feedback-panel .show-rewards small','.show-feedback-panel');
 await page.evaluate(()=>window.disposeThemeStudio());
});
test('the 3D navigation click starts music before loading and the same player is cleaned up on exit',async({page,request})=>{
 const registration=await request.post('/api/auth/register',{data:{firstName:'Music',lastName:'Entry',email:`music-entry-${crypto.randomUUID()}@example.com`,password:'Abcdef1!',confirmPassword:'Abcdef1!'}});expect(registration.ok()).toBeTruthy();const session=await registration.json();
 await page.addInitScript(token=>{
  sessionStorage.setItem('refreshToken',token);localStorage.setItem('language','en');localStorage.setItem('showSettings',JSON.stringify({quality:'low',muted:false}));
  window.studioMusicCalls=[];window.studioContexts=[];
  const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){if(this.src.includes('/audio/brain-show/'))window.studioMusicCalls.push({element:this,url:this.src,activation:navigator.userActivation.isActive});return play.apply(this,args);};
  const Context=window.AudioContext;window.AudioContext=class extends Context{constructor(...args){super(...args);window.studioContexts.push(this);}};
 },session.refreshToken);
 await page.route('**/src/show-studio.js*',async route=>{await new Promise(resolve=>setTimeout(resolve,1800));await route.continue();});
 await page.goto('/#courses');await expect(page.locator('.sidebar a[href="#show"]')).toBeVisible();expect(await page.evaluate(()=>window.studioMusicCalls.length)).toBe(0);
 await page.locator('.sidebar a[href="#show"]').click();await expect(page.locator('.show-loader')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.studioMusicCalls.some(call=>call.url.endsWith('/menu.mp3')&&call.activation&&!call.element.paused&&call.element.currentTime>0)),{timeout:1500}).toBeTruthy();
 await expect(page.locator('.connection-state')).toHaveText('Connected');
 expect(await page.evaluate(()=>({players:new Set(window.studioMusicCalls.map(call=>call.element)).size,contexts:window.studioContexts.length}))).toEqual({players:1,contexts:1});
 await page.locator('.show-brand').click();await expect(page.locator('.knowledge-show')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>window.studioMusicCalls.every(call=>call.element.paused)&&window.studioContexts.every(context=>context.state==='closed'))).toBeTruthy();
 await page.locator('.sidebar a[href="#show"]').click();await expect(page.locator('.connection-state')).toHaveText('Connected');
 expect(await page.evaluate(()=>window.studioContexts.length)).toBe(2);await page.locator('.show-brand').click();
 await expect.poll(()=>page.evaluate(()=>window.studioMusicCalls.every(call=>call.element.paused)&&window.studioContexts.every(context=>context.state==='closed'))).toBeTruthy();
});
