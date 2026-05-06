import * as THREE from 'three';
import { scene } from './renderer';
import { playSpiderLegPlantSound } from './sound';
import { collidables, type Collidable, type Vec2 } from './physics';
import { createHpBar, updateHpBar } from './hpBar';
import { getArenaBounds, isPointInLava } from './arena';
import { releaseProjectileResources, type Projectile } from './projectile';
import { createTop, TOP_BASE_RADIUS, type TopResult } from './top';
import { releaseAuraLight } from './auraLightPool';
import { updateSpinnerVisuals } from './spinnerVisuals';
import { ENEMY_SPINNER_TIER_1 } from './enemySpinner';
import {
  applySpinnerWallAvoidance,
  beginSpinnerBurst,
  beginSpinnerWindup,
  resetSpinnerOrbitTimer,
  steerSpinnerOrbit,
  tickSpinnerOrbitFlip,
  updateSpinnerDashState,
  type SpinnerDuelAiState,
  type SpinnerDuelConfig,
} from './spinnerDuelAi';
import {
  nextEntityId,
  registerMovement,
  registerRpm,
  tagCollidable,
  untagCollidable,
  deregisterEntity,
  setMovementMaxSpeed,
} from './systems';

export interface SpiderReliquaryConfig {
  coreRpmCapacity: number;
  coreRadius: number;
  coreMass: number;
  coreMaxSpeed: [number, number, number];
  coreAcceleration: [number, number, number];
  legCount: number;
  legHp: number;
  legRadius: number;
  hipOrbitRadius: number;
  footOrbitRadius: number;
  legUpperLength: number;
  legLowerLength: number;
  stepThreshold: number;
  stepDuration: number;
  stepHeight: number;
  strideLead: number;
  minStrideDistance: number;
  plantedSway: number;
  bodySupportBias: number;
  bodyScale: number;
  lavaProbeStep: number;
  lavaProbeMaxDistance: number;
  lavaTangentProbeCount: number;
  shieldLegThreshold: number;
  collapseDuration: number;
  stompRadius: number;
  stompWindup: [number, number, number];
  stompDamage: [number, number, number];
  stompCooldown: [number, number, number];
  pulseRadius: [number, number, number];
  pulseDamage: [number, number, number];
  pulseCooldown: [number, number, number];
  legSlamRadius: number;
  legSlamTriggerRange: number;
  legSlamLungeDistance: number;
  legSlamWindup: [number, number, number];
  legSlamRecover: number;
  legSlamDamage: [number, number, number];
  legSlamCooldown: [number, number, number];
  webDamage: [number, number, number];
  webCooldown: [number, number, number];
  webDuration: [number, number, number];
  webRange: [number, number, number];
  webSpeed: [number, number, number];
  acidDamage: [number, number, number];
  acidCooldown: [number, number, number];
  acidSpeed: [number, number, number];
  heatFactor: number;
  color: number;
}

export const SPIDER_RELIQUARY_TIER_1: SpiderReliquaryConfig = {
  coreRpmCapacity: 200,
  coreRadius: 0.98,
  coreMass: 5.4,
  coreMaxSpeed: [11.2, 15.2, 19.2],
  coreAcceleration: [26.0, 32.0, 39.0],
  legCount: 4,
  legHp: 10,
  legRadius: 0.95,
  hipOrbitRadius: 1.35,
  footOrbitRadius: 5.4,
  legUpperLength: 3.5,
  legLowerLength: 3.8,
  stepThreshold: 1.55,
  stepDuration: 0.24,
  stepHeight: 1.35,
  strideLead: 1.7,
  minStrideDistance: 1.9,
  plantedSway: 0.22,
  bodySupportBias: 0.4,
  bodyScale: 0.5,
  lavaProbeStep: 0.75,
  lavaProbeMaxDistance: 3.4,
  lavaTangentProbeCount: 3,
  shieldLegThreshold: 2,
  collapseDuration: 4.6,
  stompRadius: 1.85,
  stompWindup: [1.0, 0.84, 0.7],
  stompDamage: [18, 23, 30],
  stompCooldown: [2.7, 2.0, 1.45],
  pulseRadius: [3.0, 3.8, 4.6],
  pulseDamage: [12, 16, 21],
  pulseCooldown: [5.2, 4.1, 3.2],
  legSlamRadius: 1.9,
  legSlamTriggerRange: 4.8,
  legSlamLungeDistance: 2.2,
  legSlamWindup: [0.34, 0.3, 0.26],
  legSlamRecover: 0.22,
  legSlamDamage: [22, 30, 38],
  legSlamCooldown: [0.9, 0.75, 0.6],
  webDamage: [10, 14, 18],
  webCooldown: [5.8, 4.5, 3.5],
  webDuration: [0.95, 1.08, 1.22],
  webRange: [30.8, 34.8, 38.8],
  webSpeed: [7.4, 8.2, 9.2],
  acidDamage: [9, 12, 16],
  acidCooldown: [3.8, 3.0, 2.4],
  acidSpeed: [25.6, 25.4, 25.2],
  heatFactor: 1.05,
  color: 0x8b7351,
};

const ONE_LEG_HOP_WINDUP = 0.16;
const ONE_LEG_HOP_AIR = 0.36;
const ONE_LEG_HOP_RECOVER = 0.1;
const FINAL_CORE_CHARGE_BOOST = 3.2;
const FINAL_CORE_RECOVERY_TIME = 0.18;
const FINAL_CORE_WALL_AVOID_DIST = 3.4;
const FINAL_CORE_ORBIT_RANGE = 4.35;
const FINAL_CORE_ORBIT_STRAFE = 1.06;
const FINAL_CORE_CUT_IN_DURATION = 0.9;
const FINAL_CORE_CUT_IN_COOLDOWN = 0.52;
const FINAL_CORE_ORBIT_FLIP_INTERVAL = 0.84;
const FINAL_CORE_DASH_WINDUP = 0.11;
const FINAL_CORE_DASH_SPEED_MULT = 2.85;
const FINAL_CORE_TRANSITION_STUN = 0.46;
const FINAL_CORE_MIN_RPM = ENEMY_SPINNER_TIER_1.rpmCapacity / 7;
const FINAL_CORE_DAMAGE_TAKEN_MULT = 1.0;
const FINAL_CORE_WEB_COOLDOWN = 5.2;
const FINAL_CORE_COMBO_LOCK = 0.1;
const FINAL_CORE_DASH_COMBO_LOCK = 0.16;
const FINAL_CORE_SPIN_SPEED = 38;
// Visual scale of the spinner top in final core mode. Also drives the
// collidable radius so the physics footprint matches what the player sees.
const FINAL_CORE_TOP_SCALE = 0.86;

type SpiderAttackKind = 'stomp' | 'pulse' | 'leg_slam' | 'web' | 'acid';

export interface SpiderReliquaryAttackEvent {
  kind: SpiderAttackKind;
  point: { x: number; y: number; z: number };
  radius: number;
  damage: number;
  hitPlayer: boolean;
  knockback?: number;
  webDuration?: number;
  // For 'acid' kind only: present when the event represents firing an acid
  // projectile (rather than a hit). game.ts spawns the projectile from these.
  firePos?: Vec2;
  fireDir?: Vec2;
  speed?: number;
}

interface SpiderAttack {
  kind: SpiderAttackKind;
  point: Vec2;
  radius: number;
  damage: number;
  windup: number;
  recover: number;
  elapsed: number;
  facingAngle: number;
  didLunge: boolean;
  hitResolved: boolean;
  mesh: THREE.Mesh;
}

export interface SpiderLeg {
  collidable: Collidable;
  group: THREE.Group;
  upperMesh: THREE.Mesh;
  lowerMesh: THREE.Mesh;
  kneeMesh: THREE.Mesh;
  tipMesh: THREE.Mesh;
  hpGroup: THREE.Group;
  hpBarFill: THREE.Mesh;
  hp: number;
  maxHp: number;
  alive: boolean;
  baseAngle: number;
  hipRadius: number;
  footRadius: number;
  footPos: THREE.Vector3;
  footFrom: THREE.Vector3;
  footTo: THREE.Vector3;
  stepProgress: number;
  stepDuration: number;
  plantedTime: number;
  replantLock: number;
  phaseOffset: number;
  gaitGroup: 0 | 1;
  kneeSign: 1 | -1;
}

