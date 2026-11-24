import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {getLanguage} from './i18n';
import {CAMERA_PULLBACK_SECONDS,FINAL_REVEAL,finalistRevealDelay,smoothCameraProgress,revealedAnswerOutcome} from './show-cinematics';

const COLORS = [0xa68aff, 0x4edbcc, 0xf7b968, 0xee83b3];
const IDS = ['nova', 'leo', 'maya', 'atlas'];
const DEFAULTS = IDS.map((avatarId, i) => ({ id: avatarId, avatarId, name: ['Нова', 'Лео', 'Майя', 'Атлас'][i], score: 0, isBot: true }));
const assetUrl = path => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
const poseDurations = { thinking: 3.5, buzzer: .8, correct: 2.3, wrong: 2.6, win: 4, lose: 3.2, greeting: 3, rules: 3.5, point: 2.7, reaction: 2, results: 4, talk: 2.5, clap: 2 };
const screenCopy={
 league:['БІЛІМ ЛИГАСЫ','ЛИГА ЗНАНИЙ','KNOWLEDGE LEAGUE'],
 finished:['ОЙЫН АЯҚТАЛДЫ','ЭФИР ЗАВЕРШЁН','SHOW COMPLETE'],
 rules:['БІЛІМІҢІЗ — СІЗДІҢ КҮШІҢІЗ','ВАШИ ЗНАНИЯ — ВАША СИЛА','YOUR KNOWLEDGE IS YOUR POWER'],
 welcome:['СТУДИЯҒА ҚОШ КЕЛДІҢІЗ','ДОБРО ПОЖАЛОВАТЬ В СТУДИЮ','WELCOME TO THE STUDIO'],
 outro:['Білім сізбен бірге қалады.','Знания остаются с вами.','Your knowledge stays with you.'],
 instructions:['Бес кезең. Төрт қатысушы. Бір жеңімпаз.','Пять раундов. Четыре участника. Один победитель.','Five rounds. Four contestants. One winner.'],
 tagline:['ОЙЛАНЫҢЫЗ. ЖАУАП БЕРІҢІЗ. ӨСІҢІЗ.','ДУМАЙТЕ. ОТВЕЧАЙТЕ. РАСТИТЕ.','THINK. ANSWER. GROW.'],
 subtitle:['ОҚУ ЗИЯТКЕРЛІК ШОУЫ','УЧЕБНОЕ ИНТЕЛЛЕКТУАЛЬНОЕ ШОУ','THE LEARNING GAME SHOW'],
 bot:['БОТ','БОТ','BOT'],player:['ОЙЫНШЫ','ИГРОК','PLAYER'],participant:['Қатысушы','Участник','Contestant'],
 correct:['ДҰРЫС','ВЕРНО','CORRECT'],wrong:['ҚАТЕ','ОШИБКА','INCORRECT'],
};
const copy=key=>screenCopy[key][getLanguage()==='kk'?0:getLanguage()==='ru'?1:2];

/** A real WebGL studio. Controls and server requests never wait for its animation. */
export function createStudio(container, options = {}) {
  try { return new ShowStudio(container, options); }
  catch (cause) { throw new Error('Браузер не смог открыть 3D-студию. Проверьте поддержку WebGL 2 и аппаратное ускорение.', { cause }); }
}

