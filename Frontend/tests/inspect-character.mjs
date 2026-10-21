import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
globalThis.ProgressEvent ||= class extends Event { constructor(type, values) { super(type); Object.assign(this, values); } };
const text = await fs.readFile('public/assets/characters/nova.gltf', 'utf8');
const gltf = await new GLTFLoader().parseAsync(text, '');
const mixer = new THREE.AnimationMixer(gltf.scene);
const idle = gltf.animations.find(clip => clip.name === 'Idle');
mixer.clipAction(idle).play(); mixer.update(.01); gltf.scene.updateMatrixWorld(true);
const rows = [];
gltf.scene.traverse(bone => {
  if (bone.isBone && /upperarm|lowerarm|head|chest|root|wrist/i.test(bone.name)) {
    rows.push({ name: bone.name, localQuaternion: bone.quaternion.toArray(), worldQuaternion: bone.getWorldQuaternion(new THREE.Quaternion()).toArray(), worldPosition: bone.getWorldPosition(new THREE.Vector3()).toArray() });
  }
});
console.log(JSON.stringify({ size: new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).toArray(), bones: rows }, null, 2));