export interface SpiderReliquaryState {
  id: number;
  config: SpiderReliquaryConfig;
  collidable: Collidable;
  bodyGroup: THREE.Group;
  bodyRoot: THREE.Group;
  pedestalMesh: THREE.Mesh;
  shellMesh: THREE.Mesh;
  coreMesh: THREE.Mesh;
  haloMesh: THREE.Mesh;
  shieldMesh: THREE.Mesh;
  coreTop: TopResult;
  coreTopBaseColor: THREE.Color;
  hpGroup: THREE.Group;
  hpBarFill: THREE.Mesh;
  legs: SpiderLeg[];
  attacks: SpiderAttack[];
  alive: boolean;
  awakened: boolean;
  facingAngle: number;
  collapseTimer: number;
  stompCooldown: number;
  pulseCooldown: number;
  legSlamCooldown: number;
  webCooldown: number;
  acidCooldown: number;
  gaitTime: number;
  legCycleCursor: number;
  gaitGroupActive: 0 | 1;
  turnRate: number;
  visualPos: THREE.Vector3;
  corePassThroughCooldown: number;
  oneLegHopWindup: number;
  oneLegHopAir: number;
  oneLegHopRecover: number;
  oneLegHopDirX: number;
  oneLegHopDirZ: number;
  aiState: SpinnerDuelAiState;
  recoveryTimer: number;
  orbitDir: -1 | 1;
  orbitFlipTimer: number;
  windupTimer: number;
  cutInTimer: number;
  dashCooldown: number;
  dashDirX: number;
  dashDirZ: number;
  tiltX: number;
  tiltZ: number;
  finalCoreGraceTimer: number;
  webTetherTimer: number;
  webTetherDuration: number;
  webTetherTarget: THREE.Vector3;
  webTetherGroup: THREE.Group;
  webTetherSegments: THREE.Mesh[];
  webTetherNodes: THREE.Mesh[];
  webProjectiles: Projectile[];
  acidProjectiles: Projectile[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothStep01(t: number): number {
  return t * t * (3 - 2 * t);
}

function wrapAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function setSegmentFromPoints(
  mesh: THREE.Mesh,
  start: THREE.Vector3,
  end: THREE.Vector3,
  thickness: number,
): void {
  const delta = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(delta.length(), 0.001);
  mesh.position.copy(start).lerp(end, 0.5);
  mesh.scale.set(thickness, length, thickness);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
}

function createWebTetherVisuals(): {
  group: THREE.Group;
  segments: THREE.Mesh[];
  nodes: THREE.Mesh[];
} {
  const group = new THREE.Group();
  const strandMat = new THREE.MeshStandardMaterial({
    color: 0xf2eadf,
    emissive: 0xd8c8b2,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.96,
    roughness: 0.92,
    metalness: 0.02,
    depthWrite: false,
  });
  const knotMat = new THREE.MeshStandardMaterial({
    color: 0xfff7ee,
    emissive: 0xe6d8bf,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.98,
    roughness: 0.84,
    metalness: 0.02,
    depthWrite: false,
  });

  const segments: THREE.Mesh[] = [];
  const nodes: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.055, 1, 5),
      strandMat.clone(),
    );
    seg.visible = false;
    seg.castShadow = false;
    seg.receiveShadow = false;
    group.add(seg);
    segments.push(seg);
  }

  for (let i = 0; i < 9; i++) {
    const node = new THREE.Mesh(
      new THREE.SphereGeometry(i === 0 ? 0.08 : 0.055, 6, 6),
      knotMat.clone(),
    );
    node.visible = false;
    node.castShadow = false;
    node.receiveShadow = false;
    group.add(node);
    nodes.push(node);
  }

  scene.add(group);
  return { group, segments, nodes };
}

function solveTwoBoneKnee(
  hip: THREE.Vector3,
  foot: THREE.Vector3,
  upperLength: number,
  lowerLength: number,
  bendHint: THREE.Vector3,
): THREE.Vector3 {
  const toFoot = new THREE.Vector3().subVectors(foot, hip);
  const distance = clamp(toFoot.length(), 0.001, upperLength + lowerLength - 0.001);
  const forward = toFoot.normalize();

  const bend = bendHint.clone().projectOnPlane(forward);
  if (bend.lengthSq() < 1e-4) {
    bend.set(-forward.z, 0.6, forward.x);
  }
  bend.normalize();

  const along = clamp(
    (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance),
    0,
    upperLength,
  );
  const height = Math.sqrt(Math.max(upperLength * upperLength - along * along, 0));
  return hip.clone()
    .addScaledVector(forward, along)
    .addScaledVector(bend, height);
}

function isFootReachable(
  boss: SpiderReliquaryState,
  hip: THREE.Vector3,
  foot: THREE.Vector3,
): boolean {
  const maxReach = boss.config.legUpperLength + boss.config.legLowerLength - 0.15;
  return hip.distanceTo(foot) <= maxReach;
}

function findSafeFootTarget(
  boss: SpiderReliquaryState,
  hip: THREE.Vector3,
  preferred: THREE.Vector3,
  outward: THREE.Vector3,
  tangent: THREE.Vector3,
  currentFoot: THREE.Vector3,
): THREE.Vector3 {
  const safeCurrent = currentFoot.clone();
  safeCurrent.y = 0.05;
  const candidates: THREE.Vector3[] = [];
  const addCandidate = (candidate: THREE.Vector3) => {
    const normalized = candidate.clone();
    normalized.y = 0.05;
    candidates.push(normalized);
  };

  addCandidate(preferred);

  const maxDistance = boss.config.lavaProbeMaxDistance;
  const step = boss.config.lavaProbeStep;
  const tangentCount = boss.config.lavaTangentProbeCount;
  for (let forward = step; forward <= maxDistance + 1e-4; forward += step) {
    addCandidate(preferred.clone().addScaledVector(outward, forward));
    for (let side = 1; side <= tangentCount; side++) {
      const sideOffset = step * side;
      addCandidate(
        preferred.clone()
          .addScaledVector(outward, forward)
          .addScaledVector(tangent, sideOffset),
      );
      addCandidate(
        preferred.clone()
          .addScaledVector(outward, forward)
          .addScaledVector(tangent, -sideOffset),
      );
    }
  }

  for (let side = 1; side <= tangentCount; side++) {
    const sideOffset = step * side;
    addCandidate(preferred.clone().addScaledVector(tangent, sideOffset));
    addCandidate(preferred.clone().addScaledVector(tangent, -sideOffset));
  }

  for (const candidate of candidates) {
    if (!isFootReachable(boss, hip, candidate)) continue;
    if (isPointInLava({ x: candidate.x, z: candidate.z })) continue;
    return candidate;
  }

  if (!isPointInLava({ x: safeCurrent.x, z: safeCurrent.z }) && isFootReachable(boss, hip, safeCurrent)) {
    return safeCurrent;
  }

  return preferred.clone().setY(0.05);
}

function getAliveLegCount(boss: SpiderReliquaryState): number {
  return boss.legs.filter((leg) => leg.alive).length;
}

function isFinalCoreMode(boss: SpiderReliquaryState): boolean {
  return getAliveLegCount(boss) === 0;
}

function getPhaseIndex(boss: SpiderReliquaryState): number {
  const alive = getAliveLegCount(boss);
  if (alive >= 4) return 0;
  if (alive >= 2) return 1;
  return 2;
}

function getFinalCoreDuelConfig(boss: SpiderReliquaryState): SpinnerDuelConfig {
  const phase = 2;
  return {
    maxSpeed: boss.config.coreMaxSpeed[phase] * 1.14,
    acceleration: boss.config.coreAcceleration[phase] * 0.94,
    chargeBoost: FINAL_CORE_CHARGE_BOOST,
    recoveryTime: FINAL_CORE_RECOVERY_TIME,
    wallAvoidDist: FINAL_CORE_WALL_AVOID_DIST,
    orbitRange: FINAL_CORE_ORBIT_RANGE,
    orbitStrafeStrength: FINAL_CORE_ORBIT_STRAFE,
    cutInDuration: FINAL_CORE_CUT_IN_DURATION,
    cutInCooldown: FINAL_CORE_CUT_IN_COOLDOWN,
    orbitFlipInterval: FINAL_CORE_ORBIT_FLIP_INTERVAL,
    dashWindupDuration: FINAL_CORE_DASH_WINDUP,
    dashSpeedMult: FINAL_CORE_DASH_SPEED_MULT,
  };
}

function resetFinalCoreDuelState(boss: SpiderReliquaryState): void {
  boss.aiState = 'orbit';
  boss.recoveryTimer = 0;
  boss.windupTimer = 0;
  boss.cutInTimer = 0;
  boss.dashCooldown = 0;
  boss.dashDirX = 0;
  boss.dashDirZ = 1;
  resetSpinnerOrbitTimer(boss, getFinalCoreDuelConfig(boss));
}

export function canDamageSpiderCore(boss: SpiderReliquaryState): boolean {
  return isFinalCoreMode(boss) && boss.finalCoreGraceTimer <= 0;
}

export function getSpiderCoreDamageMultiplier(boss: SpiderReliquaryState): number {
  return canDamageSpiderCore(boss) ? FINAL_CORE_DAMAGE_TAKEN_MULT : 0;
}

export function getSpiderCoreComboLockDuration(boss: SpiderReliquaryState): number {
  if (!canDamageSpiderCore(boss)) return 0;
  if (boss.aiState === 'dash') return FINAL_CORE_DASH_COMBO_LOCK;
  if (boss.aiState === 'windup') return FINAL_CORE_COMBO_LOCK;
  return 0;
}