class ShowStudio {
  constructor(container, options) {
    this.container = container;
    this.options = options;
    this.settings = { quality: 'medium', reducedMotion: false, ...options };
    this.disposed = false;
    this.characters = [];
    this.state = {};
    this.elapsed = 0;
    this.lookAt = new THREE.Vector3(0, 2, 0);
    this.cameraDestination = new THREE.Vector3(.1, 4.5, 14.9);
    this.lookDestination = this.lookAt.clone();
    this.cameraReturnAt = Infinity;
    this.cameraDefault = 'wide';
    this.cameraTransition = null;
    this.previewReturnStartedAt = null;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080c20);
    this.scene.fog = new THREE.FogExp2(0x080c20, .026);
    this.camera = new THREE.PerspectiveCamera(39, 1, .1, 65);
    this.camera.position.copy(this.cameraDestination);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', '3D-студия «Лига знаний»: ведущий и четыре участника');
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y';
    container.append(this.renderer.domElement);
    this.buildStudio();
    this.onLanguageChange=()=>{this.screenKey=null;this.questionScreen.update(this.state);this.brandScreen.update();this.assignCharacters(this.state.participants||[]);};
    window.addEventListener('languagechange',this.onLanguageChange);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.updateSettings(this.settings);
    this.lastFrame = performance.now();
    this.animate = this.animate.bind(this);
    this.frame = requestAnimationFrame(this.animate);
    this.onContextLost = event => {
      event.preventDefault();
      this.contextLost = true;
      const error = new Error('Графический контекст потерян. Перезагрузите студию или снизьте качество графики.');
      this.options.onError?.(error);
    };
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.ready = this.loadCharacters().catch(error => {
      if (!this.disposed) this.options.onError?.(error);
      throw error;
    });
  }

  material(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: .3, ...extra });
  }
  mesh(geometry, material, position, rotation) {
    const mesh = new THREE.Mesh(geometry, material);
    if (position) mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }
  box(w, h, d, material, position) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), material, position);
  }
  ring(radius, material, position, thickness = .035) {
    return this.mesh(new THREE.TorusGeometry(radius, thickness, 8, 96), material, position, [Math.PI / 2, 0, 0]);
  }
  glow(color, opacity = 1) {
    return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
  }
  textPanel(width, height, draw, pixels = [1024, 512]) {
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = pixels;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    const mesh = this.mesh(new THREE.PlaneGeometry(width, height), material);
    const update = value => { draw(ctx, canvas, value); texture.needsUpdate = true; };
    return { canvas, mesh, texture, update };
  }

  buildStudio() {
    const navy = this.material(0x161b39, { roughness: .38, metalness: .65 });
    const floor = this.material(0x141b31, { roughness: .28, metalness: .72 });
    const gold = this.material(0xecc690, { roughness: .3, metalness: .8 });
    const deep = this.material(0x070d20, { roughness: .8 });
    const violet = this.glow(0x8061ef);
    const warm = this.glow(0xffd3a0);
    this.mesh(new THREE.PlaneGeometry(45, 45), floor, [0, -.13, 0], [-Math.PI / 2, 0, 0]);
    this.mesh(new THREE.CylinderGeometry(7.7, 8, .32, 80), navy, [0, .02, -.2]);
    this.ring(7.72, violet, [0, .19, -.2]);
    this.ring(7.15, gold, [0, .19, -.2], .022);
    this.ring(5.6, this.glow(0x4e456a), [0, .192, -.2], .012);
    this.box(17, 8, .35, deep, [0, 3.5, -5]);
    // Staggered fins and light pillars create an actual three-dimensional set.
    for (let i = -8; i <= 8; i++) {
      const x = i * .93;
      this.box(.43, 6.4 + Math.cos(i) * .4, .55, navy, [x, 3.1, -4.55 + Math.abs(i) * .12]);
      if (Math.abs(i) > 3) this.box(.035, 5.1, .035, i % 2 ? violet : this.glow(0x395b99), [x + .25, 3, -4.15 + Math.abs(i) * .12]);
    }
    // Central screen has a live, locally generated texture, not a static backdrop.
    this.box(7.35, 2.8, .24, navy, [0, 4.25, -3.9]);
    this.box(7.48, .035, .29, warm, [0, 5.65, -3.75]);
    this.box(7.48, .035, .29, violet, [0, 2.85, -3.75]);
    this.questionScreen = this.textPanel(7.05, 2.5, drawScreen, [1536, 544]);
    this.questionScreen.mesh.position.set(0, 4.25, -3.75);
    this.questionScreen.update({ phase: 'intro' });
    const brand = this.textPanel(5, .55, (ctx, canvas) => {
      ctx.fillStyle = '#080c20'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center'; ctx.fillStyle = '#e8d1ad'; ctx.font = '700 66px system-ui';
      ctx.fillText('✦  '+copy('league')+'  ✦', canvas.width / 2, 78);
    }, [1024, 128]);
    brand.mesh.position.set(0, 6.38, -3.65);brand.update();this.brandScreen=brand;
    this.podiums = [];
    this.standingPositions = [];
    for (let i = 0; i < 8; i++) {
      const firstChild = this.scene.children.length;
      const x = (i % 4 - 1.5) * 2.25;
      const z = Math.abs(i % 4 - 1.5) * .16 - (i >= 4 ? 2.05 : 0);
      this.standingPositions.push(new THREE.Vector3(x, .19, z));
      const color = this.glow(COLORS[i % 4]);
      this.mesh(new THREE.CylinderGeometry(.91, 1.01, .16, 48), navy, [x, .24, z]);
      this.ring(.91, color, [x, .33, z], .025);
      this.box(1.42, .88, .58, navy, [x, .78, z + .83]);
      this.box(1.48, .075, .72, gold, [x, 1.245, z + .85]);
      this.box(1.4, .027, .04, color, [x, 1.21, z + 1.23]);
      this.box(.038, .68, .04, color, [x - .64, .78, z + 1.15]);
      this.box(.038, .68, .04, color, [x + .64, .78, z + 1.15]);
      const button = this.mesh(new THREE.CylinderGeometry(.105, .13, .055, 24), this.material(COLORS[i % 4], { emissive: COLORS[i % 4], emissiveIntensity: .35 }), [x - .28, 1.31, z + .57]);
      const panel = this.textPanel(1.17, .53, drawPodium, [512, 256]);
      panel.mesh.position.set(x, .8, z + 1.132);
      panel.update({ ...DEFAULTS[i % 4], index: i % 4 });
      const meshes = this.scene.children.slice(firstChild);
      meshes.forEach(mesh => mesh.visible = i < 4);
      const answerLight = new THREE.PointLight(0x49e59b,0,4,.8);
      answerLight.position.set(x,1.5,z+.65);this.scene.add(answerLight);
      this.podiums.push({ panel, button, meshes,accent:color,answerLight,index:i,outcome:null,answered:false });
    }
    // A separate host platform and lectern.
    this.hostPosition = new THREE.Vector3(-5.55, .19, 1);
    this.mesh(new THREE.CylinderGeometry(1, 1.1, .13, 48), navy, [-5.55, .22, 1]);
    this.ring(1, warm, [-5.55, .29, 1], .028);
    this.box(.58, .95, .46, navy, [-6.21, .77, 1.26]);
    this.box(.66, .07, .56, gold, [-6.21, 1.28, 1.26]);
    // Visible lighting gantries, spots and soft light beams.
    this.box(17.5, .15, .16, navy, [0, 7.4, -1.2]);
    this.box(17.5, .1, .16, gold, [0, 7.62, -1.2]);
    this.lights = [];
    this.beams = [];
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * 2.7;
      const fixture = this.mesh(new THREE.CylinderGeometry(.18, .23, .43, 12), navy, [x, 7.1, -1.2], [.38, 0, 0]);
      this.mesh(new THREE.CircleGeometry(.17, 16), this.glow(i % 2 ? 0xe3d0ff : 0xffd6ad), [x, 6.91, -1.11], [-Math.PI / 2 + .38, 0, 0]);
      const light = new THREE.SpotLight(i % 2 ? 0xbbabff : 0xffddb9, 15, 18, .45, .6, 1.4);
      light.position.copy(fixture.position);
      light.target.position.set(x * .6, .2, 1);
      this.scene.add(light, light.target);
      this.lights.push(light);
      const beam = this.mesh(new THREE.ConeGeometry(1.4, 6.7, 24, 1, true), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x9676e0 : 0xf6c58d, transparent: true, opacity: .021, side: THREE.DoubleSide, depthWrite: false }), [x, 3.7, -.5]);
      beam.rotation.z = x * -.03; beam.castShadow = false; this.beams.push(beam);
    }
    this.ambientLight = new THREE.HemisphereLight(0xc4d5ff, 0x34223e, 2.7); this.scene.add(this.ambientLight);
    const front = new THREE.DirectionalLight(0xffefd5, 3.9);
    front.position.set(-1, 7, 6); front.castShadow = true;
    front.shadow.camera.left = -9; front.shadow.camera.right = 9;
    front.shadow.camera.top = 8; front.shadow.camera.bottom = -4;
    front.shadow.camera.near = .5; front.shadow.camera.far = 22;
    front.shadow.bias = -.0005; front.shadow.normalBias = .025;
    front.shadow.mapSize.set(1024, 1024);
    this.keyLight = front; this.scene.add(front);
    const rim = new THREE.DirectionalLight(0x8c6ef3, 4.5); rim.position.set(4, 4, -3); this.scene.add(rim); this.rimLight = rim;
    this.finalLights = [];
    this.finalBeams = [];
    for (let i = 0; i < 4; i++) {
      const x = this.standingPositions[i].x;
      const color = [0xffd38a, 0xb9d5ed, 0xe7b08a, 0xbfa8ed][i];
      const light = new THREE.SpotLight(color, 0, 15, .23, .6, 1);
      light.position.set(x, 6.4, 1.9); light.target.position.set(x, 1.2, .15);
      this.scene.add(light, light.target); this.finalLights.push(light);
      const beam = this.mesh(new THREE.ConeGeometry(.85, 5.5, 24, 1, true), new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}), [x,3.4,.8]);
      beam.castShadow = false; beam.visible = false; this.finalBeams.push(beam);
    }
    this.createConfetti();
  }

  async loadCharacters() {
    this.options.onProgress?.({ percent: 5, message: 'Загружаем студию' });
    const response = await fetch(assetUrl('assets/characters/manifest.json'));
    if (!response.ok) throw new Error('Не найден манифест 3D-персонажей. Проверьте локальные файлы assets/characters.');
    let manifest;
    try { manifest = await response.json(); }
    catch (cause) { throw new Error('Манифест 3D-персонажей повреждён. Восстановите локальный комплект ассетов.', { cause }); }
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_, loaded, total) => this.options.onProgress?.({ percent: Math.round(10 + loaded / total * 85), message: 'Загружаем модели и анимации' });
    const loader = new GLTFLoader(manager);
    this.templates = new Map();
    const entries = Object.entries(manifest.characters || manifest);
    await Promise.all(entries.map(async ([id, entry]) => {
      const source = typeof entry === 'string' ? { file: entry } : entry;
      let gltf;
      try { gltf = await loader.loadAsync(assetUrl('assets/characters/' + source.file)); }
      catch (cause) { throw new Error(`Не удалось загрузить персонажа «${{ nova: 'Нова', leo: 'Лео', maya: 'Майя', atlas: 'Атлас', orion: 'Марк' }[id] || id}». Проверьте комплект локальных моделей и повторите загрузку.`, { cause }); }
      if (!gltf.scene) throw new Error(`Модель ${id} не содержит сцены.`);
      let skinned = false;
      gltf.scene.traverse(mesh => { if (mesh.isSkinnedMesh) skinned = true; });
      if (!skinned) throw new Error(`Модель ${id} не содержит скелета. Нужен rigged glTF.`);
      this.templates.set(id, { gltf, source });
    }));
    if (this.disposed) { this.releaseTemplates(); return; }
    for (const id of [...IDS, 'orion']) if (!this.templates.has(id)) throw new Error(`В комплекте отсутствует персонаж ${id}.`);
    this.assignCharacters(this.state.participants || []);
    this.setState({ phase: 'intro', ...this.state }, true);
    this.options.onProgress?.({ percent: 100, message: 'Студия готова' });
  }

  makeCharacter(id, position, index) {
    const { gltf, source } = this.templates.get(id) || this.templates.get('nova');
    const model = cloneSkeleton(gltf.scene);
    model.traverse(mesh => {
      // The source suit includes an optional pistol prop. It is not part of
      // this educational show; keep the licensed source file intact and hide it.
      if (/pistol|weapon|sword|^gun$/i.test(mesh.name)) mesh.visible = false;
      if (!mesh.isMesh) return;
      mesh.castShadow = true; mesh.receiveShadow = true;
      // Preserve original textured skin, eyes, clothing and hair. Independent material instances.
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => m.clone()) : mesh.material.clone();
    });
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const desiredHeight = source.height || (id === 'orion' ? 2.02 : 1.9);
    const scale = desiredHeight / Math.max(size.y, .01);
    model.scale.multiplyScalar(scale);
    model.position.y -= box.min.y * scale;
    model.rotation.y = source.rotationY ?? 0;
    const root = new THREE.Group(); root.add(model); root.position.copy(position); this.scene.add(root);
    const mixer = new THREE.AnimationMixer(model);
    const clips = gltf.animations.map(clip => clip.clone());
    // Anchor horizontal root translation so imported locomotion walks in place;
    // the show director alone controls the walk toward each podium.
    for (const clip of clips) {
      for (const track of clip.tracks) {
        if (!(/\.position$/.test(track.name) && /root|armature|hips|pelvis|^body\./i.test(track.name))) continue;
        const x = track.values[0], z = track.values[2];
        for (let i = 0; i < track.values.length; i += 3) { track.values[i] = x; track.values[i + 2] = z; }
      }
    }
    const sourceIdle = clips.find(clip => /idle/i.test(clip.name));
    if (sourceIdle) {
      const restingAction = mixer.clipAction(sourceIdle);
      restingAction.play(); mixer.update(.01);
    }
    const gestures = makeGestureClips(model);
    mixer.stopAllAction();
    const actions = new Map([...clips, ...gestures].map(clip => [clip.name.toLowerCase(), mixer.clipAction(clip)]));
    this.applyTextureQuality(model);
    const actor = { id, root, model, mixer, actions, current: null, position: position.clone(), index, returnAt: Infinity, entryStartedAt: null, sticker: null };
    this.playActor(actor, 'idle', true);
    return actor;
  }

  assignCharacters(participants) {
    if (!this.templates?.size || this.disposed) return;
    const used = new Set(participants.map(p => p.avatarId || p.characterId));
    const remaining = IDS.filter(id => !used.has(id));
    const list = this.state.online ? participants.slice(0,8) : Array.from({ length: 4 }, (_, index) => participants[index] || { ...DEFAULTS[index], avatarId: remaining.shift() || IDS[index] });
    while (this.characters.length > list.length) this.removeActor(this.characters.pop());
    this.podiums.forEach((podium,index) => podium.meshes.forEach(mesh => mesh.visible = index < list.length));
    list.forEach((participant, index) => {
      const id = this.templates.has(participant.avatarId || participant.characterId) ? participant.avatarId || participant.characterId : IDS[index % 4];
      if (this.characters[index]?.id !== id) {
        if (this.characters[index]) this.removeActor(this.characters[index]);
        this.characters[index] = this.makeCharacter(id, this.standingPositions[index], index);
      }
      this.characters[index].participantId = participant.id;
      const podium=this.podiums[index],outcome=revealedAnswerOutcome(this.state,participant,index);
      if(podium.outcome!==outcome){podium.outcome=outcome;podium.outcomeStartedAt=this.elapsed;}
      podium.answered=!!participant.answered;
      const color=outcome==null?COLORS[index%4]:outcome?0x46e69a:0xff536d;
      podium.accent.color.setHex(color);podium.button.material.color.setHex(color);podium.button.material.emissive.setHex(color);podium.answerLight.color.setHex(color);
      podium.panel.update({ ...participant, index, outcome,final: this.state.phase === 'results', rank: index + 1 });
    });
    if (!this.host) this.host = this.makeCharacter('orion', this.hostPosition, 4);
  }

  playActor(actor, name, loop = false) {
    if (!actor) return;
    if (name !== 'entry' && actor.entryStartedAt != null) {
      actor.entryStartedAt = null; actor.root.position.copy(actor.position); actor.root.rotation.y = 0;
    }
    const aliases = {
      idle: ['idle', 'standingidle', 'idle_loop'], entry: ['walk', 'walking', 'walk_loop'],
      correct: ['show_clap', 'show_correct', 'jump', 'wave'], win: ['show_win', 'jump', 'wave'],
      wrong: ['show_wrong'], lose: ['show_lose'], thinking: ['show_thinking'], buzzer: ['show_buzzer'], talk: ['show_talk'], clap: ['show_clap'],
      greeting: ['show_greeting', 'wave'], rules: ['show_rules'], point: ['show_point'], reaction: ['show_reaction'], results: ['show_results'],
    };
    let action;
    for (const alias of aliases[name] || ['show_' + name, name]) {
      action = actor.actions.get(alias) || [...actor.actions.entries()].find(([key]) => key.replace(/[ _|.-]/g, '').endsWith(alias.replace(/[ _|.-]/g, '')))?.[1];
      if (action) break;
    }
    action ||= actor.actions.get('show_idle');
    if (!action) return;
    if (actor.current === action && loop) return;
    const old = actor.current;
    action.enabled = true;
    action.reset().setEffectiveTimeScale(this.settings.reducedMotion ? .65 : 1).setEffectiveWeight(1);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.play();
    if (old && old !== action) action.crossFadeFrom(old, this.settings.reducedMotion ? .1 : .3, true);
    actor.current = action;
    actor.returnAt = loop ? Infinity : this.elapsed + (poseDurations[name] || action.getClip().duration) + .25;
  }

  trigger(type, index = 0) {
    if (this.disposed) return;
    if (type === 'entry') {
      const actor = this.characters[index];
      if (actor && !this.settings.reducedMotion) { actor.entryStartedAt = this.elapsed; actor.root.position.x = actor.position.x - 2; actor.root.rotation.y = .6; }
      this.playActor(actor, 'entry', true);
      return;
    }
    const actor = index === this.characters.length ? this.host : this.characters[index];
    this.playActor(actor, type, false);
    if (type === 'buzzer') {
      this.podiums[index].button.material.emissiveIntensity = 3;
      // The answer gesture must keep the other contestants in the shot.
      if(!['question','feedback'].includes(this.state.phase))this.setCamera('answer', index, 1.35);
    }
    if (type === 'win') this.confettiUntil = this.elapsed + 8;
    if (type === 'buzzer') this.setStickerMood(actor, 'surprised');
  }

  setHostSpeaking(active) {
    if (this.disposed || !this.host) return;
    this.playActor(this.host, active ? 'talk' : 'idle', true);
  }

  setStickerMood(actor, mood, duration = 2.4) {
    if (!actor) return;
    if (!actor.sticker) {
      actor.sticker = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      actor.sticker.position.set(.32, 2.16, 0); actor.sticker.scale.set(.48, .48, 1); actor.sticker.renderOrder = 8; actor.root.add(actor.sticker);
    }
    actor.sticker.material.map?.dispose();
    actor.sticker.material.map = makeStickerTexture(mood);
    actor.sticker.material.needsUpdate = true; actor.sticker.material.opacity = 0;
    actor.stickerMood = mood; actor.stickerStarted = this.elapsed; actor.stickerUntil = this.elapsed + duration;
  }

  setState(next, force = false) {
    if (this.disposed) return;
    const previous = this.state;
    this.state = next || {};
    this.assignCharacters(this.state.participants || []);
    const key = `${getLanguage()}:${next?.phase}:${next?.questionIndex ?? next?.question?.index ?? ''}:${next?.question?.prompt || next?.question?.question || ''}`;
    if (key !== this.screenKey || force) { this.screenKey = key; this.questionScreen.update(next); }
    if (previous.phase === next?.phase && previous.questionIndex === next?.questionIndex && previous.id === next?.id && !force) {
      if (next?.online && next.phase === 'question') this.characters.forEach(actor => {
        const current = next.participants?.find(p => p.id === actor.participantId);
        const old = previous.participants?.find(p => p.id === actor.participantId);
        if (current?.answered && !old?.answered) { this.playActor(actor, 'buzzer'); this.setStickerMood(actor, 'surprised'); }
      });
      return;
    }
    const phase = next?.phase || 'intro';
    this.finalActive = phase === 'results';
    if (this.finalActive) {this.finalStartedAt = performance.now()/1000;this.characters.forEach(actor=>actor.finalRevealed=false);}
    if(phase!=='question'||previous.phase!=='preview'){this.previewEndsAt=null;this.previewReturnStartedAt=null;}
    if (!this.characters.length) { this.setCamera('wide'); return; }
    this.cameraDefault = phase === 'intro' ? 'wide' : 'game';
    if (phase === 'intro') {
      this.setCamera('wide'); this.playActor(this.host, 'greeting'); this.characters.forEach(actor => this.setStickerMood(actor, 'happy'));
      if (next?.id && previous.id !== next.id) this.characters.forEach((_, index) => this.trigger('entry', index));
    } else if (phase === 'rules') {
      this.setCamera('host', 0, 3.4); this.playActor(this.host, 'rules');
    } else if (phase === 'preview') {
      const remaining = Math.max(0, (Date.parse(next.answerOpensAt) - Date.parse(next.serverNow || new Date().toISOString())) / 1000);
      this.previewEndsAt = Date.now() + remaining * 1000;
      this.previewReturnStartedAt=performance.now()/1000+remaining-CAMERA_PULLBACK_SECONDS;
      this.setCamera(remaining > CAMERA_PULLBACK_SECONDS ? 'television' : 'game');
      if (remaining > CAMERA_PULLBACK_SECONDS) { this.camera.position.copy(this.cameraDestination); this.lookAt.copy(this.lookDestination);this.cameraTransition=null; }
      this.playActor(this.host, 'point');
      this.characters.forEach(actor => { this.playActor(actor, 'thinking'); this.setStickerMood(actor, 'thinking'); });
    } else if (phase === 'question') {
      // A network snapshot at the answering boundary must not restart the pullback.
      if(this.cameraName!=='game')this.setCamera('game');this.playActor(this.host, 'point');
      this.characters.forEach(actor => { this.playActor(actor, 'thinking'); this.setStickerMood(actor, 'thinking', 1.8); });
    } else if (phase === 'feedback') {
      // Keep all stations in view so everyone can see red/green results together.
      this.setCamera('game'); this.playActor(this.host, 'reaction');
      this.characters.forEach((actor, index) => {
        const participant=next.participants?.find(player=>player.id===actor.participantId),outcome=revealedAnswerOutcome(next,participant,index);
        this.playActor(actor, outcome==null?'idle':outcome?'correct':'wrong');
        this.setStickerMood(actor, outcome==null?'thinking':outcome?'happy':'sad');
      });
    } else if (phase === 'results') {
      this.setCamera('finale'); this.playActor(this.host, 'results');
      this.characters.forEach((actor,index)=>{this.playActor(actor,index===0?'win':'correct');this.setStickerMood(actor,index===0?'sparkle':'happy',3.4);});
      this.confettiUntil=0;
    }
  }

  setCamera(name, index = 0, duration = Infinity, options = {}) {
    const now=performance.now()/1000;
    // Read the current tween before a resize or snapshot can retarget it.
    // This preserves position AND gaze even between animation frames.
    this.updateCameraMotion(now);
    const previousTransition=this.cameraTransition;
    const previousName=this.cameraName;
    this.cameraName = name; this.cameraIndex = index;
    const p = this.standingPositions[index] || this.standingPositions[0];
    const portrait = this.container.clientWidth / Math.max(this.container.clientHeight, 1) < 1;
    // Include the outer podium rims and gestures, rather than fitting only
    // the two central contestants into a narrow portrait viewport.
    const portraitGameDistance=Math.max(22,5/(Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))*this.camera.aspect));
    const tvDistance = Math.max(3.525 / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect), 1.25 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.12;
    const cameras = {
      wide: portrait ? [[.1, 4.6, 17.5], [0, 1.6, -.2]] : [[.1, 4.5, 14.9], [0, 2.4, -.2]],
      // Look below the contestants so their heads and torsos occupy the clear
      // upper stage, leaving the lower half available for the question card.
      game: portrait ? [[.1, 4.3, portraitGameDistance], [0, .3, -.2]] : [[.1, 4, 12.8], [0, .9, -.4]],
      host: [[-7.4, 2.9, 7.1], [-5.4, 1.7, .8]],
      answer: [[p.x + .5, 2.7, 6.2], [p.x, 1.65, .2]],
      winner: [[p.x + .5, 3, 7], [p.x, 1.75, .3]],
      television: [[0, 4.25, -3.75 + tvDistance], [0, 4.25, -3.75]],
      finale: portrait ? [[0, 3.6, 16], [0, 1.3, .2]] : [[0, 3.2, 12], [0, 1.5, .2]],
    };
    const selected = cameras[name] || cameras.game;
    const destination=new THREE.Vector3(...selected[0]),lookDestination=new THREE.Vector3(...selected[1]);
    if(this.cameraDestination.equals(destination)&&this.lookDestination.equals(lookDestination)){
      this.cameraReturnAt=this.elapsed+duration;
      return;
    }
    const from=this.camera.position.clone(),lookFrom=this.lookAt.clone();
    this.cameraDestination.copy(destination);this.lookDestination.copy(lookDestination);
    const transitionDuration=options.preserveTransition&&previousTransition?Math.max(.001,previousTransition.startedAt+previousTransition.duration-now):name==='game'&&previousName==='television'?CAMERA_PULLBACK_SECONDS:name==='finale'?1.4:.9;
    this.cameraTransition={from,lookFrom,startedAt:now,duration:transitionDuration};
    this.cameraReturnAt = this.elapsed + duration;
    if (this.settings.reducedMotion) { this.camera.position.copy(this.cameraDestination); this.lookAt.copy(this.lookDestination);this.cameraTransition=null; }
  }

  updateCameraMotion(now=performance.now()/1000){
    if(this.cameraTransition&&!this.settings.reducedMotion){
      const progress=smoothCameraProgress((now-this.cameraTransition.startedAt)/this.cameraTransition.duration);
      this.camera.position.lerpVectors(this.cameraTransition.from,this.cameraDestination,progress);
      this.lookAt.lerpVectors(this.cameraTransition.lookFrom,this.lookDestination,progress);
      if(progress===1)this.cameraTransition=null;
    }else{
      this.camera.position.copy(this.cameraDestination);this.lookAt.copy(this.lookDestination);
      if(this.settings.reducedMotion)this.cameraTransition=null;
    }
    this.camera.lookAt(this.lookAt);
  }

  createConfetti() {
    this.confettiCount = 200;
    this.confettiPositions = new Float32Array(this.confettiCount * 3);
    const colors = new Float32Array(this.confettiCount * 3);
    this.confettiSeeds = [];
    for (let i = 0; i < this.confettiCount; i++) {
      this.confettiSeeds.push({ x: Math.random() * 14 - 7, y: Math.random() * 10, z: Math.random() * 8 - 4, speed: .6 + Math.random() * 1.3, phase: Math.random() * 6 });
      const color = new THREE.Color(COLORS[i % 4]); color.toArray(colors, i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.confettiPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.confetti = new THREE.Points(geometry, new THREE.PointsMaterial({ size: .085, vertexColors: true, sizeAttenuation: true }));
    this.confetti.visible = false; this.confetti.frustumCulled = false; this.scene.add(this.confetti);
    this.confettiUntil = 0;
  }

  updateSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    const quality = this.settings.quality;
    const mobile = window.matchMedia('(max-width: 650px)').matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? (mobile ? 1.8 : 2.25) : quality === 'low' ? 1 : 1.5));
    this.renderer.shadowMap.enabled = quality !== 'low';
    if (this.settings.reducedMotion) {
      // Apply the preference immediately, including when the viewport and
      // camera destination have not changed. A later toggle starts fresh.
      this.updateCameraMotion();
      for (const actor of this.characters) {
        if (actor.entryStartedAt != null) this.playActor(actor, 'idle', true);
      }
    }
    this.beams?.forEach(beam => beam.visible = quality !== 'low');
    const requestedShadowSize = quality === 'high' ? (mobile ? 2048 : 3072) : quality === 'medium' ? 1024 : 512;
    const shadowSize = Math.min(requestedShadowSize, this.renderer.capabilities.maxTextureSize);
    this.keyLight.shadow.mapSize.set(shadowSize, shadowSize);
    if (this.keyLight.shadow.map) { this.keyLight.shadow.map.dispose(); this.keyLight.shadow.map = null; }
    this.applyTextureQuality(this.scene);
    this.resize();
  }

  applyTextureQuality(root) {
    const quality = this.settings.quality;
    const max = this.renderer.capabilities.getMaxAnisotropy();
    const anisotropy = quality === 'high' ? max : quality === 'medium' ? Math.min(4, max) : 1;
    root.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach(material => Object.values(material).forEach(value => {
        if (value?.isTexture && value.anisotropy !== anisotropy) { value.anisotropy = anisotropy; value.needsUpdate = true; }
      }));
    });
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.fov = width / height < 1 ? 58 : 39;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false);
    const layout = width / height < 1 ? 'portrait' : 'landscape';
    if(this.cameraLayout!==layout||this.cameraViewportWidth!==width||this.cameraViewportHeight!==height){
      this.cameraLayout=layout;this.cameraViewportWidth=width;this.cameraViewportHeight=height;
      this.setCamera(this.cameraName||'wide',this.cameraIndex||0,Math.max(0,this.cameraReturnAt-this.elapsed),{preserveTransition:true});
      // During the reading hold, keep the complete television fitted to the
      // resized viewport. An active pullback retains its remaining duration.
      if(this.cameraName==='television'&&(!this.previewReturnStartedAt||performance.now()/1000<this.previewReturnStartedAt)){
        this.camera.position.copy(this.cameraDestination);this.lookAt.copy(this.lookDestination);this.cameraTransition=null;this.camera.lookAt(this.lookAt);
      }
    }
  }

  animate(now) {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const delta = Math.min((now - this.lastFrame) / 1000, .06); this.lastFrame = now;
    if (document.hidden || this.contextLost) return;
    this.elapsed += delta;
    if(this.previewEndsAt&&Date.now()>=this.previewEndsAt-CAMERA_PULLBACK_SECONDS*1000&&this.cameraName==='television'){
      this.setCamera('game');
      if(this.cameraTransition&&this.previewReturnStartedAt!=null)this.cameraTransition.startedAt=this.previewReturnStartedAt;
    }
    const finalTime = this.finalActive ? now/1000 - this.finalStartedAt : 0;
    this.ambientLight.intensity = this.finalActive ? .12 : 2.7;
    this.keyLight.intensity = this.finalActive ? .18 : 3.9;
    this.rimLight.intensity = this.finalActive ? .2 : 4.5;
    this.finalLights.forEach((light,i) => {
      const reveal = this.finalActive && i < this.characters.length ? this.settings.reducedMotion ? 1 : smoothCameraProgress((finalTime-finalistRevealDelay(i,this.characters.length))/FINAL_REVEAL.fade) : 0;
      light.intensity = reveal * 30;
      this.finalBeams[i].visible = reveal > 0 && this.settings.quality !== 'low';
      this.finalBeams[i].material.opacity = reveal * .07;
      if (this.finalActive && this.podiums[i]) { this.podiums[i].panel.mesh.material.transparent = true; this.podiums[i].panel.mesh.material.opacity = reveal; }
      else if (this.podiums[i]) this.podiums[i].panel.mesh.material.opacity = 1;
      if(this.finalActive){
        const actor=this.characters[i];
        if(actor){actor.root.visible=reveal>0;if(reveal>0&&!actor.finalRevealed){actor.finalRevealed=true;this.playActor(actor,i===0?'win':'correct');if(i===0&&!this.settings.reducedMotion)this.confettiUntil=this.elapsed+8;}}
        this.podiums[i]?.meshes.forEach(mesh=>mesh.visible=!!actor&&reveal>0);
      }
    });
    if(!this.finalActive)this.characters.forEach(actor=>actor.root.visible=true);
    for (const actor of [...this.characters, this.host].filter(Boolean)) {
      actor.mixer.update(delta);
      if (actor.entryStartedAt != null) {
        const progress = Math.min(1, (this.elapsed - actor.entryStartedAt) / 2.2);
        actor.root.position.x = actor.position.x - 2 * (1 - progress);
        actor.root.rotation.y = .6 * (1 - progress);
        if (progress === 1) { actor.entryStartedAt = null; this.playActor(actor, 'idle', true); }
      }
      if (this.elapsed > actor.returnAt) this.playActor(actor, this.state.phase === 'results' ? actor.current?.getClip().name.includes('win') ? 'win' : 'idle' : 'idle', true);
      if (actor.sticker) {
        const remaining = (actor.stickerUntil || 0) - this.elapsed, age = this.elapsed - (actor.stickerStarted || 0);
        actor.sticker.visible = remaining > 0;
        if (remaining > 0) {
          const pop = this.settings.reducedMotion ? 1 : Math.min(1, Math.max(0, age / .22));
          actor.sticker.position.y = 2.16 + (this.settings.reducedMotion ? 0 : (1 - pop) * .38 + Math.sin(this.elapsed * 5 + actor.index) * .045);
          actor.sticker.scale.setScalar(.48 * (this.settings.reducedMotion ? 1 : .72 + pop * .28));
          actor.sticker.material.opacity = this.settings.reducedMotion ? 1 : Math.min(1, pop, remaining / .3);
        }
      }
    }
    if (this.elapsed > this.cameraReturnAt) this.setCamera(this.cameraDefault);
    this.updateCameraMotion(now/1000);
    this.lights.forEach((light,i) => light.intensity = this.finalActive ? 0 : this.settings.reducedMotion ? 14 : 14 + Math.sin(this.elapsed * .5 + i) * 2);
    this.beams.forEach(beam => beam.visible = !this.finalActive && this.settings.quality !== 'low');
    this.podiums.forEach(({button,answerLight,outcome,outcomeStartedAt,answered,index})=>{
      const visible=index<this.characters.length&&!this.finalActive;
      const since=Math.max(0,this.elapsed-(outcomeStartedAt||0));
      const entry=this.settings.reducedMotion?1:smoothCameraProgress(since/.45);
      const pulse=this.settings.reducedMotion?1:1+Math.sin(since*4)*.15*Math.exp(-since);
      answerLight.intensity=visible&&outcome!=null?entry*pulse*8:0;
      const target=outcome!=null?2.2:answered?1:.35;
      button.material.emissiveIntensity+=(target-button.material.emissiveIntensity)*Math.min(1,delta*5);
    });
    this.confetti.visible = !this.settings.reducedMotion && this.elapsed < this.confettiUntil;
    if (this.confetti.visible) {
      this.confettiSeeds.forEach((seed, i) => {
        this.confettiPositions[i * 3] = seed.x + Math.sin(this.elapsed + seed.phase) * .5;
        this.confettiPositions[i * 3 + 1] = 8 - ((this.elapsed * seed.speed + seed.y) % 8);
        this.confettiPositions[i * 3 + 2] = seed.z + Math.cos(this.elapsed * .4 + seed.phase) * .4;
      });
      this.confetti.geometry.attributes.position.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  }

  removeActor(actor) {
    actor.mixer.stopAllAction(); actor.mixer.uncacheRoot(actor.model);
    if (actor.sticker) { actor.sticker.material.map?.dispose(); actor.sticker.material.dispose(); actor.sticker.geometry.dispose(); }
    this.scene.remove(actor.root);
    actor.model.traverse(mesh => { if (mesh.isMesh) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => material.dispose()); });
  }
  releaseTemplates() {
    this.templates?.forEach(({ gltf }) => gltf.scene.traverse(mesh => {
      if (!mesh.isMesh) return; mesh.geometry.dispose();
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => {
        Object.values(material).forEach(value => { if (value?.isTexture) value.dispose(); }); material.dispose();
      });
    }));
    this.templates?.clear();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.frame); this.resizeObserver.disconnect();
    window.removeEventListener('languagechange',this.onLanguageChange);
    [...this.characters, this.host].filter(Boolean).forEach(actor => this.removeActor(actor));
    this.scene.traverse(mesh => {
      mesh.geometry?.dispose();
      (Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []).forEach(material => {
        Object.values(material).forEach(value => { if (value?.isTexture) value.dispose(); }); material.dispose();
      });
    });
    this.releaseTemplates(); this.keyLight.shadow.map?.dispose(); this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}

