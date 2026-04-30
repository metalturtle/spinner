import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { scene } from './renderer';
import { ARENA_SIZE } from './constants';
import { collidables, type Collidable, type Vec2 } from './physics';
import { createHpBar, updateHpBar } from './hpBar';
import {
  nextEntityId, registerMovement, tagCollidable, untagCollidable, deregisterEntity,
} from './systems';
import { playZombieRoarSound } from './sound';

const ZOMBIE_MODEL_URL = new URL('../models/zombie/Zombie.fbx', import.meta.url).href;
const ZOMBIE_IDLE_URL = new URL('../models/zombie/sword and shield idle.fbx', import.meta.url).href;
const ZOMBIE_ATTACK_URL = new URL('../models/zombie/sword and shield attack.fbx', import.meta.url).href;

type ZombieAnim = 'idle' | 'walk' | 'attack';

function randomZombieRoarDelay(): number {
  return 4 + Math.random() * 6.5;
}

interface ZombieAssetBundle {
  scene: THREE.Group;
  clips: Partial<Record<ZombieAnim, THREE.AnimationClip>>;
}

let cachedZombieAssets: ZombieAssetBundle | null = null;
const pendingZombieCallbacks: Array<(bundle: ZombieAssetBundle) => void> = [];
let pendingZombieLoad: Promise<ZombieAssetBundle> | null = null;

function cloneZombieBundle(bundle: ZombieAssetBundle): ZombieAssetBundle {
  return {
    scene: clone(bundle.scene) as THREE.Group,
    clips: bundle.clips,
  };
}

function fulfillPendingZombieCallbacks(bundle: ZombieAssetBundle): void {
  cachedZombieAssets = bundle;
  while (pendingZombieCallbacks.length > 0) {
    pendingZombieCallbacks.shift()!(cloneZombieBundle(bundle));
  }
}

function loadZombieAssets(): Promise<ZombieAssetBundle> {
  if (cachedZombieAssets) return Promise.resolve(cachedZombieAssets);
  if (pendingZombieLoad) return pendingZombieLoad;

  const loader = new FBXLoader();
  pendingZombieLoad = new Promise((resolve) => {
    const clips: Partial<Record<ZombieAnim, THREE.AnimationClip>> = {};
    let baseScene: THREE.Group | null = null;
    let remaining = 3;

    const finish = (): void => {
      remaining -= 1;
      if (remaining > 0) return;

      if (!baseScene) {
        baseScene = new THREE.Group();
      }

      baseScene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });

      const bundle = { scene: baseScene, clips };
      pendingZombieLoad = null;
      fulfillPendingZombieCallbacks(bundle);
      resolve(bundle);
    };

    const onModelLoad = (fbx: THREE.Group): void => {
      baseScene = fbx;
      const clip = fbx.animations[0];
      if (clip) clips.walk = clip;
      finish();
    };

    const onAnimationLoad = (anim: ZombieAnim) => (fbx: THREE.Group): void => {
      const clip = fbx.animations[0];
      if (clip) clips[anim] = clip;
      finish();
    };

    const onError = (label: string) => (err: unknown): void => {
      console.error(`[zombieEnemy] Failed to load ${label}:`, err);
      finish();
    };

    loader.load(ZOMBIE_MODEL_URL, onModelLoad, undefined, onError('model'));
    loader.load(ZOMBIE_IDLE_URL, onAnimationLoad('idle'), undefined, onError('idle'));
    loader.load(ZOMBIE_ATTACK_URL, onAnimationLoad('attack'), undefined, onError('attack'));
  });

  return pendingZombieLoad;
}

function getZombieAssets(cb: (bundle: ZombieAssetBundle) => void): void {
  if (cachedZombieAssets) {
    cb(cloneZombieBundle(cachedZombieAssets));
    return;
  }

  pendingZombieCallbacks.push(cb);

  if (pendingZombieCallbacks.length === 1) {
    void loadZombieAssets();
  }
}

export async function preloadZombieAssets(): Promise<void> {
  await loadZombieAssets();
}

export interface ZombieConfig {
  hp: number;
  radius: number;
  mass: number;
  heatFactor: number;
  maxSpeed: number;
  acceleration: number;
  friction: number;
  attackRange: number;
  attackCooldown: number;
  attackDamage: number;
  attackAnimDuration: number;
  gibImpactThreshold: number;
  impactDamageScale: number;
  visualHeight: number;
  color: number;
}

export const ZOMBIE_TIER_1: ZombieConfig = {
  hp: 14,
  radius: 1.04,
  mass: 1.4,
  heatFactor: 0.08,
  maxSpeed: 6.6,
  acceleration: 18.5,
  friction: 0.9,
  attackRange: 1.8,
  attackCooldown: 0.95,
  attackDamage: 18,
  attackAnimDuration: 0.48,
  gibImpactThreshold: 5.5,
  impactDamageScale: 2.6,
  visualHeight: 3.8,
  color: 0x85735d,
};