function createAttackMesh(kind: SpiderAttackKind): THREE.Mesh {
  const geometry = kind === 'pulse'
    ? new THREE.RingGeometry(0.7, 1.0, 48)
    : new THREE.CircleGeometry(1, 40);
  const material = new THREE.MeshBasicMaterial({
    color: kind === 'pulse'
      ? 0xffd26e
      : kind === 'leg_slam'
        ? 0xff9b54
        : kind === 'web'
          ? 0xf7efe1
          : 0xff7042,
    transparent: true,
    opacity: kind === 'pulse' ? 0.18 : kind === 'leg_slam' ? 0.22 : kind === 'web' ? 0.12 : 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.05;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

function removeAttack(attack: SpiderAttack): void {
  scene.remove(attack.mesh);
  attack.mesh.geometry.dispose();
  if (attack.mesh.material instanceof THREE.Material) attack.mesh.material.dispose();
}

function setWebTetherVisible(boss: SpiderReliquaryState, visible: boolean): void {
  boss.webTetherGroup.visible = visible;
  for (const seg of boss.webTetherSegments) seg.visible = visible;
  for (const node of boss.webTetherNodes) node.visible = visible;
}

function resetSpiderTransientState(boss: SpiderReliquaryState): void {
  boss.collidable.vel.x = 0;
  boss.collidable.vel.z = 0;
  boss.oneLegHopWindup = 0;
  boss.oneLegHopAir = 0;
  boss.oneLegHopRecover = 0;
  boss.corePassThroughCooldown = 0;
  boss.finalCoreGraceTimer = 0;
  boss.webTetherTimer = 0;
  boss.webTetherDuration = 0;
  setWebTetherVisible(boss, false);
  for (const attack of boss.attacks) removeAttack(attack);
  boss.attacks.length = 0;
  resetFinalCoreDuelState(boss);
}

function scheduleStomp(
  boss: SpiderReliquaryState,
  target: Vec2,
  phase: number,
): void {
  const radius = boss.config.stompRadius;
  const bounds = getArenaBounds();
  const point = {
    x: clamp(target.x, bounds.minX + radius + 0.5, bounds.maxX - radius - 0.5),
    z: clamp(target.z, bounds.minZ + radius + 0.5, bounds.maxZ - radius - 0.5),
  };
  const mesh = createAttackMesh('stomp');
  mesh.position.set(point.x, 0.05, point.z);
  mesh.scale.set(radius, radius, 1);
  boss.attacks.push({
    kind: 'stomp',
    point,
    radius,
    damage: boss.config.stompDamage[phase],
    windup: boss.config.stompWindup[phase],
    recover: 0,
    elapsed: 0,
    facingAngle: boss.facingAngle,
    didLunge: false,
    hitResolved: false,
    mesh,
  });
}

function scheduleLegSlam(
  boss: SpiderReliquaryState,
  facingAngle: number,
  phase: number,
): void {
  const radius = boss.config.legSlamRadius;
  const bounds = getArenaBounds();
  const lungeDistance = boss.config.legSlamLungeDistance;
  const point = {
    x: clamp(
      boss.collidable.pos.x + Math.sin(facingAngle) * lungeDistance,
      bounds.minX + radius + 0.35,
      bounds.maxX - radius - 0.35,
    ),
    z: clamp(
      boss.collidable.pos.z + Math.cos(facingAngle) * lungeDistance,
      bounds.minZ + radius + 0.35,
      bounds.maxZ - radius - 0.35,
    ),
  };
  const mesh = createAttackMesh('leg_slam');
  mesh.position.set(point.x, 0.05, point.z);
  mesh.scale.set(radius, radius, 1);
  boss.attacks.push({
    kind: 'leg_slam',
    point,
    radius,
    damage: boss.config.legSlamDamage[phase],
    windup: boss.config.legSlamWindup[phase],
    recover: boss.config.legSlamRecover,
    elapsed: 0,
    facingAngle,
    didLunge: false,
    hitResolved: false,
    mesh,
  });
}

function schedulePulse(boss: SpiderReliquaryState, phase: number): void {
  const radius = boss.config.pulseRadius[phase];
  const mesh = createAttackMesh('pulse');
  mesh.position.set(boss.collidable.pos.x, 0.055, boss.collidable.pos.z);
  mesh.scale.set(radius, radius, 1);
  boss.attacks.push({
    kind: 'pulse',
    point: { x: boss.collidable.pos.x, z: boss.collidable.pos.z },
    radius,
    damage: boss.config.pulseDamage[phase],
    windup: 0.7,
    recover: 0,
    elapsed: 0,
    facingAngle: boss.facingAngle,
    didLunge: false,
    hitResolved: false,
    mesh,
  });
}

function scheduleWebShot(
  boss: SpiderReliquaryState,
  target: Vec2,
  playerRadius: number,
  phase: number,
): void {
  const radius = playerRadius * 0.8 + 0.42;
  const point = { x: target.x, z: target.z };
  const dist = Math.hypot(target.x - boss.collidable.pos.x, target.z - boss.collidable.pos.z);
  const windup = clamp(dist / Math.max(boss.config.webSpeed[phase] * 8.0, 0.001), 0.08, 0.16);
  const mesh = createAttackMesh('web');
  mesh.position.set(point.x, 0.045, point.z);
  mesh.scale.set(radius, radius, 1);
  boss.attacks.push({
    kind: 'web',
    point,
    radius,
    damage: boss.config.webDamage[phase],
    windup,
    recover: 0,
    elapsed: 0,
    facingAngle: boss.facingAngle,
    didLunge: false,
    hitResolved: false,
    mesh,
  });
}

function makeLeg(baseAngle: number, config: SpiderReliquaryConfig): SpiderLeg {
  const group = new THREE.Group();
  const limbMat = new THREE.MeshStandardMaterial({
    color: 0x6d655d,
    roughness: 0.74,
    metalness: 0.36,
  });
  const upperMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 6),
    limbMat,
  );
  upperMesh.castShadow = true;
  group.add(upperMesh);

  const lowerMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 6),
    limbMat.clone(),
  );
  lowerMesh.castShadow = true;
  group.add(lowerMesh);

  const kneeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 8, 8),
    new THREE.MeshStandardMaterial({
      color: 0x8b785f,
      roughness: 0.58,
      metalness: 0.48,
    }),
  );
  kneeMesh.castShadow = true;
  group.add(kneeMesh);

  const tipMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.44, 6),
    new THREE.MeshStandardMaterial({
      color: 0xb48c52,
      roughness: 0.42,
      metalness: 0.58,
    }),
  );
  tipMesh.rotation.x = Math.PI / 2;
  tipMesh.castShadow = true;
  group.add(tipMesh);

  const hpGroup = new THREE.Group();
  const { bg, fill } = createHpBar(0.95, 0.08, 0);
  hpGroup.add(bg);
  hpGroup.add(fill);
  group.add(hpGroup);
  scene.add(group);

  const collidable: Collidable = {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: config.legRadius,
    mass: 2.8,
    isStatic: true,
    rpm: 1,
    rpmCapacity: 1,
    heatFactor: 0.08,
  };
  collidables.push(collidable);
  tagCollidable(collidable, 'spider_leg');

  return {
    collidable,
    group,
    upperMesh,
    lowerMesh,
    kneeMesh,
    tipMesh,
    hpGroup,
    hpBarFill: fill,
    hp: config.legHp,
    maxHp: config.legHp,
    alive: true,
    baseAngle,
    hipRadius: config.hipOrbitRadius,
    footRadius: config.footOrbitRadius,
    footPos: new THREE.Vector3(),
    footFrom: new THREE.Vector3(),
    footTo: new THREE.Vector3(),
    stepProgress: 1,
    stepDuration: config.stepDuration * (0.9 + Math.random() * 0.25),
    plantedTime: 999,
    replantLock: 0,
    phaseOffset: Math.random() * Math.PI * 2,
    gaitGroup: (Math.sin(baseAngle) * Math.cos(baseAngle) >= 0 ? 0 : 1),
    kneeSign: Math.sin(baseAngle) >= 0 ? 1 : -1,
  };
}

export function createSpiderReliquary(pos: Vec2, config: SpiderReliquaryConfig): SpiderReliquaryState {
  const bodyGroup = new THREE.Group();
  const bodyRoot = new THREE.Group();
  bodyGroup.add(bodyRoot);
  scene.add(bodyGroup);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.98, 0.34, 10),
    new THREE.MeshStandardMaterial({
      color: 0x4e463d,
      roughness: 0.9,
      metalness: 0.18,
    }),
  );
  pedestal.position.y = 1.42;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  bodyRoot.add(pedestal);

  const reliquaryBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.68, 0.7, 8),
    new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.58,
      metalness: 0.52,
    }),
  );
  reliquaryBody.position.y = 1.86;
  reliquaryBody.castShadow = true;
  reliquaryBody.receiveShadow = true;
  bodyRoot.add(reliquaryBody);

  const coreMesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.28, 0),
    new THREE.MeshStandardMaterial({
      color: 0xffb05d,
      emissive: 0xff8a33,
      emissiveIntensity: 1.2,
      roughness: 0.18,
      metalness: 0.2,
    }),
  );
  coreMesh.position.y = 1.86;
  coreMesh.castShadow = true;
  bodyRoot.add(coreMesh);

  const haloMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.78, 0.05, 8, 32),
    new THREE.MeshStandardMaterial({
      color: 0xd7ae5c,
      emissive: 0xb46f1c,
      emissiveIntensity: 0.28,
      roughness: 0.32,
      metalness: 0.72,
    }),
  );
  haloMesh.rotation.x = Math.PI / 2;
  haloMesh.position.y = 2.0;
  haloMesh.castShadow = true;
  bodyRoot.add(haloMesh);

  const coreTop = createTop(0xff8f32);
  coreTop.tiltGroup.scale.setScalar(FINAL_CORE_TOP_SCALE);
  coreTop.tiltGroup.position.set(0, 0.18, 0);
  coreTop.tiltGroup.visible = false;
  bodyGroup.add(coreTop.tiltGroup);

  const shieldMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.18, 1),
    new THREE.MeshStandardMaterial({
      color: 0xffd47a,
      emissive: 0xff8a33,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      roughness: 0.1,
      metalness: 0.22,
    }),
  );
  shieldMesh.position.y = 1.88;
  bodyRoot.add(shieldMesh);

  const hpGroup = new THREE.Group();
  const { bg, fill } = createHpBar(2.5, 0.16, 4.2);
  hpGroup.add(bg);
  hpGroup.add(fill);
  scene.add(hpGroup);

  const collidable: Collidable = {
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: config.coreRadius,
    mass: config.coreMass,
    isStatic: false,
    rpm: config.coreRpmCapacity,
    rpmCapacity: config.coreRpmCapacity,
    heatFactor: config.heatFactor,
  };
  const id = nextEntityId();
  registerMovement(id, collidable, config.coreMaxSpeed[0], 0.95);
  registerRpm(id, collidable, 0, 0);
  tagCollidable(collidable, 'spider_core');

  const legs: SpiderLeg[] = [];
  for (let i = 0; i < config.legCount; i++) {
    const angle = Math.PI * 0.25 + (i / config.legCount) * Math.PI * 2;
    legs.push(makeLeg(angle, config));
  }

  const webTetherVisuals = createWebTetherVisuals();

  const boss: SpiderReliquaryState = {
    id,
    config,
    collidable,
    bodyGroup,
    bodyRoot,
    pedestalMesh: pedestal,
    shellMesh: reliquaryBody,
    coreMesh,
    haloMesh,
    shieldMesh,
    coreTop,
    coreTopBaseColor: new THREE.Color(0xff8f32),
    hpGroup,
    hpBarFill: fill,
    legs,
    attacks: [],
    alive: true,
    awakened: true,
    facingAngle: 0,
    collapseTimer: 0,
    stompCooldown: 1.1,
    pulseCooldown: 2.4,
    legSlamCooldown: 1.25,
    webCooldown: 2.3,
    acidCooldown: 1.6,
    gaitTime: Math.random() * Math.PI * 2,
    legCycleCursor: 0,
    gaitGroupActive: 0,
    turnRate: 0,
    visualPos: new THREE.Vector3(pos.x, 0, pos.z),
    corePassThroughCooldown: 0,
    oneLegHopWindup: 0,
    oneLegHopAir: 0,
    oneLegHopRecover: 0,
    oneLegHopDirX: 0,
    oneLegHopDirZ: 0,
    aiState: 'orbit',
    recoveryTimer: 0,
    orbitDir: Math.random() < 0.5 ? -1 : 1,
    orbitFlipTimer: 1.0,
    windupTimer: 0,
    cutInTimer: 0,
    dashCooldown: 0,
    dashDirX: 0,
    dashDirZ: 1,
    tiltX: 0,
    tiltZ: 0,
    finalCoreGraceTimer: 0,
    webTetherTimer: 0,
    webTetherDuration: 0,
    webTetherTarget: new THREE.Vector3(pos.x, 0.75, pos.z),
    webTetherGroup: webTetherVisuals.group,
    webTetherSegments: webTetherVisuals.segments,
    webTetherNodes: webTetherVisuals.nodes,
    webProjectiles: [],
    acidProjectiles: [],
  };

  bodyGroup.position.set(pos.x, 0, pos.z);
  hpGroup.position.set(pos.x, 0, pos.z);
  bodyRoot.scale.setScalar(config.bodyScale);
  setWebTetherVisible(boss, false);
  collidable.owner = boss;
  for (const leg of legs) leg.collidable.owner = { boss, leg };
  resetFinalCoreDuelState(boss);
  syncSpiderReliquaryLegs(boss, 0);
  return boss;
}