function wrapText(ctx, text, width) {
  const lines = [];
  for (const paragraph of String(text || '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (line && ctx.measureText(line + ' ' + word).width > width) { lines.push(line); line = word; }
      else line += (line ? ' ' : '') + word;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawScreen(ctx, canvas, state = {}) {
  const { width, height } = canvas;
  const gradient = ctx.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, '#1c1c49'); gradient.addColorStop(1, '#101d37');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#66519b'; ctx.lineWidth = 2; ctx.strokeRect(24, 24, width - 48, height - 48);
  const q = state.question || state.currentQuestion || {};
  const title = state.phase === 'results' ? copy('finished') : state.phase === 'rules' ? copy('rules') : state.phase === 'intro' ? copy('welcome') : q.topicName || q.topic || q.title || copy('league');
  ctx.textAlign = 'center'; ctx.fillStyle = '#c7b290'; ctx.font = '600 26px system-ui'; ctx.fillText(String(title).toUpperCase(), width / 2, 85);
  const prompt = state.phase === 'results' ? copy('outro') : state.phase === 'rules' ? copy('instructions') : q.prompt || q.question || q.text || copy('league');
  let fontSize = prompt.length > 120 ? 44 : prompt.length > 65 ? 50 : 65;
  ctx.font = `600 ${fontSize}px system-ui`;
  let lines = wrapText(ctx, prompt, width - 150);
  while ((lines.length > 4 || lines.length * fontSize * 1.2 > 240) && fontSize > 16) { fontSize -= 2; ctx.font = `600 ${fontSize}px system-ui`; lines = wrapText(ctx, prompt, width - 150); }
  ctx.fillStyle = '#f2f1ff'; const lineHeight = fontSize * 1.2; const start = 160 + (240 - lines.length * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, width / 2, start + i * lineHeight));
  ctx.fillStyle = '#8794b4'; ctx.font = '22px system-ui'; ctx.fillText(state.phase === 'intro' ? copy('subtitle') : q.roundName || copy('tagline'), width / 2, height - 61);
}

function drawPodium(ctx, canvas, participant = {}) {
  ctx.fillStyle = '#0d132b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center'; ctx.fillStyle = '#' + COLORS[(participant.index || 0) % 4].toString(16); ctx.font = '600 26px system-ui';
  if (participant.final) {
    ctx.fillStyle = ['#ffd38a','#b9d5ed','#e7b08a','#bfa8ed'][(participant.rank || 1)-1] || '#bfa8ed'; ctx.font = '800 130px system-ui'; ctx.fillText(String(participant.rank || 1), canvas.width / 2, 126);
    ctx.fillStyle = '#eef0ff'; ctx.font = '600 30px system-ui'; ctx.fillText(String(participant.name || '').slice(0,24), canvas.width / 2, 179);
    ctx.font = '700 40px system-ui'; ctx.fillText(String(participant.score || 0), canvas.width / 2, 231); return;
  }
  ctx.fillText(`${String((participant.index || 0) + 1).padStart(2, '0')}  ${participant.isBot ? copy('bot') : copy('player')}`, canvas.width / 2, 44);
  if(typeof participant.outcome==='boolean'){ctx.fillStyle=participant.outcome?'#46e69a':'#ff536d';ctx.font='700 28px system-ui';ctx.fillText((participant.outcome?'✓ ':'× ')+copy(participant.outcome?'correct':'wrong'),canvas.width/2,244);}
  ctx.fillStyle = '#eef0ff'; ctx.font = '600 42px system-ui'; ctx.fillText(String(participant.name || copy('participant')).slice(0, 18), canvas.width / 2, 101);
  ctx.font = '700 84px system-ui'; ctx.fillText(String(participant.score || 0), canvas.width / 2, 202);
}

function makeStickerTexture(mood) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const colors = { happy: '#ffd76a', sad: '#a9c7ff', thinking: '#c2a4ff', surprised: '#ff9f79', sparkle: '#ffe99a' };
  ctx.shadowColor = '#080b20'; ctx.shadowBlur = 12; ctx.fillStyle = colors[mood] || colors.happy;
  ctx.beginPath(); ctx.arc(64, 64, 49, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = '#fff8e9'; ctx.lineWidth = 6; ctx.stroke();
  ctx.fillStyle = '#342747';
  if (mood === 'thinking') {
    [48, 64, 80].forEach((x, i) => { ctx.beginPath(); ctx.arc(x, 54 + (i % 2) * 3, 4, 0, Math.PI * 2); ctx.fill(); });
  } else if (mood === 'surprised') {
    [[48, 52], [80, 52]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); });
    ctx.beginPath(); ctx.arc(64, 78, 9, 0, Math.PI * 2); ctx.fill();
  } else {
    [[48, 54], [80, 54]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); });
    ctx.strokeStyle = '#342747'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.arc(64, mood === 'sad' ? 87 : 65, 22, mood === 'sad' ? Math.PI : 0, mood === 'sad' ? Math.PI * 2 : Math.PI); ctx.stroke();
  }
  if (mood === 'sparkle') {
    ctx.fillStyle = '#fff'; [[25, 34, 7], [102, 36, 6], [98, 100, 5]].forEach(([x, y, r]) => {
      ctx.beginPath(); for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4 - Math.PI / 2, radius = i % 2 ? r * .35 : r; ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius); } ctx.closePath(); ctx.fill();
    });
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