export interface ZombieState {
  id: number;
  config: ZombieConfig;
  collidable: Collidable;
  group: THREE.Group;
  modelRoot: THREE.Group;
  fallbackMesh: THREE.Mesh;
  hpBarFill: THREE.Mesh;
  hp: number;
  maxHp: number;
  alive: boolean;
  awakened: boolean;
  mixer: THREE.AnimationMixer | null;
  actions: Partial<Record<ZombieAnim, THREE.AnimationAction>>;
  currentAnim: ZombieAnim | null;
  attackCooldown: number;
  attackAnimTimer: number;
  roarTimer: number;
  tintMaterials: THREE.MeshStandardMaterial[];
}

function buildFallbackVisual(config: ZombieConfig): {
  group: THREE.Group;
  modelRoot: THREE.Group;
  fallbackMesh: THREE.Mesh;
  hpBarFill: THREE.Mesh;
} {
  const group = new THREE.Group();
  const modelRoot = new THREE.Group();
  group.add(modelRoot);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: config.color,
    roughness: 0.92,
    metalness: 0.02,
  });
  const fallbackMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.95, 4, 8),
    bodyMat,
  );
  fallbackMesh.position.y = 0.78;
  fallbackMesh.castShadow = true;
  modelRoot.add(fallbackMesh);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xb6a18e, roughness: 0.95, metalness: 0.0 }),
  );
  head.position.set(0, 1.42, 0.02);
  head.castShadow = true;
  modelRoot.add(head);

  const { bg, fill } = createHpBar(1.0, 0.1, 2.25);
  group.add(bg);
  group.add(fill);
  bg.visible = false;
  fill.visible = false;

  return { group, modelRoot, fallbackMesh, hpBarFill: fill };
}

function setZombieAnimation(zombie: ZombieState, anim: ZombieAnim): void {
  if (!zombie.mixer || zombie.currentAnim === anim) return;
  const next = zombie.actions[anim];
  if (!next) return;

  const current = zombie.currentAnim ? zombie.actions[zombie.currentAnim] : null;
  current?.fadeOut(0.16);
  next.reset();
  next.enabled = true;
  next.setEffectiveTimeScale(anim === 'walk' ? 1.0 : 1.0);
  next.setEffectiveWeight(1.0);
  next.clampWhenFinished = anim === 'attack';
  next.loop = anim === 'attack' ? THREE.LoopOnce : THREE.LoopRepeat;
  next.fadeIn(0.14).play();
  zombie.currentAnim = anim;
}

function attachZombieModel(zombie: ZombieState, bundle: ZombieAssetBundle): void {
  if (!zombie.alive) return;

  const model = bundle.scene;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) return;
  const size = new THREE.Vector3();
  bounds.getSize(size);
  if (!Number.isFinite(size.y) || size.y <= 0.001) return;
  const height = Math.max(size.y, 0.001);
  const scale = zombie.config.visualHeight / height;
  model.scale.setScalar(scale);
  model.position.y = -bounds.min.y * scale;
  model.rotation.y = 0;

  const tintMaterials: THREE.MeshStandardMaterial[] = [];
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (Array.isArray(mesh.material)) return;
    if (!(mesh.material instanceof THREE.MeshStandardMaterial)) return;
    tintMaterials.push(mesh.material);
  });

  const fallbackChildren = [...zombie.modelRoot.children];
  zombie.modelRoot.add(model);
  for (const child of fallbackChildren) child.visible = false;
  zombie.tintMaterials = tintMaterials;

  if (Object.keys(bundle.clips).length > 0) {
    const mixer = new THREE.AnimationMixer(model);
    zombie.mixer = mixer;
    for (const anim of ['idle', 'walk', 'attack'] as ZombieAnim[]) {
      const clip = bundle.clips[anim];
      if (!clip) continue;
      zombie.actions[anim] = mixer.clipAction(clip);
    }
    if (zombie.actions.idle) setZombieAnimation(zombie, 'idle');
  }
}

export function createZombieEnemy(pos: Vec2, config: ZombieConfig): ZombieState {
  const { group, modelRoot, fallbackMesh, hpBarFill } = buildFallbackVisual(config);
  group.position.set(pos.x, 0, pos.z);
  scene.add(group);

  const collidable: Collidable = {
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: config.radius,
    mass: config.mass,
    isStatic: false,
    rpm: 40,
    rpmCapacity: 40,
    heatFactor: config.heatFactor,
  };
  collidables.push(collidable);

  const zombie: ZombieState = {
    id: nextEntityId(),
    config,
    collidable,
    group,
    modelRoot,
    fallbackMesh,
    hpBarFill,
    hp: config.hp,
    maxHp: config.hp,
    alive: true,
    awakened: true,
    mixer: null,
    actions: {},
    currentAnim: null,
    attackCooldown: Math.random() * 0.35,
    attackAnimTimer: 0,
    roarTimer: randomZombieRoarDelay(),
    tintMaterials: [],
  };

  registerMovement(zombie.id, collidable, config.maxSpeed, config.friction);
  tagCollidable(collidable, 'zombie');
  collidable.owner = zombie;

  getZombieAssets((bundle) => attachZombieModel(zombie, bundle));
  return zombie;
}