export function setSpiderAwake(boss: SpiderReliquaryState, awakened: boolean): void {
  boss.awakened = awakened;
  boss.collidable.enabled = awakened;
  for (const leg of boss.legs) {
    if (!leg.alive) continue;
    leg.collidable.enabled = awakened;
  }
  resetSpiderTransientState(boss);
}

export function syncSpiderReliquaryLegs(boss: SpiderReliquaryState, delta: number): void {
  if (!boss.alive) return;
  const core = boss.collidable;
  const oneLegMode = getAliveLegCount(boss) === 1;
  const phase = getPhaseIndex(boss);
  const hipY = 1.88 - (boss.collapseTimer > 0 ? 0.45 : 0);
  const bodySpeed = Math.hypot(core.vel.x, core.vel.z);
  const turnUrgency = clamp(Math.abs(boss.turnRate) / 3.2, 0, 1);
  const turnSign = Math.sign(boss.turnRate) || 1;
  let supportX = 0;
  let supportZ = 0;
  let supportWeight = 0;
  for (const leg of boss.legs) {
    if (!leg.alive || leg.footPos.lengthSq() === 0) continue;
    const weight = leg.stepProgress < 1 ? 0.35 : 1.0;
    supportX += leg.footPos.x * weight;
    supportZ += leg.footPos.z * weight;
    supportWeight += weight;
  }
  const supportCenterX = supportWeight > 0 ? supportX / supportWeight : core.pos.x;
  const supportCenterZ = supportWeight > 0 ? supportZ / supportWeight : core.pos.z;
  const visualBias = boss.config.bodySupportBias + turnUrgency * 0.08;
  const desiredVisualX = lerp(core.pos.x, supportCenterX, visualBias);
  const desiredVisualZ = lerp(core.pos.z, supportCenterZ, visualBias);
  const bodyFollow = delta <= 0 ? 1 : Math.min((4.2 + bodySpeed * 0.28) * delta, 1);
  boss.visualPos.x = lerp(boss.visualPos.x, desiredVisualX, bodyFollow);
  boss.visualPos.z = lerp(boss.visualPos.z, desiredVisualZ, bodyFollow);
  const moveDir = bodySpeed > 0.01
    ? new THREE.Vector3(core.vel.x / bodySpeed, 0, core.vel.z / bodySpeed)
    : new THREE.Vector3(Math.sin(boss.facingAngle), 0, Math.cos(boss.facingAngle));
  const activeGroup = boss.gaitGroupActive;
  const stepThreshold = boss.config.stepThreshold
    * (boss.collapseTimer > 0 ? 0.72 : 1.0)
    * (1.0 - turnUrgency * 0.28)
    * (oneLegMode ? 1.45 : 1.0);
  const entries: Array<{
    leg: SpiderLeg;
    hip: THREE.Vector3;
    supportFoot: THREE.Vector3;
    stepTarget: THREE.Vector3;
    outward: THREE.Vector3;
    tangent: THREE.Vector3;
    needsStep: boolean;
    error: number;
  }> = [];
  const groupNeedsStep: [boolean, boolean] = [false, false];
  const groupError: [number, number] = [0, 0];
  let steppingGroup: 0 | 1 | null = null;

  for (const leg of boss.legs) {
    if (!leg.alive) continue;
    if (leg.stepProgress >= 1) {
      leg.plantedTime += delta;
      leg.replantLock = Math.max(0, leg.replantLock - delta);
    } else {
      leg.plantedTime = 0;
    }
    const angle = leg.baseAngle + boss.facingAngle;
    const outward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const tangent = new THREE.Vector3(Math.sin(angle + Math.PI * 0.5), 0, Math.cos(angle + Math.PI * 0.5));
    const hip = new THREE.Vector3(
      boss.visualPos.x + outward.x * leg.hipRadius,
      hipY,
      boss.visualPos.z + outward.z * leg.hipRadius,
    );
    const strideLead = (boss.config.strideLead + bodySpeed * 0.2 + turnUrgency * 0.45) * (oneLegMode ? 1.48 : 1.0);
    const plantedTurnBias = leg.stepProgress >= 1 ? (oneLegMode ? 0.2 : 0.42) : 1.0;
    const supportFoot = new THREE.Vector3(
      boss.visualPos.x + outward.x * leg.footRadius
        + tangent.x * turnSign * turnUrgency * boss.config.plantedSway * plantedTurnBias,
      0.05,
      boss.visualPos.z + outward.z * leg.footRadius
        + tangent.z * turnSign * turnUrgency * boss.config.plantedSway * plantedTurnBias,
    );
    const strideFoot = new THREE.Vector3(
      supportFoot.x + moveDir.x * strideLead,
      0.05,
      supportFoot.z + moveDir.z * strideLead,
    );

    if (leg.footPos.lengthSq() === 0) {
      const seededFoot = findSafeFootTarget(boss, hip, supportFoot, outward, tangent, supportFoot);
      leg.footPos.copy(seededFoot);
      leg.footFrom.copy(seededFoot);
      leg.footTo.copy(seededFoot);
    }

    const idealSupportFoot = findSafeFootTarget(boss, hip, supportFoot, outward, tangent, leg.footPos);
    let stepTarget = findSafeFootTarget(boss, hip, strideFoot, outward, tangent, idealSupportFoot);
    const minStride = boss.config.minStrideDistance
      * (1.0 + turnUrgency * 0.25)
      * (oneLegMode ? 1.6 : 1.0);
    if (leg.footPos.lengthSq() > 0 && leg.footPos.distanceTo(stepTarget) < minStride) {
      const strideDir = stepTarget.clone().sub(leg.footPos);
      if (strideDir.lengthSq() < 1e-4) {
        strideDir.copy(outward).addScaledVector(moveDir, 1.1).addScaledVector(tangent, turnSign * 0.35);
      }
      strideDir.normalize().multiplyScalar(minStride);
      stepTarget = findSafeFootTarget(
        boss,
        hip,
        leg.footPos.clone().add(strideDir).setY(0.05),
        outward,
        tangent,
        leg.footPos,
      );
    }

    const error = leg.footPos.distanceTo(idealSupportFoot);
    const replantedRecently = leg.plantedTime < 0.38;
    const triggerThreshold = stepThreshold * (replantedRecently ? 1.85 : 1.12);
    const forcedCatchupThreshold = stepThreshold * 2.35;
    const needsStep = leg.stepProgress >= 1
      && leg.replantLock <= 0
      && error > triggerThreshold
      && (leg.plantedTime > 0.2 || error > forcedCatchupThreshold);
    if (needsStep) groupNeedsStep[leg.gaitGroup] = true;
    groupError[leg.gaitGroup] += error;
    if (leg.stepProgress < 1) steppingGroup = leg.gaitGroup;
    entries.push({ leg, hip, supportFoot: idealSupportFoot, stepTarget, outward, tangent, needsStep, error });
  }

  if (steppingGroup === null) {
    let targetGroup = activeGroup;
    const otherGroup = (1 - targetGroup) as 0 | 1;
    if (
      groupNeedsStep[otherGroup]
      && (!groupNeedsStep[targetGroup] || groupError[otherGroup] > groupError[targetGroup] + 0.35)
    ) {
      targetGroup = otherGroup;
    }
    boss.gaitGroupActive = targetGroup;

    if (groupNeedsStep[targetGroup]) {
      for (const entry of entries) {
        if (entry.leg.gaitGroup !== targetGroup || !entry.needsStep) continue;
        entry.leg.footFrom.copy(entry.leg.footPos);
        entry.leg.footTo.copy(entry.stepTarget);
        entry.leg.stepProgress = 0;
        entry.leg.stepDuration = boss.config.stepDuration * (0.88 + Math.random() * 0.24);
        entry.leg.plantedTime = 0;
      }
      steppingGroup = targetGroup;
    }
  } else {
    boss.gaitGroupActive = steppingGroup;
  }

  const phaseSpeed = phaseSpeedForStep(boss);
  for (const entry of entries) {
    const { leg, hip, stepTarget, outward, tangent, error } = entry;

    if (leg.stepProgress < 1) {
      leg.stepProgress = Math.min(1, leg.stepProgress + delta / Math.max(leg.stepDuration / phaseSpeed, 0.01));
      const t = smoothStep01(leg.stepProgress);
      leg.footPos.set(
        lerp(leg.footFrom.x, leg.footTo.x, t),
        lerp(leg.footFrom.y, leg.footTo.y, t),
        lerp(leg.footFrom.z, leg.footTo.z, t),
      );
      const curve = Math.sin(t * Math.PI);
      leg.footPos.x += tangent.x * leg.kneeSign * curve * 0.34;
      leg.footPos.z += tangent.z * leg.kneeSign * curve * 0.34;
      leg.footPos.y += curve * boss.config.stepHeight * (boss.collapseTimer > 0 ? 0.75 : 1.0);
      if (leg.stepProgress >= 1) {
        leg.footPos.copy(leg.footTo);
        leg.plantedTime = 0;
        leg.replantLock = oneLegMode ? 0.4 : 0.24;
        const phase = getPhaseIndex(boss);
        const intensity = phase === 0 ? 0.72 : phase === 1 ? 0.84 : 1.0;
        playSpiderLegPlantSound(
          `${boss.id}:${leg.baseAngle.toFixed(3)}`,
          intensity,
          { x: leg.footPos.x, z: leg.footPos.z },
        );
      }
    }

    const bendHint = outward.clone().multiplyScalar(1.2)
      .addScaledVector(tangent, 0.8 * leg.kneeSign)
      .addScaledVector(moveDir, 0.45);
    bendHint.y = 0.85 + Math.sin(boss.gaitTime * 2.6 + leg.phaseOffset) * 0.08;
    const knee = solveTwoBoneKnee(
      hip,
      leg.footPos,
      boss.config.legUpperLength,
      boss.config.legLowerLength,
      bendHint,
    );

    leg.group.position.set(0, 0, 0);
    setSegmentFromPoints(leg.upperMesh, hip, knee, 0.16);
    setSegmentFromPoints(leg.lowerMesh, knee, leg.footPos, 0.14);
    leg.kneeMesh.position.copy(knee);
    leg.tipMesh.position.copy(leg.footPos);
    leg.tipMesh.lookAt(knee);
    leg.collidable.pos.x = knee.x * 0.35 + leg.footPos.x * 0.65;
    leg.collidable.pos.z = knee.z * 0.35 + leg.footPos.z * 0.65;
    leg.hpGroup.position.set(leg.footPos.x, 2.45, leg.footPos.z);
  }
}