// These are original skeletal gesture clips. The licensed source locomotion is retained.
// Every track drives a real skinning bone and participates in AnimationMixer crossfades.
function makeGestureClips(model) {
  const bones = []; model.traverse(object => { if (object.isBone) bones.push(object); });
  const find = patterns => bones.find(bone => patterns.some(pattern => pattern.test(bone.name.toLowerCase())));
  const mapped = {
    head: find([/^head$/, /head(?!.*end|.*top)/]),
    spine: find([/^spine[._ ]?1$/, /^spine$/, /spine02/, /chest/]),
    leftArm: find([/upperarm[_. ]?l$/, /upper_arm[_. ]?l$/, /leftarm$/, /arm_l$/, /^arm\.l$/]),
    rightArm: find([/upperarm[_. ]?r$/, /upper_arm[_. ]?r$/, /rightarm$/, /arm_r$/, /^arm\.r$/]),
    leftForearm: find([/forearm[_. ]?l$/, /lowerarm[_. ]?l$/, /leftforearm$/, /forearm\.l$/]),
    rightForearm: find([/forearm[_. ]?r$/, /lowerarm[_. ]?r$/, /rightforearm$/, /forearm\.r$/]),
  };
  const poses = {
    idle: { head: [0, .04, 0], spine: [.015, 0, .01], leftArm: [0, 0, -.08], rightArm: [0, 0, .08] },
    thinking: { head: [.13, -.12, -.07], spine: [.055, 0, -.035], rightArm: [-.1, -.15, -.52], rightForearm: [-1.15, .1, 0], leftArm: [0, .1, -.15] },
    buzzer: { head: [.18, -.12, 0], spine: [.17, 0, -.04], rightArm: [-.6, -.05, .1], rightForearm: [-.65, 0, 0] },
    correct: { head: [-.14, .06, 0], spine: [-.09, 0, 0], leftArm: [-.2, 0, -.95], rightArm: [-.2, 0, .95], leftForearm: [-1.2, 0, 0], rightForearm: [-1.2, 0, 0] },
    wrong: { head: [.4, -.1, .1], spine: [.17, 0, .08], leftArm: [.05, 0, -.06], rightArm: [.05, 0, .06] },
    win: { head: [-.17, .14, 0], spine: [-.08, 0, 0], leftArm: [-.15, 0, -2.1], rightArm: [-.15, 0, 2.1], leftForearm: [-.5, 0, 0], rightForearm: [-.5, 0, 0] },
    lose: { head: [.35, .15, -.1], spine: [.15, 0, -.09], leftArm: [0, 0, -.15], rightArm: [0, 0, .15] },
    greeting: { head: [-.035, -.12, 0], rightArm: [0, 0, 1.7], rightForearm: [-.8, .3, 0], leftArm: [0, 0, -.1] },
    rules: { head: [.04, .1, 0], spine: [.02, -.08, 0], leftArm: [-.25, 0, -.45], rightArm: [-.25, 0, .45], leftForearm: [-1.25, -.2, 0], rightForearm: [-1.25, .2, 0] },
    point: { head: [0, .55, -.06], spine: [0, .2, 0], leftArm: [-.2, .3, -1.15], leftForearm: [-.4, 0, 0] },
    reaction: { head: [-.12, -.15, 0], spine: [-.05, -.12, 0], leftArm: [-.15, 0, -.55], rightArm: [-.15, 0, .55], leftForearm: [-.8, 0, 0], rightForearm: [-.8, 0, 0] },
    results: { head: [-.1, -.15, 0], spine: [-.07, -.15, 0], leftArm: [0, .15, -1.05], rightArm: [0, -.15, 1.05], leftForearm: [-.4, 0, 0], rightForearm: [-.4, 0, 0] },
    talk: { head: [.08, -.08, 0], spine: [.025, 0, 0], rightArm: [-.15, 0, .25], rightForearm: [-.45, 0, 0], leftArm: [0, 0, -.08] },
    clap: { head: [-.08, 0, 0], spine: [-.04, 0, 0], leftArm: [-.3, 0, -.72], rightArm: [-.3, 0, .72], leftForearm: [-.9, 0, .1], rightForearm: [-.9, 0, -.1] },
  };
  model.updateMatrixWorld(true);
  return Object.entries(poses).map(([name, pose]) => {
    const duration = poseDurations[name] || 4;
    const times = [0, duration * .22, duration * .5, duration * .77, duration];
    const weights = [0, 1, name === 'greeting' || name === 'win' ? .72 : .93, 1, 0];
    const tracks = bones.map(bone => {
      const key = Object.entries(mapped).find(([, candidate]) => candidate === bone)?.[0];
      const base = bone.quaternion.clone(); const angles = [...(pose[key] || [0, 0, 0])]; const values = [];
      // Author rotations in the stage axes, then transform them into each bone's
      // actual parent frame. Blender bone-local axes differ across these rigs.
      const parentWorld = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      const inverseParent = parentWorld.clone().invert();
      if (key === 'leftArm' || key === 'rightArm') angles[2] *= -1;
      weights.forEach((weight, i) => {
        const motion = angles.map((angle, axis) => angle * weight + (name === 'idle' && axis === 1 ? Math.sin(i * Math.PI / 2) * .025 : 0));
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...motion, 'XYZ'));
        inverseParent.clone().multiply(rotation).multiply(parentWorld).multiply(base).normalize().toArray(values, values.length);
      });
      return new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values);
    });
    return new THREE.AnimationClip('show_' + name, duration, tracks);
  });
}