export function setZombieAwake(zombie: ZombieState, awakened: boolean): void {
  const wasAwake = zombie.awakened;
  zombie.awakened = awakened;
  zombie.collidable.enabled = awakened;
  zombie.collidable.vel.x = 0;
  zombie.collidable.vel.z = 0;
  zombie.attackAnimTimer = 0;
  zombie.attackCooldown = 0;
  zombie.roarTimer = randomZombieRoarDelay();
  setZombieAnimation(zombie, 'idle');

  if (!wasAwake && awakened) {
    playZombieRoarSound(
      String(zombie.id),
      { x: zombie.collidable.pos.x, z: zombie.collidable.pos.z },
      0.9,
    );
    zombie.roarTimer = 5.5 + Math.random() * 6.5;
  }
}

export function updateZombieAI(zombie: ZombieState, playerPos: Vec2, delta: number): boolean {
  if (!zombie.alive) return false;
  if (!zombie.awakened) return false;

  const body = zombie.collidable;
  const cfg = zombie.config;

  zombie.attackCooldown = Math.max(0, zombie.attackCooldown - delta);
  zombie.attackAnimTimer = Math.max(0, zombie.attackAnimTimer - delta);
  zombie.roarTimer -= delta;

  const dx = playerPos.x - body.pos.x;
  const dz = playerPos.z - body.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (zombie.roarTimer <= 0) {
    const proximityIntensity = Math.max(0.45, Math.min(1, 1 - dist / 18));
    playZombieRoarSound(
      String(zombie.id),
      { x: zombie.collidable.pos.x, z: zombie.collidable.pos.z },
      proximityIntensity,
    );
    zombie.roarTimer = randomZombieRoarDelay();
  }

  if (dist <= cfg.attackRange) {
    body.vel.x *= 0.82;
    body.vel.z *= 0.82;
    if (zombie.attackCooldown <= 0) {
      zombie.attackCooldown = cfg.attackCooldown;
      zombie.attackAnimTimer = cfg.attackAnimDuration;
      setZombieAnimation(zombie, 'attack');
      return true;
    }

    if (zombie.attackAnimTimer <= 0) {
      setZombieAnimation(zombie, 'idle');
    }
    return false;
  }

  if (dist > 0.1) {
    const invDist = 1 / dist;
    body.vel.x += dx * invDist * cfg.acceleration * delta;
    body.vel.z += dz * invDist * cfg.acceleration * delta;
  }

  const limit = ARENA_SIZE - 2.2;
  if (body.pos.x > limit) body.vel.x -= cfg.acceleration * delta * 0.6;
  if (body.pos.x < -limit) body.vel.x += cfg.acceleration * delta * 0.6;
  if (body.pos.z > limit) body.vel.z -= cfg.acceleration * delta * 0.6;
  if (body.pos.z < -limit) body.vel.z += cfg.acceleration * delta * 0.6;

  setZombieAnimation(zombie, 'walk');
  return false;
}

export function updateZombieVisuals(zombie: ZombieState, playerPos: Vec2, delta: number, time: number): void {
  if (!zombie.alive) return;

  const body = zombie.collidable;
  zombie.group.position.x = body.pos.x;
  zombie.group.position.z = body.pos.z;
  zombie.mixer?.update(delta);

  const moveSpeed = Math.hypot(body.vel.x, body.vel.z);
  const facingDx = moveSpeed > 0.15 ? body.vel.x : playerPos.x - body.pos.x;
  const facingDz = moveSpeed > 0.15 ? body.vel.z : playerPos.z - body.pos.z;
  const targetAngle = Math.atan2(facingDx, facingDz);
  let diff = targetAngle - zombie.group.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  zombie.group.rotation.y += diff * Math.min(5.0 * delta, 1.0);

  updateHpBar(zombie.hpBarFill, zombie.hp / zombie.maxHp, 0.75);

  const hpFrac = zombie.hp / zombie.maxHp;
  const pulse = 0.5 + 0.5 * Math.sin(time * 5.5);
  const hurt = 1.0 - hpFrac;
  for (const mat of zombie.tintMaterials) {
    mat.emissive.setRGB(hurt * pulse * 0.18, 0, 0);
    mat.emissiveIntensity = hurt * 0.35;
  }
}

export function applyDamageToZombie(zombie: ZombieState, damage: number): boolean {
  zombie.hp = Math.max(0, zombie.hp - damage);
  updateHpBar(zombie.hpBarFill, zombie.hp / zombie.maxHp, 0.75);
  return zombie.hp <= 0;
}

export function isZombieDead(zombie: ZombieState): boolean {
  return zombie.alive && zombie.hp <= 0;
}

export function destroyZombieEnemy(zombie: ZombieState): void {
  zombie.alive = false;
  zombie.mixer?.stopAllAction();
  deregisterEntity(zombie.id);
  untagCollidable(zombie.collidable);
  scene.remove(zombie.group);
  const idx = collidables.indexOf(zombie.collidable);
  if (idx !== -1) collidables.splice(idx, 1);
}