function phaseSpeedForStep(boss: SpiderReliquaryState): number {
  const phase = getPhaseIndex(boss);
  return phase === 0 ? 1.0 : phase === 1 ? 1.18 : 1.38;
}

function destroySpiderLeg(leg: SpiderLeg): void {
  leg.alive = false;
  untagCollidable(leg.collidable);
  const idx = collidables.indexOf(leg.collidable);
  if (idx !== -1) collidables.splice(idx, 1);
  scene.remove(leg.group);
}

function activateFinalCoreMode(boss: SpiderReliquaryState): void {
  resetSpiderTransientState(boss);
  boss.collidable.rpm = Math.max(boss.collidable.rpm, FINAL_CORE_MIN_RPM);
  // The legged phase used a small footprint and lived outside the physics
  // collidable list (manual `updateSpiderCorePassThroughHits` did the hit
  // detection so the player could run between legs). In spinner mode the
  // body must physically block the player, so register it with physics now
  // and grow the radius to match the visible spinner top.
  boss.collidable.radius = TOP_BASE_RADIUS * FINAL_CORE_TOP_SCALE;
  if (collidables.indexOf(boss.collidable) === -1) {
    collidables.push(boss.collidable);
  }
  boss.finalCoreGraceTimer = FINAL_CORE_TRANSITION_STUN;
  boss.aiState = 'recover';
  boss.recoveryTimer = FINAL_CORE_TRANSITION_STUN;
  boss.webCooldown = 1.8;
  boss.legSlamCooldown = 999;
  boss.stompCooldown = 999;
  boss.pulseCooldown = 999;
}

export function applyDamageToSpiderLeg(
  boss: SpiderReliquaryState,
  leg: SpiderLeg,
  damage: number,
): boolean {
  if (!leg.alive) return false;
  leg.hp = Math.max(0, leg.hp - damage);
  updateHpBar(leg.hpBarFill, leg.hp / leg.maxHp, 0.5);
  if (leg.hp > 0) return false;

  destroySpiderLeg(leg);
  const aliveAfter = getAliveLegCount(boss);
  boss.collapseTimer = Math.max(
    boss.collapseTimer,
    aliveAfter <= boss.config.shieldLegThreshold ? boss.config.collapseDuration : 1.4,
  );
  boss.stompCooldown = Math.min(boss.stompCooldown, 0.6);
  boss.pulseCooldown = Math.min(boss.pulseCooldown, 1.1);
  if (aliveAfter === 0) activateFinalCoreMode(boss);
  return true;
}

export function onSpiderCoreCollision(boss: SpiderReliquaryState): void {
  if (!isFinalCoreMode(boss)) return;
  if (boss.aiState === 'recover') return;
  boss.aiState = 'recover';
  boss.recoveryTimer = getFinalCoreDuelConfig(boss).recoveryTime;
  boss.windupTimer = 0;
  boss.cutInTimer = 0;
  boss.dashCooldown = Math.min(boss.dashCooldown, 0.16);
}

function updateFinalCoreMovement(
  boss: SpiderReliquaryState,
  playerPos: Vec2,
  playerRadius: number,
  playerWebbed: boolean,
  delta: number,
): void {
  const cfg = getFinalCoreDuelConfig(boss);
  const body = boss.collidable;
  const dx = playerPos.x - body.pos.x;
  const dz = playerPos.z - body.pos.z;
  const dist = Math.hypot(dx, dz);
  const dirX = dist > 0.001 ? dx / dist : 0;
  const dirZ = dist > 0.001 ? dz / dist : 1;
  const combinedRadius = body.radius + playerRadius;

  setMovementMaxSpeed(boss.id, boss.aiState === 'dash' ? cfg.maxSpeed * cfg.dashSpeedMult : cfg.maxSpeed);
  boss.dashCooldown = Math.max(0, boss.dashCooldown - delta);
  tickSpinnerOrbitFlip(boss, cfg, delta);

  if (boss.aiState === 'recover') {
    boss.recoveryTimer = Math.max(0, boss.recoveryTimer - delta);
    body.vel.x *= 0.95;
    body.vel.z *= 0.95;
    if (boss.recoveryTimer <= 0) {
      boss.aiState = 'orbit';
      boss.windupTimer = 0;
      boss.cutInTimer = 0;
      setMovementMaxSpeed(boss.id, cfg.maxSpeed);
      resetSpinnerOrbitTimer(boss, cfg);
    }
    applySpinnerWallAvoidance(boss, body, cfg, delta);
    return;
  }

  if (boss.aiState === 'windup') {
    boss.windupTimer -= delta;
    body.vel.x *= Math.max(0, 1 - delta * 12);
    body.vel.z *= Math.max(0, 1 - delta * 12);
    if (boss.windupTimer <= 0) beginSpinnerBurst(boss, body, cfg, setMovementMaxSpeed);
    applySpinnerWallAvoidance(boss, body, cfg, delta);
    return;
  }

  if (boss.aiState === 'dash') {
    if (updateSpinnerDashState(boss, body, playerPos, combinedRadius, cfg, delta, {
      accelMultiplier: 1.46,
      retainedForwardRatio: 0.9,
      closeEnoughPadding: 0.32,
    })) {
      boss.aiState = 'orbit';
      setMovementMaxSpeed(boss.id, cfg.maxSpeed);
      resetSpinnerOrbitTimer(boss, cfg);
    }
    applySpinnerWallAvoidance(boss, body, cfg, delta);
    return;
  }

  boss.aiState = 'orbit';
  const desiredRange = playerWebbed ? cfg.orbitRange * 0.72 : cfg.orbitRange;
  const shouldCutIn = dist <= desiredRange * 1.7
    && dist >= combinedRadius + 0.36
    && boss.dashCooldown <= 0;
  if (shouldCutIn) {
    boss.dashCooldown = cfg.cutInCooldown;
    beginSpinnerWindup(boss, body, cfg, setMovementMaxSpeed, dirX, dirZ, 0.24);
  } else {
    steerSpinnerOrbit(boss, body, playerPos, combinedRadius, {
      orbitRange: desiredRange,
      orbitStrafeStrength: cfg.orbitStrafeStrength,
      acceleration: cfg.acceleration,
    }, delta, false, {
      closePushDistance: 0.55,
      closePushStrength: -0.45,
    });
  }

  applySpinnerWallAvoidance(boss, body, cfg, delta);
}

export function updateSpiderReliquaryAI(
  boss: SpiderReliquaryState,
  playerPos: Vec2,
  playerRadius: number,
  playerWebbed: boolean,
  delta: number,
): SpiderReliquaryAttackEvent[] {
  if (!boss.alive) return [];
  if (!boss.awakened) return [];

  const phase = getPhaseIndex(boss);
  const finalCoreMode = isFinalCoreMode(boss);
  const aliveLegs = boss.legs.filter((leg) => leg.alive);
  const oneLegMode = aliveLegs.length === 1;
  const stability = clamp(aliveLegs.length / boss.config.legCount, 0.35, 1.0);
  const maxSpeed = finalCoreMode
    ? getFinalCoreDuelConfig(boss).maxSpeed
    : oneLegMode
      ? boss.config.coreMaxSpeed[phase] * 1.5
      : boss.config.coreMaxSpeed[phase] * (0.6 + stability * 0.4);
  setMovementMaxSpeed(boss.id, maxSpeed);

  boss.gaitTime += delta;
  boss.collapseTimer = Math.max(0, boss.collapseTimer - delta);
  boss.stompCooldown = Math.max(0, boss.stompCooldown - delta);
  boss.pulseCooldown = Math.max(0, boss.pulseCooldown - delta);
  boss.legSlamCooldown = Math.max(0, boss.legSlamCooldown - delta);
  boss.webCooldown = Math.max(0, boss.webCooldown - delta);
  boss.acidCooldown = Math.max(0, boss.acidCooldown - delta);
  boss.finalCoreGraceTimer = Math.max(0, boss.finalCoreGraceTimer - delta);
  boss.webTetherTimer = Math.max(0, boss.webTetherTimer - delta);
  boss.corePassThroughCooldown = Math.max(0, boss.corePassThroughCooldown - delta);
  boss.oneLegHopWindup = Math.max(0, boss.oneLegHopWindup - delta);
  boss.oneLegHopAir = Math.max(0, boss.oneLegHopAir - delta);
  boss.oneLegHopRecover = Math.max(0, boss.oneLegHopRecover - delta);

  const body = boss.collidable;
  const dx = playerPos.x - body.pos.x;
  const dz = playerPos.z - body.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  boss.webTetherTarget.set(playerPos.x, 0.72, playerPos.z);
  const targetAngle = Math.atan2(dx, dz);
  const facingDelta = wrapAngle(targetAngle - boss.facingAngle) * Math.min(3.4 * delta, 1.0);
  boss.facingAngle += facingDelta;
  boss.turnRate = lerp(boss.turnRate, facingDelta / Math.max(delta, 1e-4), Math.min(8 * delta, 1));
  const activeRam = boss.attacks.find((attack) => attack.kind === 'leg_slam');
  const isRamming = activeRam !== undefined;

  if (finalCoreMode) {
    updateFinalCoreMovement(boss, playerPos, playerRadius, playerWebbed, delta);
  } else if (activeRam) {
    const ramAngleDelta = wrapAngle(activeRam.facingAngle - boss.facingAngle);
    boss.facingAngle += ramAngleDelta * Math.min(10 * delta, 1.0);
    const forwardX = Math.sin(activeRam.facingAngle);
    const forwardZ = Math.cos(activeRam.facingAngle);
    const currentSpeed = Math.hypot(body.vel.x, body.vel.z);
    if (activeRam.elapsed < activeRam.windup) {
      const recoilSpeed = Math.min(1.8, 0.7 + currentSpeed * 0.08);
      body.vel.x = lerp(body.vel.x, -forwardX * recoilSpeed, Math.min(10 * delta, 1));
      body.vel.z = lerp(body.vel.z, -forwardZ * recoilSpeed, Math.min(10 * delta, 1));
    } else if (!activeRam.didLunge) {
      const lungeSpeed = boss.config.coreMaxSpeed[phase] * (oneLegMode ? 1.2 : 1.08) + 4.2;
      body.vel.x = forwardX * lungeSpeed;
      body.vel.z = forwardZ * lungeSpeed;
      activeRam.didLunge = true;
    } else {
      const recoverT = clamp((activeRam.elapsed - activeRam.windup) / Math.max(activeRam.recover, 0.001), 0, 1);
      const recoverDamp = lerp(0.96, 0.84, recoverT);
      body.vel.x *= recoverDamp;
      body.vel.z *= recoverDamp;
    }
  } else if (oneLegMode) {
    const nx = dx / dist;
    const nz = dz / dist;
    const sidewaysX = -nz;
    const sidewaysZ = nx;

    if (boss.oneLegHopAir > 0) {
      if (boss.oneLegHopAir <= delta) {
        body.vel.x *= 0.86;
        body.vel.z *= 0.86;
        boss.oneLegHopRecover = ONE_LEG_HOP_RECOVER;
      } else {
        body.vel.x *= 0.995;
        body.vel.z *= 0.995;
      }
    } else if (boss.oneLegHopWindup > 0) {
      body.vel.x *= 0.55;
      body.vel.z *= 0.55;
      if (boss.oneLegHopWindup <= delta) {
        let dirX = nx;
        let dirZ = nz;
        const orbitSign = Math.sin(boss.gaitTime * 1.15) >= 0 ? 1 : -1;
        if (dist < 2.8) {
          dirX = nx * 0.94 + sidewaysX * orbitSign * 0.18;
          dirZ = nz * 0.94 + sidewaysZ * orbitSign * 0.18;
        } else if (dist < 5.4) {
          dirX += sidewaysX * orbitSign * 0.12;
          dirZ += sidewaysZ * orbitSign * 0.12;
        }
        const dirLen = Math.hypot(dirX, dirZ) || 1;
        dirX /= dirLen;
        dirZ /= dirLen;

        const hopSpeed = boss.config.coreMaxSpeed[phase] * (phase === 2 ? 1.55 : 1.35) + 2.4;
        body.vel.x = dirX * hopSpeed;
        body.vel.z = dirZ * hopSpeed;
        boss.oneLegHopDirX = dirX;
        boss.oneLegHopDirZ = dirZ;
        boss.oneLegHopAir = ONE_LEG_HOP_AIR;
        boss.oneLegHopRecover = 0;
      }
    } else {
      const recoveryDrag = boss.oneLegHopRecover > 0 ? 0.9 : 0.94;
      body.vel.x *= recoveryDrag;
      body.vel.z *= recoveryDrag;
      const desiredRange = 3.8;
      const shouldHop = dist > desiredRange
        || Math.abs(boss.turnRate) > 0.65
        || boss.collapseTimer > 0.12;
      if (boss.oneLegHopRecover <= 0 && shouldHop) {
        boss.oneLegHopWindup = ONE_LEG_HOP_WINDUP;
      }
    }
  } else if (boss.collapseTimer > 0) {
    body.vel.x *= 0.84;
    body.vel.z *= 0.84;
  } else {
    const accel = boss.config.coreAcceleration[phase];
    const nx = dx / dist;
    const nz = dz / dist;
    const desiredRange = playerWebbed
      ? 3.1
      : phase === 0 ? 6.0 : phase === 1 ? 5.4 : 4.8;
    const orbitDir = Math.sin(boss.gaitTime * 1.25) >= 0 ? 1 : -1;
    const ramSetupRange = boss.config.legSlamTriggerRange + playerRadius + 0.65;
    const shouldBraceForRam = dist <= ramSetupRange && boss.legSlamCooldown <= 0.22;

    if (dist > desiredRange) {
      body.vel.x += nx * accel * delta;
      body.vel.z += nz * accel * delta;
    } else if (shouldBraceForRam) {
      body.vel.x *= 0.82;
      body.vel.z *= 0.82;
      body.vel.x += nx * accel * 0.22 * delta;
      body.vel.z += nz * accel * 0.22 * delta;
    } else {
      const orbitStrength = phase === 0 ? 0.36 : 0.46;
      const inwardDamp = phase === 0 ? 0.1 : 0.14;
      body.vel.x += (-nz * orbitDir) * accel * orbitStrength * delta;
      body.vel.z += (nx * orbitDir) * accel * orbitStrength * delta;
      body.vel.x -= nx * accel * inwardDamp * delta;
      body.vel.z -= nz * accel * inwardDamp * delta;
    }

    const bounds = getArenaBounds();
    const minX = bounds.minX + 4.0;
    const maxX = bounds.maxX - 4.0;
    const minZ = bounds.minZ + 4.0;
    const maxZ = bounds.maxZ - 4.0;
    if (body.pos.x > maxX) body.vel.x -= accel * delta * 0.7;
    if (body.pos.x < minX) body.vel.x += accel * delta * 0.7;
    if (body.pos.z > maxZ) body.vel.z -= accel * delta * 0.7;
    if (body.pos.z < minZ) body.vel.z += accel * delta * 0.7;
  }

  if (!finalCoreMode && !isRamming && dist <= boss.config.legSlamTriggerRange + playerRadius && boss.legSlamCooldown <= 0) {
    scheduleLegSlam(boss, targetAngle, phase);
    boss.legSlamCooldown = boss.config.legSlamCooldown[phase];
    boss.webCooldown = Math.max(boss.webCooldown, 0.9);
    boss.acidCooldown = Math.max(boss.acidCooldown, 0.7);
  }

  if (aliveLegs.length > 0 && boss.stompCooldown <= 0) {
    const stompCount = phase === 0 ? 1 : phase === 1 ? 2 : Math.min(3, aliveLegs.length);
    const sideways = { x: -dz / dist, z: dx / dist };
    for (let i = 0; i < stompCount; i++) {
      const centerOffset = i - (stompCount - 1) * 0.5;
      const target = {
        x: playerPos.x + sideways.x * centerOffset * boss.config.stompRadius * 1.3 + (Math.random() - 0.5) * 0.4,
        z: playerPos.z + sideways.z * centerOffset * boss.config.stompRadius * 1.3 + (Math.random() - 0.5) * 0.4,
      };
      scheduleStomp(boss, target, phase);
    }
    boss.legCycleCursor = (boss.legCycleCursor + 1) % Math.max(1, aliveLegs.length);
    boss.stompCooldown = boss.config.stompCooldown[phase];
  }

  if (!finalCoreMode && boss.pulseCooldown <= 0 && boss.collapseTimer <= 0.15) {
    schedulePulse(boss, phase);
    boss.pulseCooldown = boss.config.pulseCooldown[phase];
  }

  const events: SpiderReliquaryAttackEvent[] = [];

  if (
    boss.webCooldown <= 0
    && boss.webTetherTimer <= 0
    && !playerWebbed
    && (!isRamming || finalCoreMode)
    && (finalCoreMode || boss.collapseTimer <= 0.15)
    && (!finalCoreMode || boss.aiState === 'orbit')
    && dist >= (finalCoreMode ? 5.2 : 4.6)
    && dist <= boss.config.webRange[phase]
  ) {
    scheduleWebShot(boss, playerPos, playerRadius, phase);
    boss.webCooldown = finalCoreMode
      ? FINAL_CORE_WEB_COOLDOWN
      : boss.config.webCooldown[phase];
    if (finalCoreMode) {
      boss.dashCooldown = Math.max(boss.dashCooldown, 0.12);
    } else {
      boss.legSlamCooldown = Math.max(boss.legSlamCooldown, 0.35);
      boss.pulseCooldown = Math.max(boss.pulseCooldown, 0.55);
    }
  }

  // // Acid ball — direct-fire flying projectile. Distinct from web (ground AOE)
  // // and from laser-style turret bolts. Fires from above the body toward the
  // // player when off cooldown and the player is in range.
  // if (
  //   boss.acidCooldown <= 0
  //   && !isRamming
  //   && (finalCoreMode || boss.collapseTimer <= 0.15)
  //   && dist >= 3.0
  //   && dist <= 24
  // ) {
  //   const launchHeight = finalCoreMode ? 0.95 : 1.85;
  //   const inv = 1 / Math.max(dist, 0.0001);
  //   const fireDir: Vec2 = { x: dx * inv, z: dz * inv };
  //   const firePos: Vec2 = {
  //     x: boss.collidable.pos.x + fireDir.x * 0.7,
  //     z: boss.collidable.pos.z + fireDir.z * 0.7,
  //   };
  //   events.push({
  //     kind: 'acid',
  //     point: { x: firePos.x, y: launchHeight, z: firePos.z },
  //     radius: 0,
  //     damage: boss.config.acidDamage[phase],
  //     hitPlayer: false,
  //     firePos,
  //     fireDir,
  //     speed: boss.config.acidSpeed[phase],
  //   });
  //   boss.acidCooldown = boss.config.acidCooldown[phase];
  // }
  for (let i = boss.attacks.length - 1; i >= 0; i--) {
    const attack = boss.attacks[i];
    attack.elapsed += delta;
    const progress = clamp(attack.elapsed / attack.windup, 0, 1);
    if (attack.kind === 'pulse') {
      attack.mesh.position.x = boss.collidable.pos.x;
      attack.mesh.position.z = boss.collidable.pos.z;
    } else if (attack.kind === 'leg_slam') {
      const lungeDistance = boss.config.legSlamLungeDistance;
      attack.point.x = clamp(
        boss.collidable.pos.x + Math.sin(attack.facingAngle) * lungeDistance,
        getArenaBounds().minX + attack.radius + 0.35,
        getArenaBounds().maxX - attack.radius - 0.35,
      );
      attack.point.z = clamp(
        boss.collidable.pos.z + Math.cos(attack.facingAngle) * lungeDistance,
        getArenaBounds().minZ + attack.radius + 0.35,
        getArenaBounds().maxZ - attack.radius - 0.35,
      );
      attack.mesh.position.x = attack.point.x;
      attack.mesh.position.z = attack.point.z;
    } else {
      attack.mesh.position.x = attack.point.x;
      attack.mesh.position.z = attack.point.z;
    }

    const scaleBoost = attack.kind === 'pulse'
      ? 0.84 + progress * 0.34
      : attack.kind === 'leg_slam'
        ? 0.78 + progress * 0.46
        : attack.kind === 'web'
          ? 0.72 + progress * 0.2
        : 0.92 + progress * 0.12;
    attack.mesh.scale.set(attack.radius * scaleBoost, attack.radius * scaleBoost, 1);

    const material = attack.mesh.material as THREE.MeshBasicMaterial;
    material.opacity = attack.kind === 'pulse'
      ? 0.1 + progress * 0.22
      : attack.kind === 'leg_slam'
        ? 0.12 + progress * 0.3
        : attack.kind === 'web'
          ? 0.08 + progress * 0.2
        : 0.15 + progress * 0.28;

    if (!attack.hitResolved && attack.elapsed >= attack.windup) {
      const point = attack.kind === 'pulse'
        ? { x: boss.collidable.pos.x, z: boss.collidable.pos.z }
        : attack.kind === 'leg_slam'
          ? {
            x: boss.collidable.pos.x + Math.sin(attack.facingAngle) * (oneLegMode ? 0.9 : 1.1),
            z: boss.collidable.pos.z + Math.cos(attack.facingAngle) * (oneLegMode ? 0.9 : 1.1),
          }
          : attack.point;
      const hitRadius = attack.kind === 'leg_slam'
        ? attack.radius * (oneLegMode ? 1.55 : 1.15)
        : attack.radius;
      const distToPlayer = Math.hypot(playerPos.x - point.x, playerPos.z - point.z);
      events.push({
        kind: attack.kind,
        point: { x: point.x, y: attack.kind === 'leg_slam' ? 0.34 : attack.kind === 'web' ? 0.72 : 0.18, z: point.z },
        radius: hitRadius,
        damage: attack.damage,
        hitPlayer: distToPlayer <= hitRadius + playerRadius,
        knockback: attack.kind === 'leg_slam' ? (phase === 2 ? 39 : 31.5) : undefined,
        webDuration: attack.kind === 'web' ? boss.config.webDuration[phase] : undefined,
      });
      attack.hitResolved = true;
      if (attack.kind !== 'leg_slam') {
        removeAttack(attack);
        boss.attacks.splice(i, 1);
        continue;
      }
    }

    if (attack.kind === 'leg_slam') {
      const fadeT = clamp((attack.elapsed - attack.windup) / Math.max(attack.recover, 0.001), 0, 1);
      material.opacity = attack.hitResolved
        ? lerp(0.34, 0.02, fadeT)
        : 0.12 + progress * 0.3;
      if (attack.hitResolved && attack.elapsed >= attack.windup + attack.recover) {
        removeAttack(attack);
        boss.attacks.splice(i, 1);
      }
      continue;
    }
  }

  return events;
}

export function updateSpiderReliquaryVisuals(
  boss: SpiderReliquaryState,
  time: number,
  delta: number,
): void {
  if (!boss.alive) return;

  const phase = getPhaseIndex(boss);
  const body = boss.collidable;
  const rpmFrac = body.rpm / boss.config.coreRpmCapacity;
  const aliveLegs = getAliveLegCount(boss);
  const finalCoreMode = aliveLegs === 0;
  const oneLegMode = aliveLegs === 1;
  const collapseFrac = clamp(boss.collapseTimer / boss.config.collapseDuration, 0, 1);

  boss.bodyGroup.position.set(boss.visualPos.x, 0, boss.visualPos.z);
  boss.hpGroup.position.set(boss.visualPos.x, 0, boss.visualPos.z);
  boss.bodyGroup.rotation.y = boss.facingAngle;
  updateHpBar(boss.hpBarFill, rpmFrac, 1.0);

  let deadBiasX = 0;
  let deadBiasZ = 0;
  let supportX = 0;
  let supportZ = 0;
  let supportCount = 0;
  let steppingCount = 0;
  let averageFootLift = 0;
  for (const leg of boss.legs) {
    if (!leg.alive) {
      deadBiasX += Math.sin(leg.baseAngle + boss.facingAngle);
      deadBiasZ += Math.cos(leg.baseAngle + boss.facingAngle);
      continue;
    }
    supportX += leg.footPos.x;
    supportZ += leg.footPos.z;
    supportCount += 1;
    averageFootLift += leg.footPos.y;
    if (leg.stepProgress < 1) steppingCount += 1;
  }
  const supportBiasX = supportCount > 0 ? supportX / supportCount - body.pos.x : 0;
  const supportBiasZ = supportCount > 0 ? supportZ / supportCount - body.pos.z : 0;
  const supportInstability = steppingCount / Math.max(1, supportCount);
  const meanFootLift = supportCount > 0 ? averageFootLift / supportCount : 0;
  const strideLift = clamp(meanFootLift / Math.max(boss.config.stepHeight, 0.001), 0, 1);
  const hopCrouch = oneLegMode
    ? smoothStep01(clamp(boss.oneLegHopWindup / ONE_LEG_HOP_WINDUP, 0, 1))
    : 0;
  const hopAirProgress = oneLegMode && boss.oneLegHopAir > 0
    ? 1 - clamp(boss.oneLegHopAir / ONE_LEG_HOP_AIR, 0, 1)
    : 0;
  const hopArc = oneLegMode ? Math.sin(hopAirProgress * Math.PI) : 0;
  const hopRecover = oneLegMode
    ? clamp(boss.oneLegHopRecover / ONE_LEG_HOP_RECOVER, 0, 1)
    : 0;
  const activeRam = boss.attacks.find((attack) => attack.kind === 'leg_slam');
  const ramWindup = activeRam && activeRam.elapsed < activeRam.windup
    ? smoothStep01(clamp(activeRam.elapsed / activeRam.windup, 0, 1))
    : 0;
  const ramRecoverT = activeRam && activeRam.hitResolved
    ? clamp((activeRam.elapsed - activeRam.windup) / Math.max(activeRam.recover, 0.001), 0, 1)
    : 0;
  const ramLunge = activeRam && activeRam.hitResolved
    ? Math.sin((1 - ramRecoverT) * Math.PI * 0.5)
    : 0;

  const wobble = Math.sin(time * (phase === 2 ? 9 : 5)) * 0.04;
  const gaitBob = Math.sin(boss.gaitTime * 2.1) * (0.065 + supportInstability * 0.04);
  const bodySpeed = Math.hypot(body.vel.x, body.vel.z);
  if (finalCoreMode) {
    const moveX = bodySpeed > 0.01 ? body.vel.x / bodySpeed : 0;
    const moveZ = bodySpeed > 0.01 ? body.vel.z / bodySpeed : 0;
    const dashLean = boss.aiState === 'dash' ? 0.18 : boss.aiState === 'windup' ? -0.08 : 0;
    boss.bodyRoot.position.y = 0.62 + gaitBob * 0.35 + wobble * 0.7;
    boss.bodyRoot.position.z = dashLean;
    const desiredRoll = -moveX * 0.18 + wobble * 0.4;
    const desiredPitch = moveZ * 0.16 + dashLean * 0.35;
    boss.bodyRoot.rotation.z += (desiredRoll - boss.bodyRoot.rotation.z) * Math.min(6.8 * delta, 1);
    boss.bodyRoot.rotation.x += (desiredPitch - boss.bodyRoot.rotation.x) * Math.min(6.8 * delta, 1);
    boss.bodyRoot.scale.setScalar(boss.config.bodyScale * 0.92);
  } else {
    boss.bodyRoot.position.y = 0.9
      - collapseFrac * 0.32
      - supportInstability * 0.08
      + strideLift * 0.24
      - hopCrouch * 0.22
      + hopArc * 0.82
      - hopRecover * 0.04
      - ramWindup * 0.1
      + ramLunge * 0.08
      + gaitBob
      + wobble;
    boss.bodyRoot.position.z = -ramWindup * 0.6 + ramLunge * 1.15;
    const hopLean = hopArc * 0.34 - hopCrouch * 0.1;
    const desiredRoll = deadBiasX * 0.16
      - supportBiasX * 0.11
      + collapseFrac * 0.24 * Math.sin(time * 8)
      + boss.oneLegHopDirX * hopLean;
    const desiredPitch = -deadBiasZ * 0.16
      + supportBiasZ * 0.11
      + collapseFrac * 0.18 * Math.cos(time * 7)
      - boss.oneLegHopDirZ * hopLean
      - ramWindup * 0.12
      + ramLunge * 0.28;
    boss.bodyRoot.rotation.z += (desiredRoll - boss.bodyRoot.rotation.z) * Math.min(4.8 * delta, 1);
    boss.bodyRoot.rotation.x += (desiredPitch - boss.bodyRoot.rotation.x) * Math.min(4.8 * delta, 1);
    boss.bodyRoot.scale.setScalar(boss.config.bodyScale);
  }
  boss.pedestalMesh.visible = !finalCoreMode;
  boss.shellMesh.visible = !finalCoreMode;
  boss.coreMesh.visible = !finalCoreMode;
  boss.haloMesh.visible = !finalCoreMode;
  boss.coreMesh.position.y = 1.86;
  boss.haloMesh.position.y = 2.0;
  boss.haloMesh.rotation.z += delta * (phase === 2 ? 1.8 : 0.8);
  boss.haloMesh.rotation.x = Math.PI / 2 + wobble * 0.6;
  boss.coreMesh.rotation.y += delta * (phase === 2 ? 2.4 : 1.2);
  boss.coreMesh.rotation.x += delta * 0.7;
  boss.coreMesh.scale.setScalar(1);
  boss.haloMesh.scale.setScalar(1);
  boss.coreTop.tiltGroup.visible = finalCoreMode;

  const shielded = canDamageSpiderCore(boss) === false;
  boss.shieldMesh.visible = shielded && !finalCoreMode;
  if (shielded) {
    const pulse = 0.16 + 0.06 * Math.sin(time * 5.2);
    const mat = boss.shieldMesh.material as THREE.MeshStandardMaterial;
    mat.opacity = pulse;
    mat.emissiveIntensity = 0.35 + pulse * 1.1;
    boss.shieldMesh.rotation.y += delta * 0.45;
  }

  const coreMat = boss.coreMesh.material as THREE.MeshStandardMaterial;
  const glow = (1 - rpmFrac) * 0.9 + collapseFrac * 1.3 + (phase === 2 ? 0.45 : 0.1) + (finalCoreMode ? 0.7 : 0);
  coreMat.emissive.setRGB(1.0, finalCoreMode ? 0.62 : 0.4 + phase * 0.08, 0.08);
  coreMat.emissiveIntensity = glow;
  coreMat.color.setRGB(1.0, finalCoreMode ? 0.78 : 0.6 + phase * 0.08, finalCoreMode ? 0.18 : 0.25);

  const haloMat = boss.haloMesh.material as THREE.MeshStandardMaterial;
  haloMat.emissiveIntensity = finalCoreMode ? 1.0 + (boss.aiState === 'dash' ? 0.35 : 0) : shielded ? 0.35 : 0.65 + collapseFrac * 0.6;
  haloMat.color.set(finalCoreMode ? 0xff8f32 : aliveLegs <= boss.config.shieldLegThreshold ? 0xe89c42 : 0xd7ae5c);

  if (finalCoreMode) {
    const finalCfg = getFinalCoreDuelConfig(boss);
    const spinFrac = clamp(0.82 + bodySpeed / Math.max(finalCfg.maxSpeed, 0.001) * 0.38 + (boss.aiState === 'dash' ? 0.18 : 0), 0.7, 1.3);
    updateSpinnerVisuals(boss, {
      vel: body.vel,
      maxSpeed: finalCfg.maxSpeed,
      spinSpeed: FINAL_CORE_SPIN_SPEED,
      rpmFrac,
      spinFrac,
      baseColor: boss.coreTopBaseColor,
      tiltGroup: boss.coreTop.tiltGroup,
      spinGroup: boss.coreTop.spinGroup,
      bodyMat: boss.coreTop.bodyMat,
      motionVisuals: boss.coreTop.motionVisuals,
    }, time, delta);
    if (boss.aiState === 'windup') {
      const pulse = 0.55 + 0.45 * Math.sin(time * 8 * Math.PI * 2);
      boss.coreTop.bodyMat.emissive.setRGB(1.0, 0.46, 0.14);
      boss.coreTop.bodyMat.emissiveIntensity = 0.38 + pulse * 0.22;
    } else if (boss.aiState === 'dash') {
      const pulse = 0.62 + 0.38 * Math.sin(time * 11 * Math.PI * 2);
      boss.coreTop.bodyMat.emissive.setRGB(1.0, 0.54, 0.16);
      boss.coreTop.bodyMat.emissiveIntensity = 0.5 + pulse * 0.3;
    } else {
      boss.coreTop.bodyMat.emissive.setRGB(0.32, 0.1, 0.02);
      boss.coreTop.bodyMat.emissiveIntensity = 0.22 + (1 - rpmFrac) * 0.12;
    }
  } else {
    boss.coreTop.bodyMat.emissiveIntensity = 0;
  }

  const webStrength = boss.webTetherDuration > 0
    ? clamp(boss.webTetherTimer / boss.webTetherDuration, 0, 1)
    : 0;
  if (webStrength <= 0.001) {
    setWebTetherVisible(boss, false);
    return;
  }

  setWebTetherVisible(boss, true);
  boss.webTetherGroup.position.set(0, 0, 0);
  const anchor = new THREE.Vector3(
    boss.visualPos.x + Math.sin(boss.facingAngle) * 0.58,
    1.98,
    boss.visualPos.z + Math.cos(boss.facingAngle) * 0.58,
  );
  const target = boss.webTetherTarget.clone();
  target.y = 0.72;
  const dir = new THREE.Vector3().subVectors(target, anchor);
  const len = Math.max(dir.length(), 0.001);
  const forward = dir.clone().normalize();
  const sideways = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
  const controlPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= boss.webTetherNodes.length - 1; i++) {
    const t = i / Math.max(1, boss.webTetherNodes.length - 1);
    const point = anchor.clone().lerp(target, t);
    const sag = Math.sin(t * Math.PI) * (0.28 + len * 0.035);
    const sway = Math.sin(time * 12 + i * 0.85) * (0.035 + 0.02 * webStrength) * (1 - Math.abs(t - 0.5) * 0.7);
    point.y -= sag;
    point.addScaledVector(sideways, sway);
    controlPoints.push(point);
  }

  for (let i = 0; i < boss.webTetherSegments.length; i++) {
    const seg = boss.webTetherSegments[i];
    const start = controlPoints[i];
    const end = controlPoints[i + 1];
    setSegmentFromPoints(seg, start, end, 0.07 - i * 0.002);
    const segMat = seg.material as THREE.MeshStandardMaterial;
    segMat.opacity = 0.35 + webStrength * 0.5;
    segMat.emissiveIntensity = 0.22 + webStrength * 0.35;
  }

  for (let i = 0; i < boss.webTetherNodes.length; i++) {
    const node = boss.webTetherNodes[i];
    node.position.copy(controlPoints[i]);
    const pulse = 0.86 + 0.14 * Math.sin(time * 10 + i * 0.6);
    const scale = i === 0 ? 1.25 : 0.85 + pulse * 0.2;
    node.scale.setScalar(scale);
    const nodeMat = node.material as THREE.MeshStandardMaterial;
    nodeMat.opacity = 0.42 + webStrength * 0.48;
    nodeMat.emissiveIntensity = 0.3 + webStrength * 0.4;
  }
}

export function isSpiderReliquaryDead(boss: SpiderReliquaryState): boolean {
  return boss.alive && boss.collidable.rpm <= 0;
}

export function destroySpiderReliquary(boss: SpiderReliquaryState): void {
  boss.alive = false;
  deregisterEntity(boss.id);
  untagCollidable(boss.collidable);
  if (boss.coreTop.motionVisuals) {
    releaseAuraLight(boss.coreTop.motionVisuals.auraLight);
  }
  const coreIdx = collidables.indexOf(boss.collidable);
  if (coreIdx !== -1) collidables.splice(coreIdx, 1);
  for (const projectile of boss.webProjectiles) {
    projectile.alive = false;
    scene.remove(projectile.mesh);
    releaseProjectileResources(projectile);
  }
  for (const projectile of boss.acidProjectiles) {
    projectile.alive = false;
    scene.remove(projectile.mesh);
    releaseProjectileResources(projectile);
  }

  scene.remove(boss.bodyGroup);
  scene.remove(boss.hpGroup);
  scene.remove(boss.webTetherGroup);

  for (const attack of boss.attacks) removeAttack(attack);
  boss.attacks.length = 0;
  for (const seg of boss.webTetherSegments) {
    seg.geometry.dispose();
    if (seg.material instanceof THREE.Material) seg.material.dispose();
  }
  for (const node of boss.webTetherNodes) {
    node.geometry.dispose();
    if (node.material instanceof THREE.Material) node.material.dispose();
  }

  for (const leg of boss.legs) {
    if (!leg.alive) continue;
    destroySpiderLeg(leg);
  }
}
