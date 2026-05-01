import * as THREE from 'three';
import { registerRefractionMesh, scene, unregisterRefractionMesh } from './renderer';
import { collidables, type Collidable, type Segment, type Vec2 } from './physics';
import { createHpBar, updateHpBar } from './hpBar';
import { getArenaBounds } from './arena';
import { createLaserGlowMaterial, createLaserRefractionMaterial } from './laserBeamMaterials';
import {
  nextEntityId,
  registerMovement,
  registerRpm,
  tagCollidable,
  untagCollidable,
  deregisterEntity,
  setMovementMaxSpeed,
} from './systems';

export interface OctobossConfig {
  coreRpmCapacity: number;
  coreRadius: number;
  coreMass: number;
  coreMaxSpeed: [number, number, number];
  coreAcceleration: [number, number, number];
  desiredRange: [number, number, number];
  coilDuration: [number, number, number];
  extendDuration: [number, number, number];
  chaseDuration: [number, number, number];
  retractDuration: [number, number, number];
  coiledReachScale: number;
  chaseReachScale: number;
  coiledThicknessScale: number;
  chaseThicknessScale: number;
  bodyScale: number;
  hoverHeight: number;
  hoverBobAmp: number;
  hoverBobSpeed: number;
  tentacleSegmentCount: number;
  tentacleSegmentLength: number;
  tentacleThickness: number;
  tentacleSocketSpread: number;
  tentacleSocketForward: number;
  tentacleSocketHeight: number;
  tentacleIdleReach: number;
  tentacleIdleSway: number;
  tentacleArchHeight: number;
  tentacleReachSlack: number;
  tipRadius: number;
  tipMass: number;
  tipDamage: [number, number, number];
  jabWindup: [number, number, number];
  jabCommit: [number, number, number];
  jabRecover: [number, number, number];
  sweepWindup: [number, number, number];
  sweepCommit: [number, number, number];
  sweepRecover: [number, number, number];
  sweepRadius: [number, number, number];
  doubleWindup: [number, number, number];
  doubleCommit: [number, number, number];
  doubleRecover: [number, number, number];
  exposeDuration: [number, number, number];
  attackCooldown: [number, number, number];
  eyeLaserRange: number;
  eyeLaserWidth: [number, number, number];
  eyeLaserDamagePerSecond: [number, number, number];
  eyeLaserWindup: [number, number, number];
  eyeLaserDuration: [number, number, number];
  eyeLaserCooldown: [number, number, number];
  color: number;
}

export const OCTOBOSS_TIER_1: OctobossConfig = {
  coreRpmCapacity: 680,
  coreRadius: 2.0,
  coreMass: 9.6,
  coreMaxSpeed: [6.4, 7.3, 8.6],
  coreAcceleration: [14.5, 17.0, 20.0],
  desiredRange: [10.8, 9.6, 8.2],
  coilDuration: [2.75, 2.25, 1.85],
  extendDuration: [0.7, 0.58, 0.46],
  chaseDuration: [3.4, 3.0, 2.5],
  retractDuration: [1.65, 1.35, 1.1],
  coiledReachScale: 0.16,
  chaseReachScale: 1.0,
  coiledThicknessScale: 0.58,
  chaseThicknessScale: 1.08,
  bodyScale: 1.84,
  hoverHeight: 0.9,
  hoverBobAmp: 0.18,
  hoverBobSpeed: 2.6,
  tentacleSegmentCount: 24,
  tentacleSegmentLength: 1.96,
  tentacleThickness: 0.42,
  tentacleSocketSpread: 1.9,
  tentacleSocketForward: 0.42,
  tentacleSocketHeight: 3.05,
  tentacleIdleReach: 16.5,
  tentacleIdleSway: 1.25,
  tentacleArchHeight: 1.6,
  tentacleReachSlack: 0.72,
  tipRadius: 1.12,
  tipMass: 6.4,
  tipDamage: [24, 31, 40],
  jabWindup: [0.34, 0.28, 0.22],
  jabCommit: [0.22, 0.19, 0.16],
  jabRecover: [0.42, 0.36, 0.3],
  sweepWindup: [0.42, 0.34, 0.28],
  sweepCommit: [0.42, 0.36, 0.3],
  sweepRecover: [0.46, 0.38, 0.32],
  sweepRadius: [2.2, 2.6, 3.0],
  doubleWindup: [0.52, 0.44, 0.36],
  doubleCommit: [0.28, 0.24, 0.2],
  doubleRecover: [0.5, 0.42, 0.34],
  exposeDuration: [1.25, 1.05, 0.9],
  attackCooldown: [0.55, 0.42, 0.32],
  eyeLaserRange: 128,
  eyeLaserWidth: [0.44, 0.5, 0.56],
  eyeLaserDamagePerSecond: [18, 24, 30],
  eyeLaserWindup: [0.78, 0.66, 0.56],
  eyeLaserDuration: [1.2, 1.4, 1.65],
  eyeLaserCooldown: [4.0, 3.4, 2.9],
  color: 0x7b6850,
};

type OctobossAttackKind = 'idle' | 'jab' | 'sweep' | 'double';
export type OctobossTentacleMode = 'coiled' | 'extending' | 'chasing' | 'retracting';
type OctobossEyeLaserPhase = 'idle' | 'windup' | 'firing' | 'cooldown';

export interface OctobossLaserBeamSegment {
  start: Vec2;
  end: Vec2;
}

interface Telegraph {
  mesh: THREE.Mesh;
  point: Vec2;
  radius: number;
  duration: number;
  elapsed: number;
}

interface JabAttack {
  kind: 'jab';
  tentacleIndex: number;
  target: THREE.Vector3;
  flankTarget: THREE.Vector3;
  windup: number;
  commit: number;
  recover: number;
  elapsed: number;
}

interface SweepAttack {
  kind: 'sweep';
  tentacleIndex: number;
  center: THREE.Vector3;
  radius: number;
  startAngle: number;
  sweepAngle: number;
  flankTarget: THREE.Vector3;
  windup: number;
  commit: number;
  recover: number;
  elapsed: number;
}

interface DoubleAttack {
  kind: 'double';
  leftTarget: THREE.Vector3;
  rightTarget: THREE.Vector3;
  windup: number;
  commit: number;
  recover: number;
  elapsed: number;
}

type OctobossAttack = { kind: 'idle' } | JabAttack | SweepAttack | DoubleAttack;

export interface OctobossTentacle {
  collidable: Collidable;
  group: THREE.Group;
  segmentMeshes: THREE.Mesh[];
  jointMeshes: THREE.Mesh[];
  tipGroup: THREE.Group;
  bladePivot: THREE.Group;
  side: -1 | 1;
  socketLocal: THREE.Vector3;
  restLengths: number[];
  lengths: number[];
  joints: THREE.Vector3[];
  tipWorld: THREE.Vector3;
  prevTipWorld: THREE.Vector3;
  desiredTarget: THREE.Vector3;
  idlePhase: number;
  hitCooldown: number;
}

export interface OctobossState {
  id: number;
  config: OctobossConfig;
  collidable: Collidable;
  bodyGroup: THREE.Group;
  bodyRoot: THREE.Group;
  baseSpinGroup: THREE.Group;
  eyeWhiteMesh: THREE.Mesh;
  irisMesh: THREE.Mesh;
  pupilMesh: THREE.Mesh;
  shellMesh: THREE.Mesh;
  shieldMesh: THREE.Mesh;
  hpGroup: THREE.Group;
  hpBarFill: THREE.Mesh;
  tentacles: OctobossTentacle[];
  telegraphs: Telegraph[];
  alive: boolean;
  facingAngle: number;
  turnRate: number;
  gazeLocalX: number;
  gazeLocalZ: number;
  hoverTime: number;
  attack: OctobossAttack;
  attackCooldown: number;
  attackCycle: number;
  exposeTimer: number;
  coreHitCooldown: number;
  tentacleMode: OctobossTentacleMode;
  tentacleModeTimer: number;
  tentacleModeDuration: number;
  tentacleReachScale: number;
  tentacleThicknessScale: number;
  eyeLaserPhase: OctobossEyeLaserPhase;
  eyeLaserTimer: number;
  eyeLaserAngle: number;
  eyeLaserVisualStrength: number;
  eyeLaserDealsDamage: boolean;
  eyeLaserSegments: OctobossLaserBeamSegment[];
  eyeLaserGroup: THREE.Group;
  eyeLaserMeshes: THREE.Mesh[];
  eyeLaserGlowMeshes: THREE.Mesh[];
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

function getPhaseIndex(boss: OctobossState): number {
  const frac = boss.collidable.rpm / boss.config.coreRpmCapacity;
  if (frac > 0.66) return 0;
  if (frac > 0.33) return 1;
  return 2;
}

function getModeDuration(
  boss: OctobossState,
  mode: OctobossTentacleMode,
  phase: number,
): number {
  if (mode === 'coiled') return boss.config.coilDuration[phase];
  if (mode === 'extending') return boss.config.extendDuration[phase];
  if (mode === 'chasing') return boss.config.chaseDuration[phase];
  return boss.config.retractDuration[phase];
}

function modeProgress(boss: OctobossState): number {
  if (boss.tentacleModeDuration <= 0) return 1;
  return clamp(1 - boss.tentacleModeTimer / boss.tentacleModeDuration, 0, 1);
}

function setTentacleMode(
  boss: OctobossState,
  mode: OctobossTentacleMode,
  phase: number,
): void {
  boss.tentacleMode = mode;
  boss.tentacleModeDuration = getModeDuration(boss, mode, phase);
  boss.tentacleModeTimer = boss.tentacleModeDuration;
}

function updateEyeTracking(
  boss: OctobossState,
  playerPos: Vec2,
  delta: number,
): void {
  const eyeYaw = boss.facingAngle * 0.45;
  const dx = playerPos.x - boss.collidable.pos.x;
  const dz = playerPos.z - boss.collidable.pos.z;
  const relAngle = wrapAngle(Math.atan2(dx, dz) - eyeYaw);
  const targetX = clamp(Math.sin(relAngle) * 1.15, -1, 1);
  const targetY = clamp(-Math.cos(relAngle) * 1.05, -1, 1);
  const blend = Math.min(10.5 * delta, 1);
  boss.gazeLocalX = lerp(boss.gazeLocalX, targetX, blend);
  boss.gazeLocalZ = lerp(boss.gazeLocalZ, targetY, blend);
}

function updateTentaclePhaseScales(boss: OctobossState): void {
  const progress = modeProgress(boss);
  if (boss.tentacleMode === 'coiled') {
    boss.tentacleReachScale = boss.config.coiledReachScale;
    boss.tentacleThicknessScale = boss.config.coiledThicknessScale;
    return;
  }
  if (boss.tentacleMode === 'chasing') {
    boss.tentacleReachScale = boss.config.chaseReachScale;
    boss.tentacleThicknessScale = boss.config.chaseThicknessScale;
    return;
  }
  if (boss.tentacleMode === 'extending') {
    boss.tentacleReachScale = lerp(boss.config.coiledReachScale, boss.config.chaseReachScale, smoothStep01(progress));
    boss.tentacleThicknessScale = lerp(boss.config.coiledThicknessScale, boss.config.chaseThicknessScale, smoothStep01(progress));
    return;
  }
  boss.tentacleReachScale = lerp(boss.config.chaseReachScale, boss.config.coiledReachScale, smoothStep01(progress));
  boss.tentacleThicknessScale = lerp(boss.config.chaseThicknessScale, boss.config.coiledThicknessScale, smoothStep01(progress));
}

export function canDamageOctobossCore(boss: OctobossState): boolean {
  return boss.tentacleMode === 'retracting' && boss.exposeTimer > 0;
}

export function getOctobossCoreDamageMultiplier(boss: OctobossState): number {
  return canDamageOctobossCore(boss) ? 1.75 : 0;
}

export function getOctobossTipDamage(boss: OctobossState): number {
  return boss.config.tipDamage[getPhaseIndex(boss)];
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

function createTelegraphMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshBasicMaterial({
      color: 0xff8c4d,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.05;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

function disposeTelegraph(telegraph: Telegraph): void {
  scene.remove(telegraph.mesh);
  telegraph.mesh.geometry.dispose();
  if (telegraph.mesh.material instanceof THREE.Material) telegraph.mesh.material.dispose();
}

function clearTelegraphs(boss: OctobossState): void {
  for (const telegraph of boss.telegraphs) disposeTelegraph(telegraph);
  boss.telegraphs.length = 0;
}

const EYE_LASER_EPSILON = 0.02;

function cross2(a: Vec2, b: Vec2): number {
  return a.x * b.z - a.z * b.x;
}

function normalizeDir(x: number, z: number): Vec2 {
  const len = Math.hypot(x, z);
  if (len <= 0.0001) return { x: 0, z: 1 };
  return { x: x / len, z: z / len };
}

function buildEyeLaserVisuals(color: number): {
  group: THREE.Group;
  beamMeshes: THREE.Mesh[];
  glowMeshes: THREE.Mesh[];
} {
  const group = new THREE.Group();
  const beamMeshes: THREE.Mesh[] = [];
  const glowMeshes: THREE.Mesh[] = [];

  for (let i = 0; i < 1; i += 1) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      createLaserRefractionMaterial(color),
    );
    beam.visible = false;
    beam.renderOrder = 4;
    group.add(beam);
    beamMeshes.push(beam);
    registerRefractionMesh(beam);

    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      createLaserGlowMaterial(0xfff6e2, color),
    );
    glow.visible = false;
    glow.renderOrder = 5;
    group.add(glow);
    glowMeshes.push(glow);
  }

  scene.add(group);
  return { group, beamMeshes, glowMeshes };
}

function setBeamSegmentMesh(mesh: THREE.Mesh, start: Vec2, end: Vec2, width: number): void {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const len = Math.max(0.001, Math.hypot(dx, dz));
  mesh.visible = true;
  mesh.position.set(start.x + dx * 0.5, 1.95, start.z + dz * 0.5);
  mesh.rotation.y = Math.atan2(dx, dz);
  mesh.scale.set(width, 0.18, len);
}

function raycastSegment(origin: Vec2, dir: Vec2, seg: Segment): { distance: number; point: Vec2 } | null {
  const segVec = { x: seg.p2.x - seg.p1.x, z: seg.p2.z - seg.p1.z };
  const denom = cross2(dir, segVec);
  if (Math.abs(denom) < 0.00001) return null;

  const delta = { x: seg.p1.x - origin.x, z: seg.p1.z - origin.z };
  const t = cross2(delta, segVec) / denom;
  const u = cross2(delta, dir) / denom;
  if (t <= EYE_LASER_EPSILON || u < -0.0001 || u > 1.0001) return null;

  return {
    distance: t,
    point: { x: origin.x + dir.x * t, z: origin.z + dir.z * t },
  };
}

function distanceSqPointToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq <= 0.00001) {
    const px = point.x - start.x;
    const pz = point.z - start.z;
    return px * px + pz * pz;
  }

  const t = clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / lenSq, 0, 1);
  const cx = start.x + dx * t;
  const cz = start.z + dz * t;
  const px = point.x - cx;
  const pz = point.z - cz;
  return px * px + pz * pz;
}

function addTelegraph(
  boss: OctobossState,
  point: Vec2,
  radius: number,
  duration: number,
): void {
  const mesh = createTelegraphMesh();
  mesh.position.set(point.x, 0.05, point.z);
  mesh.scale.set(radius, radius, 1);
  boss.telegraphs.push({
    mesh,
    point,
    radius,
    duration,
    elapsed: 0,
  });
}

function clampPointToArena(point: THREE.Vector3, radius: number): THREE.Vector3 {
  const bounds = getArenaBounds();
  return new THREE.Vector3(
    clamp(point.x, bounds.minX + radius, bounds.maxX - radius),
    point.y,
    clamp(point.z, bounds.minZ + radius, bounds.maxZ - radius),
  );
}

function initTentacleJoints(tentacle: OctobossTentacle, base: THREE.Vector3, target: THREE.Vector3): void {
  tentacle.joints.length = tentacle.lengths.length + 1;
  const dir = new THREE.Vector3().subVectors(target, base);
  const distance = Math.max(dir.length(), 0.001);
  dir.divideScalar(distance);
  tentacle.joints[0] = base.clone();
  let cursor = 0;
  for (let i = 1; i < tentacle.joints.length; i++) {
    cursor += tentacle.lengths[i - 1];
    tentacle.joints[i] = base.clone().addScaledVector(dir, cursor);
  }
}

function solveTentacleChain(
  tentacle: OctobossTentacle,
  base: THREE.Vector3,
  target: THREE.Vector3,
): void {
  if (tentacle.joints.length !== tentacle.lengths.length + 1) {
    initTentacleJoints(tentacle, base, target);
  }

  const totalLength = tentacle.lengths.reduce((sum, length) => sum + length, 0);
  const toTarget = new THREE.Vector3().subVectors(target, base);
  const distance = toTarget.length();
  if (distance >= totalLength - 0.001) {
    const dir = toTarget.normalize();
    tentacle.joints[0].copy(base);
    let cursor = 0;
    for (let i = 1; i < tentacle.joints.length; i++) {
      cursor += tentacle.lengths[i - 1];
      tentacle.joints[i].copy(base).addScaledVector(dir, cursor);
    }
    tentacle.joints[tentacle.joints.length - 1].copy(target);
    return;
  }

  const root = base.clone();
  for (let iter = 0; iter < 7; iter++) {
    tentacle.joints[tentacle.joints.length - 1].copy(target);
    for (let i = tentacle.joints.length - 2; i >= 0; i--) {
      const next = tentacle.joints[i + 1];
      const joint = tentacle.joints[i];
      const dir = new THREE.Vector3().subVectors(joint, next).normalize();
      joint.copy(next).addScaledVector(dir, tentacle.lengths[i]);
    }

    tentacle.joints[0].copy(root);
    for (let i = 1; i < tentacle.joints.length; i++) {
      const prev = tentacle.joints[i - 1];
      const joint = tentacle.joints[i];
      const dir = new THREE.Vector3().subVectors(joint, prev).normalize();
      joint.copy(prev).addScaledVector(dir, tentacle.lengths[i - 1]);
    }
  }

  tentacle.joints[0].copy(root);
  tentacle.joints[tentacle.joints.length - 1].copy(target);
}

function addTentacleStyle(
  boss: OctobossState,
  tentacle: OctobossTentacle,
  base: THREE.Vector3,
  attackKind: OctobossAttackKind,
): void {
  const tip = tentacle.joints[tentacle.joints.length - 1];
  const dir = new THREE.Vector3().subVectors(tip, base);
  if (dir.lengthSq() < 1e-6) dir.set(tentacle.side, 0, 0);
  dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(tentacle.side);
  const upScale = attackKind === 'idle' ? 1.0 : attackKind === 'double' ? 0.7 : 0.82;
  const swayScale = attackKind === 'idle' ? 1.0 : 0.16;

  for (let i = 1; i < tentacle.joints.length - 1; i++) {
    const t = i / (tentacle.joints.length - 1);
    const wave = Math.sin(boss.hoverTime * 2.2 + tentacle.idlePhase + t * Math.PI * 0.8);
    const arch = Math.sin(Math.PI * t);
    tentacle.joints[i].addScaledVector(side, wave * boss.config.tentacleIdleSway * swayScale * arch);
    tentacle.joints[i].y += boss.config.tentacleArchHeight * upScale * arch;
  }

  tentacle.joints[0].copy(base);
  tentacle.joints[tentacle.joints.length - 1].copy(tip);
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 1; i < tentacle.joints.length; i++) {
      const prev = tentacle.joints[i - 1];
      const joint = tentacle.joints[i];
      const delta = new THREE.Vector3().subVectors(joint, prev);
      const len = Math.max(delta.length(), 0.001);
      joint.copy(prev).addScaledVector(delta, tentacle.lengths[i - 1] / len);
    }
    tentacle.joints[tentacle.joints.length - 1].copy(tip);
    for (let i = tentacle.joints.length - 2; i >= 0; i--) {
      const next = tentacle.joints[i + 1];
      const joint = tentacle.joints[i];
      const delta = new THREE.Vector3().subVectors(joint, next);
      const len = Math.max(delta.length(), 0.001);
      joint.copy(next).addScaledVector(delta, tentacle.lengths[i] / len);
    }
    tentacle.joints[0].copy(base);
  }
}

function createSawbladeGeometry(
  outerRadius: number,
  innerRadius: number,
  toothCount: number,
  thickness: number,
): THREE.ExtrudeGeometry {
  const bladeShape = new THREE.Shape();
  const toothStep = (Math.PI * 2) / toothCount;
  const toothRootRadius = outerRadius * 0.82;

  for (let i = 0; i < toothCount; i += 1) {
    const start = i * toothStep;
    const leading = start + toothStep * 0.12;
    const tip = start + toothStep * 0.5;
    const trailing = start + toothStep * 0.88;
    const points = [
      new THREE.Vector2(Math.cos(leading) * toothRootRadius, Math.sin(leading) * toothRootRadius),
      new THREE.Vector2(Math.cos(tip) * outerRadius, Math.sin(tip) * outerRadius),
      new THREE.Vector2(Math.cos(trailing) * toothRootRadius, Math.sin(trailing) * toothRootRadius),
    ];

    if (i === 0) bladeShape.moveTo(points[0].x, points[0].y);
    else bladeShape.lineTo(points[0].x, points[0].y);
    bladeShape.lineTo(points[1].x, points[1].y);
    bladeShape.lineTo(points[2].x, points[2].y);
  }
  bladeShape.closePath();

  const bore = new THREE.Path();
  bore.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  bladeShape.holes.push(bore);

  const geometry = new THREE.ExtrudeGeometry(bladeShape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: thickness * 0.14,
    bevelThickness: thickness * 0.16,
  });
  geometry.center();
  return geometry;
}

function createTentacleSawTip(config: OctobossConfig): {
  tipGroup: THREE.Group;
  bladePivot: THREE.Group;
} {
  const tipGroup = new THREE.Group();
  const bladePivot = new THREE.Group();
  const mountLength = Math.max(0.65, config.tentacleThickness * 2.25);
  const mountRadius = Math.max(0.16, config.tentacleThickness * 0.5);
  const bladeRadius = Math.max(config.tipRadius * 0.88, config.tentacleThickness * 2.3);
  const bladeThickness = Math.max(0.14, config.tentacleThickness * 0.34);
  const hubRadius = bladeRadius * 0.25;
  const toothCount = 16;

  const mount = new THREE.Mesh(
    new THREE.CylinderGeometry(mountRadius * 0.92, mountRadius, mountLength, 12),
    new THREE.MeshStandardMaterial({
      color: 0x55483c,
      roughness: 0.58,
      metalness: 0.68,
    }),
  );
  mount.position.y = mountLength * 0.5;
  mount.castShadow = true;
  tipGroup.add(mount);

  const mountCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(mountRadius * 1.32, mountRadius * 1.32, mountLength * 0.22, 16),
    new THREE.MeshStandardMaterial({
      color: 0x8d6a45,
      roughness: 0.32,
      metalness: 0.88,
      emissive: 0x2c1708,
      emissiveIntensity: 0.12,
    }),
  );
  mountCollar.position.y = mountLength * 0.82;
  mountCollar.castShadow = true;
  tipGroup.add(mountCollar);

  bladePivot.position.y = mountLength * 0.96;
  tipGroup.add(bladePivot);

  const blade = new THREE.Mesh(
    createSawbladeGeometry(bladeRadius, hubRadius * 0.72, toothCount, bladeThickness),
    new THREE.MeshStandardMaterial({
      color: 0xc7c1b5,
      roughness: 0.24,
      metalness: 0.95,
      emissive: 0x342618,
      emissiveIntensity: 0.08,
    }),
  );
  blade.rotation.y = Math.PI * 0.5;
  blade.castShadow = true;
  bladePivot.add(blade);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(hubRadius, hubRadius, bladeThickness * 1.8, 18),
    new THREE.MeshStandardMaterial({
      color: 0x4b4138,
      roughness: 0.42,
      metalness: 0.84,
    }),
  );
  hub.rotation.z = Math.PI * 0.5;
  hub.castShadow = true;
  bladePivot.add(hub);

  for (let i = 0; i < 5; i += 1) {
    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(bladeThickness * 0.22, bladeThickness * 0.22, bladeThickness * 1.2, 8),
      new THREE.MeshStandardMaterial({
        color: 0x95836c,
        roughness: 0.3,
        metalness: 0.9,
      }),
    );
    const angle = (i / 5) * Math.PI * 2;
    const boltRadius = hubRadius * 0.62;
    bolt.position.set(
      0,
      Math.cos(angle) * boltRadius,
      Math.sin(angle) * boltRadius,
    );
    bolt.rotation.z = Math.PI * 0.5;
    bolt.castShadow = true;
    bladePivot.add(bolt);
  }

  return { tipGroup, bladePivot };
}

function makeTentacle(
  side: -1 | 1,
  config: OctobossConfig,
): OctobossTentacle {
  const group = new THREE.Group();
  scene.add(group);

  const segmentMeshes: THREE.Mesh[] = [];
  const jointMeshes: THREE.Mesh[] = [];
  const jointRadius = Math.max(0.13, config.tentacleThickness * 0.82);
  const segmentGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  const segmentMat = new THREE.MeshStandardMaterial({
    color: 0x685b4b,
    roughness: 0.62,
    metalness: 0.5,
  });
  for (let i = 0; i < config.tentacleSegmentCount; i++) {
    const mesh = new THREE.Mesh(segmentGeo, i === 0 ? segmentMat : segmentMat.clone());
    mesh.castShadow = true;
    group.add(mesh);
    segmentMeshes.push(mesh);

    const joint = new THREE.Mesh(
      new THREE.SphereGeometry(jointRadius, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xb07f46,
        roughness: 0.35,
        metalness: 0.72,
      }),
    );
    joint.castShadow = true;
    group.add(joint);
    jointMeshes.push(joint);
  }

  const { tipGroup, bladePivot } = createTentacleSawTip(config);
  group.add(tipGroup);

  const collidable: Collidable = {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: config.tipRadius,
    mass: config.tipMass,
    isStatic: true,
    rpm: 1,
    rpmCapacity: 1,
    heatFactor: 0.08,
  };
  collidables.push(collidable);
  tagCollidable(collidable, 'octoboss_tip');

  const restLengths = Array.from({ length: config.tentacleSegmentCount }, () => config.tentacleSegmentLength);
  const lengths = [...restLengths];
  return {
    collidable,
    group,
    segmentMeshes,
    jointMeshes,
    tipGroup,
    bladePivot,
    side,
    socketLocal: new THREE.Vector3(
      config.tentacleSocketSpread * side,
      config.tentacleSocketHeight,
      config.tentacleSocketForward,
    ),
    restLengths,
    lengths,
    joints: [],
    tipWorld: new THREE.Vector3(),
    prevTipWorld: new THREE.Vector3(),
    desiredTarget: new THREE.Vector3(),
    idlePhase: Math.random() * Math.PI * 2,
    hitCooldown: 0,
  };
}

export function createOctoboss(pos: Vec2, config: OctobossConfig): OctobossState {
  const bodyGroup = new THREE.Group();
  const bodyRoot = new THREE.Group();
  const baseSpinGroup = new THREE.Group();
  bodyGroup.add(bodyRoot);
  bodyRoot.add(baseSpinGroup);
  scene.add(bodyGroup);

  const basePlate = new THREE.Mesh(
    new THREE.CylinderGeometry(1.28, 1.46, 0.22, 16),
    new THREE.MeshStandardMaterial({
      color: 0x41372f,
      roughness: 0.78,
      metalness: 0.32,
    }),
  );
  basePlate.position.y = 1.0;
  basePlate.castShadow = true;
  basePlate.receiveShadow = true;
  baseSpinGroup.add(basePlate);

  const spinnerCone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.88, 0.72, 12),
    new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.52,
      metalness: 0.58,
    }),
  );
  spinnerCone.position.y = 1.28;
  spinnerCone.castShadow = true;
  spinnerCone.receiveShadow = true;
  baseSpinGroup.add(spinnerCone);

  const shellMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.78, 18, 14),
    new THREE.MeshStandardMaterial({
      color: 0x9a7d56,
      roughness: 0.44,
      metalness: 0.46,
      emissive: 0x2e1b0f,
      emissiveIntensity: 0.1,
    }),
  );
  shellMesh.position.set(0, 1.98, 0.18);
  shellMesh.scale.set(0.94, 0.8, 0.76);
  shellMesh.castShadow = true;
  shellMesh.receiveShadow = true;
  bodyRoot.add(shellMesh);

  const eyeWhiteMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.74, 18, 14),
    new THREE.MeshStandardMaterial({
      color: 0xf6f6f1,
      emissive: 0x141414,
      emissiveIntensity: 0.04,
      roughness: 0.22,
      metalness: 0.04,
    }),
  );
  eyeWhiteMesh.position.set(0, 2.02, 0.5);
  eyeWhiteMesh.scale.set(1.0, 0.92, 1.0);
  eyeWhiteMesh.castShadow = true;
  bodyRoot.add(eyeWhiteMesh);

  const irisMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 12),
    new THREE.MeshStandardMaterial({
      color: 0x050505,
      emissive: 0x000000,
      emissiveIntensity: 0.0,
      roughness: 0.14,
      metalness: 0.1,
    }),
  );
  irisMesh.position.set(0, 2.04, 1.17);
  irisMesh.scale.set(1.0, 0.46, 0.9);
  bodyRoot.add(irisMesh);

  const pupilMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 10),
    new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0x000000,
      emissiveIntensity: 0.0,
      roughness: 0.08,
      metalness: 0.02,
    }),
  );
  pupilMesh.position.set(0, 2.05, 1.28);
  pupilMesh.scale.set(1.0, 0.62, 0.82);
  bodyRoot.add(pupilMesh);

  const shieldMesh = new THREE.Mesh(
    new THREE.TorusGeometry(1.08, 0.07, 8, 40),
    new THREE.MeshStandardMaterial({
      color: 0xffd18c,
      emissive: 0xff8a33,
      emissiveIntensity: 0.36,
      transparent: true,
      opacity: 0.18,
      roughness: 0.12,
      metalness: 0.2,
    }),
  );
  shieldMesh.rotation.x = Math.PI / 2;
  shieldMesh.position.y = 1.96;
  bodyRoot.add(shieldMesh);

  const hpGroup = new THREE.Group();
  const { bg, fill } = createHpBar(4.8, 0.24, 6.6);
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
    heatFactor: 1.08,
  };
  const id = nextEntityId();
  registerMovement(id, collidable, config.coreMaxSpeed[0], 0.95);
  registerRpm(id, collidable, 0, 0);
  collidables.push(collidable);
  tagCollidable(collidable, 'octoboss_core');

  const tentacles = [makeTentacle(-1, config), makeTentacle(1, config)];
  const eyeLaserVisuals = buildEyeLaserVisuals(0xff6b3d);
  bodyRoot.scale.setScalar(config.bodyScale);

  const boss: OctobossState = {
    id,
    config,
    collidable,
    bodyGroup,
    bodyRoot,
    baseSpinGroup,
    eyeWhiteMesh,
    irisMesh,
    pupilMesh,
    shellMesh,
    shieldMesh,
    hpGroup,
    hpBarFill: fill,
    tentacles,
    telegraphs: [],
    alive: true,
    facingAngle: 0,
    turnRate: 0,
    gazeLocalX: 0,
    gazeLocalZ: 0,
    hoverTime: Math.random() * Math.PI * 2,
    attack: { kind: 'idle' },
    attackCooldown: 0.85,
    attackCycle: 0,
    exposeTimer: 0,
    coreHitCooldown: 0,
    tentacleMode: 'coiled',
    tentacleModeTimer: config.coilDuration[0],
    tentacleModeDuration: config.coilDuration[0],
    tentacleReachScale: config.coiledReachScale,
    tentacleThicknessScale: config.coiledThicknessScale,
    eyeLaserPhase: 'cooldown',
    eyeLaserTimer: config.eyeLaserCooldown[0] * 0.6,
    eyeLaserAngle: 0,
    eyeLaserVisualStrength: 0,
    eyeLaserDealsDamage: false,
    eyeLaserSegments: [],
    eyeLaserGroup: eyeLaserVisuals.group,
    eyeLaserMeshes: eyeLaserVisuals.beamMeshes,
    eyeLaserGlowMeshes: eyeLaserVisuals.glowMeshes,
  };
  collidable.owner = boss;
  for (const tentacle of tentacles) tentacle.collidable.owner = { boss, tentacle };

  for (const tentacle of boss.tentacles) {
    tentacle.desiredTarget.copy(getIdleTarget(boss, tentacle));
  }
  syncOctobossTentacles(boss, 0);
  return boss;
}

function getPredictedPlayerTarget(
  boss: OctobossState,
  playerPos: Vec2,
  playerVel: Vec2,
  lead: number,
  radiusPad: number,
): THREE.Vector3 {
  const target = new THREE.Vector3(
    playerPos.x + playerVel.x * lead,
    0.14,
    playerPos.z + playerVel.z * lead,
  );
  return clampPointToArena(target, radiusPad);
}

function getIdleTarget(
  boss: OctobossState,
  tentacle: OctobossTentacle,
): THREE.Vector3 {
  const angle = boss.facingAngle + tentacle.side * 0.75;
  const reach = boss.config.tentacleIdleReach + Math.sin(boss.hoverTime * 2.8 + tentacle.idlePhase) * 0.35;
  return clampPointToArena(new THREE.Vector3(
    boss.collidable.pos.x + Math.sin(angle) * reach,
    0.42 + 0.12 * Math.sin(boss.hoverTime * 5.2 + tentacle.idlePhase),
    boss.collidable.pos.z + Math.cos(angle) * reach,
  ), tentacle.collidable.radius + 0.35);
}

function getSocketWorldPosition(boss: OctobossState, tentacle: OctobossTentacle): THREE.Vector3 {
  const sin = Math.sin(boss.facingAngle);
  const cos = Math.cos(boss.facingAngle);
  const x = boss.collidable.pos.x + tentacle.socketLocal.x * cos + tentacle.socketLocal.z * sin;
  const z = boss.collidable.pos.z + tentacle.socketLocal.z * cos - tentacle.socketLocal.x * sin;
  return new THREE.Vector3(x, tentacle.socketLocal.y, z);
}

function getEyeLaserOrigin(boss: OctobossState): Vec2 {
  const eyeYaw = boss.facingAngle * 0.45;
  const sin = Math.sin(eyeYaw);
  const cos = Math.cos(eyeYaw);
  return {
    x: boss.collidable.pos.x + sin * 1.28 + boss.gazeLocalX * 0.18,
    z: boss.collidable.pos.z + cos * 1.28,
  };
}

function updateEyeLaserPhase(
  boss: OctobossState,
  playerPos: Vec2,
  phase: number,
  delta: number,
): void {
  const origin = getEyeLaserOrigin(boss);
  const dx = playerPos.x - origin.x;
  const dz = playerPos.z - origin.z;
  const targetAngle = Math.atan2(dx, dz);
  const dist = Math.hypot(dx, dz);

  boss.eyeLaserTimer = Math.max(0, boss.eyeLaserTimer - delta);
  if (boss.eyeLaserPhase === 'cooldown' && boss.eyeLaserTimer <= 0) {
    boss.eyeLaserPhase = 'idle';
  }

  if (
    boss.eyeLaserPhase === 'idle'
    && boss.tentacleMode === 'coiled'
    && dist <= boss.config.eyeLaserRange
    && boss.attack.kind === 'idle'
  ) {
    boss.eyeLaserPhase = 'windup';
    boss.eyeLaserTimer = boss.config.eyeLaserWindup[phase];
    boss.eyeLaserAngle = targetAngle;
  }

  if (boss.eyeLaserPhase === 'windup') {
    const angleDelta = wrapAngle(targetAngle - boss.eyeLaserAngle);
    boss.eyeLaserAngle += angleDelta * Math.min(8.5 * delta, 1);
    if (boss.eyeLaserTimer <= 0) {
      boss.eyeLaserPhase = 'firing';
      boss.eyeLaserTimer = boss.config.eyeLaserDuration[phase];
    }
  } else if (boss.eyeLaserPhase === 'firing') {
    if (boss.eyeLaserTimer <= 0) {
      boss.eyeLaserPhase = 'cooldown';
      boss.eyeLaserTimer = boss.config.eyeLaserCooldown[phase];
    }
  }

  if (boss.eyeLaserPhase === 'firing') {
    boss.eyeLaserDealsDamage = true;
    boss.eyeLaserVisualStrength = 1.0;
  } else if (boss.eyeLaserPhase === 'windup') {
    boss.eyeLaserDealsDamage = false;
    boss.eyeLaserVisualStrength = 0.42;
  } else {
    boss.eyeLaserDealsDamage = false;
    boss.eyeLaserVisualStrength = 0;
  }
}

function steerTentacleTarget(
  tentacle: OctobossTentacle,
  rawTarget: THREE.Vector3,
  phase: number,
  delta: number,
): void {
  if (delta <= 0) {
    tentacle.desiredTarget.copy(rawTarget);
    return;
  }

  const totalLength = tentacle.lengths.reduce((sum, length) => sum + length, 0);
  const responsiveness = phase === 0 ? 4.8 : phase === 1 ? 6.2 : 7.8;
  const followT = 1 - Math.exp(-responsiveness * delta);
  const next = tentacle.desiredTarget.clone().lerp(rawTarget, followT);
  const step = next.sub(tentacle.desiredTarget);
  const maxStep = totalLength * (phase === 0 ? 0.46 : phase === 1 ? 0.56 : 0.68) * delta;
  const stepLen = step.length();
  if (stepLen > maxStep) {
    step.multiplyScalar(maxStep / stepLen);
  }
  tentacle.desiredTarget.add(step);
}

function scheduleJab(
  boss: OctobossState,
  tentacleIndex: number,
  playerPos: Vec2,
  playerVel: Vec2,
  phase: number,
): void {
  clearTelegraphs(boss);
  const target = getPredictedPlayerTarget(boss, playerPos, playerVel, 0.18, 1.05);
  const dx = playerPos.x - boss.collidable.pos.x;
  const dz = playerPos.z - boss.collidable.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const sidewaysX = -dz / dist;
  const sidewaysZ = dx / dist;
  const side = boss.tentacles[tentacleIndex].side;
  const flankTarget = clampPointToArena(new THREE.Vector3(
    playerPos.x - sidewaysX * side * 1.9,
    0.4,
    playerPos.z - sidewaysZ * side * 1.9,
  ), 0.9);
  addTelegraph(boss, { x: target.x, z: target.z }, 0.85, boss.config.jabWindup[phase]);
  boss.attack = {
    kind: 'jab',
    tentacleIndex,
    target,
    flankTarget,
    windup: boss.config.jabWindup[phase],
    commit: boss.config.jabCommit[phase],
    recover: boss.config.jabRecover[phase],
    elapsed: 0,
  };
}

function scheduleSweep(
  boss: OctobossState,
  tentacleIndex: number,
  playerPos: Vec2,
  phase: number,
): void {
  clearTelegraphs(boss);
  const side = boss.tentacles[tentacleIndex].side;
  const center = clampPointToArena(new THREE.Vector3(playerPos.x, 0.12, playerPos.z), 1.0);
  const startAngle = boss.facingAngle - side * 1.55;
  const sweepAngle = side * 2.25;
  const radius = boss.config.sweepRadius[phase];
  const startPoint = new THREE.Vector3(
    center.x + Math.sin(startAngle) * radius,
    0.14,
    center.z + Math.cos(startAngle) * radius,
  );
  const endPoint = new THREE.Vector3(
    center.x + Math.sin(startAngle + sweepAngle) * radius,
    0.14,
    center.z + Math.cos(startAngle + sweepAngle) * radius,
  );
  const flankTarget = clampPointToArena(new THREE.Vector3(
    playerPos.x - Math.sin(boss.facingAngle) * 1.4,
    0.38,
    playerPos.z - Math.cos(boss.facingAngle) * 1.4,
  ), 0.9);
  addTelegraph(boss, { x: startPoint.x, z: startPoint.z }, 0.8, boss.config.sweepWindup[phase]);
  addTelegraph(boss, { x: endPoint.x, z: endPoint.z }, 0.8, boss.config.sweepWindup[phase]);
  boss.attack = {
    kind: 'sweep',
    tentacleIndex,
    center,
    radius,
    startAngle,
    sweepAngle,
    flankTarget,
    windup: boss.config.sweepWindup[phase],
    commit: boss.config.sweepCommit[phase],
    recover: boss.config.sweepRecover[phase],
    elapsed: 0,
  };
}

function scheduleDouble(
  boss: OctobossState,
  playerPos: Vec2,
  playerVel: Vec2,
  phase: number,
): void {
  clearTelegraphs(boss);
  const predicted = getPredictedPlayerTarget(boss, playerPos, playerVel, 0.12, 1.15);
  const dx = predicted.x - boss.collidable.pos.x;
  const dz = predicted.z - boss.collidable.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const sidewaysX = -dz / dist;
  const sidewaysZ = dx / dist;
  const leftTarget = clampPointToArena(new THREE.Vector3(
    predicted.x + sidewaysX * 1.35,
    0.14,
    predicted.z + sidewaysZ * 1.35,
  ), 0.95);
  const rightTarget = clampPointToArena(new THREE.Vector3(
    predicted.x - sidewaysX * 1.35,
    0.14,
    predicted.z - sidewaysZ * 1.35,
  ), 0.95);
  addTelegraph(boss, { x: leftTarget.x, z: leftTarget.z }, 0.9, boss.config.doubleWindup[phase]);
  addTelegraph(boss, { x: rightTarget.x, z: rightTarget.z }, 0.9, boss.config.doubleWindup[phase]);
  boss.attack = {
    kind: 'double',
    leftTarget,
    rightTarget,
    windup: boss.config.doubleWindup[phase],
    commit: boss.config.doubleCommit[phase],
    recover: boss.config.doubleRecover[phase],
    elapsed: 0,
  };
}

function scheduleNextAttack(
  boss: OctobossState,
  playerPos: Vec2,
  playerVel: Vec2,
  phase: number,
): void {
  const cyclePhase0 = ['jab_left', 'jab_right', 'sweep_left', 'double'] as const;
  const cyclePhase1 = ['jab_left', 'sweep_right', 'jab_right', 'double'] as const;
  const cyclePhase2 = ['sweep_left', 'double', 'jab_right', 'double'] as const;
  const cycle = phase === 0 ? cyclePhase0 : phase === 1 ? cyclePhase1 : cyclePhase2;
  const entry = cycle[boss.attackCycle % cycle.length];
  boss.attackCycle += 1;

  if (entry === 'jab_left') scheduleJab(boss, 0, playerPos, playerVel, phase);
  else if (entry === 'jab_right') scheduleJab(boss, 1, playerPos, playerVel, phase);
  else if (entry === 'sweep_left') scheduleSweep(boss, 0, playerPos, phase);
  else if (entry === 'sweep_right') scheduleSweep(boss, 1, playerPos, phase);
  else scheduleDouble(boss, playerPos, playerVel, phase);
}

function getAttackDuration(attack: OctobossAttack): number {
  if (attack.kind === 'idle') return 0;
  return attack.windup + attack.commit + attack.recover;
}

function updateTelegraphs(boss: OctobossState, delta: number): void {
  for (let i = boss.telegraphs.length - 1; i >= 0; i--) {
    const telegraph = boss.telegraphs[i];
    telegraph.elapsed += delta;
    const progress = clamp(telegraph.elapsed / Math.max(telegraph.duration, 0.001), 0, 1);
    const material = telegraph.mesh.material as THREE.MeshBasicMaterial;
    material.opacity = 0.12 + progress * 0.24;
    const scale = telegraph.radius * (0.86 + progress * 0.18);
    telegraph.mesh.scale.set(scale, scale, 1);
    if (telegraph.elapsed >= telegraph.duration) {
      disposeTelegraph(telegraph);
      boss.telegraphs.splice(i, 1);
    }
  }
}

function updateTentacleTargets(
  boss: OctobossState,
  playerPos: Vec2,
  playerVel: Vec2,
  delta: number,
): void {
  const phase = getPhaseIndex(boss);
  if (boss.tentacleMode === 'coiled') {
    const orbitSign = Math.sin(boss.hoverTime * 0.9) >= 0 ? 1 : -1;
    for (const tentacle of boss.tentacles) {
      const baseAngle = boss.facingAngle + tentacle.side * (1.3 + orbitSign * 0.08);
      const coiledReach = boss.config.tentacleIdleReach * boss.config.coiledReachScale;
      const curl = Math.sin(boss.hoverTime * 2.4 + tentacle.idlePhase) * 0.25;
      const rawTarget = clampPointToArena(new THREE.Vector3(
        boss.collidable.pos.x + Math.sin(baseAngle) * coiledReach + tentacle.side * curl,
        0.42 + 0.08 * Math.sin(boss.hoverTime * 3.1 + tentacle.idlePhase),
        boss.collidable.pos.z + Math.cos(baseAngle) * coiledReach - curl * 0.2,
      ), tentacle.collidable.radius + 0.3);
      steerTentacleTarget(tentacle, rawTarget, phase, delta);
    }
    return;
  }

  const lead = phase === 0 ? 0.06 : phase === 1 ? 0.1 : 0.14;
  const predicted = getPredictedPlayerTarget(boss, playerPos, playerVel, lead, 1.6);
  const toPlayerX = playerPos.x - boss.collidable.pos.x;
  const toPlayerZ = playerPos.z - boss.collidable.pos.z;
  const dist = Math.hypot(toPlayerX, toPlayerZ) || 1;
  const sidewaysX = -toPlayerZ / dist;
  const sidewaysZ = toPlayerX / dist;
  const expanding = boss.tentacleMode === 'extending';
  const retracting = boss.tentacleMode === 'retracting';
  const tightness = clamp(dist / 9.0, 0.15, 1.0);
  const lateralOffset = expanding
    ? lerp(0.65, 1.35, tightness)
    : retracting
      ? lerp(0.4, 1.1, tightness)
      : lerp(0.18, 0.7, tightness);
  const dragBack = expanding ? 0.1 : retracting ? 0.22 : phase === 0 ? 0.28 : phase === 1 ? 0.18 : 0.08;

  for (const tentacle of boss.tentacles) {
    const drift = expanding
      ? Math.sin(boss.hoverTime * 1.2 + tentacle.idlePhase) * 0.08
      : Math.sin(boss.hoverTime * (1.8 + phase * 0.2) + tentacle.idlePhase) * 0.16;
    const rawTarget = clampPointToArena(new THREE.Vector3(
      predicted.x + sidewaysX * tentacle.side * lateralOffset + playerVel.x * dragBack + drift * tentacle.side,
      expanding ? 0.34 : retracting ? 0.22 : 0.12,
      predicted.z + sidewaysZ * tentacle.side * lateralOffset + playerVel.z * dragBack + drift * 0.12,
    ), tentacle.collidable.radius + 0.45);
    if (!expanding && dist < 6.0) {
      rawTarget.x = lerp(rawTarget.x, playerPos.x, 0.35);
      rawTarget.z = lerp(rawTarget.z, playerPos.z, 0.35);
    }
    if (!expanding && dist < 3.2) {
      rawTarget.x = lerp(rawTarget.x, playerPos.x, 0.72);
      rawTarget.z = lerp(rawTarget.z, playerPos.z, 0.72);
    }
    steerTentacleTarget(tentacle, rawTarget, phase, delta);
  }
}

export function updateOctobossAI(
  boss: OctobossState,
  playerPos: Vec2,
  playerVel: Vec2,
  delta: number,
): OctobossTentacleMode | null {
  if (!boss.alive) return null;

  const phase = getPhaseIndex(boss);
  const body = boss.collidable;
  const dx = playerPos.x - body.pos.x;
  const dz = playerPos.z - body.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const targetAngle = Math.atan2(dx, dz);
  const facingDelta = wrapAngle(targetAngle - boss.facingAngle) * Math.min(4.2 * delta, 1.0);
  boss.facingAngle += facingDelta;
  boss.turnRate = lerp(boss.turnRate, facingDelta / Math.max(delta, 1e-4), Math.min(8 * delta, 1));
  boss.hoverTime += delta;
  boss.tentacleModeTimer = Math.max(0, boss.tentacleModeTimer - delta);
  boss.coreHitCooldown = Math.max(0, boss.coreHitCooldown - delta);
  updateTentaclePhaseScales(boss);
  boss.exposeTimer = boss.tentacleMode === 'retracting' ? boss.tentacleModeTimer : 0;
  updateEyeLaserPhase(boss, playerPos, phase, delta);
  setMovementMaxSpeed(
    boss.id,
    boss.config.coreMaxSpeed[phase]
      * (boss.tentacleMode === 'retracting' ? 0.52 : boss.tentacleMode === 'coiled' ? 0.7 : 1.0),
  );
  if (boss.attack.kind !== 'idle') {
    boss.attack = { kind: 'idle' };
    clearTelegraphs(boss);
  }

  for (const tentacle of boss.tentacles) {
    tentacle.hitCooldown = Math.max(0, tentacle.hitCooldown - delta);
  }

  const accel = boss.config.coreAcceleration[phase];
  if (boss.eyeLaserPhase === 'firing') {
    body.vel.x *= 0.72;
    body.vel.z *= 0.72;
  } else if (boss.eyeLaserPhase === 'windup') {
    body.vel.x *= 0.82;
    body.vel.z *= 0.82;
  } else if (boss.tentacleMode === 'coiled') {
    body.vel.x *= 0.9;
    body.vel.z *= 0.9;
  } else if (boss.tentacleMode === 'retracting') {
    body.vel.x *= 0.84;
    body.vel.z *= 0.84;
  } else {
    const nx = dx / dist;
    const nz = dz / dist;
    const desiredRange = boss.config.desiredRange[phase];
    const orbitDir = Math.sin(boss.hoverTime * 0.85) >= 0 ? 1 : -1;
    if (dist > desiredRange + 0.8) {
      body.vel.x += nx * accel * delta;
      body.vel.z += nz * accel * delta;
    } else if (dist < desiredRange - 0.8) {
      body.vel.x -= nx * accel * 0.8 * delta;
      body.vel.z -= nz * accel * 0.8 * delta;
    } else {
      body.vel.x += (-nz * orbitDir) * accel * 0.42 * delta;
      body.vel.z += (nx * orbitDir) * accel * 0.42 * delta;
      body.vel.x -= nx * accel * 0.08 * delta;
      body.vel.z -= nz * accel * 0.08 * delta;
    }

    const bounds = getArenaBounds();
    const margin = 3.6;
    if (body.pos.x > bounds.maxX - margin) body.vel.x -= accel * 0.8 * delta;
    if (body.pos.x < bounds.minX + margin) body.vel.x += accel * 0.8 * delta;
    if (body.pos.z > bounds.maxZ - margin) body.vel.z -= accel * 0.8 * delta;
    if (body.pos.z < bounds.minZ + margin) body.vel.z += accel * 0.8 * delta;
  }

  let enteredMode: OctobossTentacleMode | null = null;
  if (boss.tentacleModeTimer <= 0) {
    if (boss.tentacleMode === 'coiled') {
      setTentacleMode(boss, 'extending', phase);
      enteredMode = 'extending';
    } else if (boss.tentacleMode === 'extending') {
      setTentacleMode(boss, 'chasing', phase);
      enteredMode = 'chasing';
    } else if (boss.tentacleMode === 'chasing') {
      setTentacleMode(boss, 'retracting', phase);
      enteredMode = 'retracting';
    } else {
      setTentacleMode(boss, 'coiled', phase);
      enteredMode = 'coiled';
    }
    updateTentaclePhaseScales(boss);
    boss.exposeTimer = boss.tentacleMode === 'retracting' ? boss.tentacleModeTimer : 0;
  }

  updateTelegraphs(boss, delta);

  updateEyeTracking(boss, playerPos, delta);
  updateTentacleTargets(boss, playerPos, playerVel, delta);
  return enteredMode;
}

export function traceOctobossEyeLaser(
  boss: OctobossState,
  playerPos: Vec2,
  playerRadius: number,
  wallSegments: readonly Segment[],
  delta: number,
  playerInvulnerable: boolean,
): number {
  boss.eyeLaserSegments.length = 0;
  if (!boss.alive) return 0;
  if (boss.eyeLaserVisualStrength <= 0.001) return 0;

  const phase = getPhaseIndex(boss);
  const dir = normalizeDir(Math.sin(boss.eyeLaserAngle), Math.cos(boss.eyeLaserAngle));
  const origin = getEyeLaserOrigin(boss);
  let closestDistance = boss.config.eyeLaserRange;
  let hitPoint: Vec2 | null = null;

  for (const seg of wallSegments) {
    const hit = raycastSegment(origin, dir, seg);
    if (!hit || hit.distance >= closestDistance) continue;
    closestDistance = hit.distance;
    hitPoint = hit.point;
  }

  const segmentEnd = hitPoint ?? {
    x: origin.x + dir.x * closestDistance,
    z: origin.z + dir.z * closestDistance,
  };
  boss.eyeLaserSegments.push({
    start: origin,
    end: segmentEnd,
  });

  if (!boss.eyeLaserDealsDamage || playerInvulnerable) return 0;

  const hitRadius = boss.config.eyeLaserWidth[phase] * 0.72 + playerRadius * 0.92;
  const hitRadiusSq = hitRadius * hitRadius;
  for (const segment of boss.eyeLaserSegments) {
    if (distanceSqPointToSegment(playerPos, segment.start, segment.end) <= hitRadiusSq) {
      return boss.config.eyeLaserDamagePerSecond[phase] * delta;
    }
  }

  return 0;
}

export function syncOctobossTentacles(
  boss: OctobossState,
  delta: number,
): void {
  if (!boss.alive) return;

  const pursuitKind: OctobossAttackKind = boss.tentacleMode === 'coiled'
    ? 'idle'
    : boss.tentacleMode === 'retracting'
      ? 'double'
      : 'jab';
  for (const tentacle of boss.tentacles) {
    for (let i = 0; i < tentacle.lengths.length; i++) {
      tentacle.lengths[i] = tentacle.restLengths[i] * boss.tentacleReachScale;
    }

    const base = getSocketWorldPosition(boss, tentacle);
    const target = tentacle.desiredTarget.clone();
    const maxReach = tentacle.lengths.reduce((sum, length) => sum + length, 0) - boss.config.tentacleReachSlack;
    const toTarget = new THREE.Vector3().subVectors(target, base);
    const distance = toTarget.length();
    if (distance > maxReach) {
      target.copy(base).addScaledVector(toTarget.normalize(), maxReach);
    }
    target.y = clamp(target.y, 0.1, boss.config.tentacleSocketHeight + 0.15);

    solveTentacleChain(tentacle, base, target);
    addTentacleStyle(boss, tentacle, base, pursuitKind);

    for (let i = 0; i < tentacle.segmentMeshes.length; i++) {
      setSegmentFromPoints(
        tentacle.segmentMeshes[i],
        tentacle.joints[i],
        tentacle.joints[i + 1],
        boss.config.tentacleThickness * boss.tentacleThicknessScale,
      );
      tentacle.jointMeshes[i].position.copy(tentacle.joints[i + 1]);
      tentacle.jointMeshes[i].scale.setScalar(boss.tentacleThicknessScale);
    }

    const tip = tentacle.joints[tentacle.joints.length - 1];
    const prev = tentacle.joints[tentacle.joints.length - 2];
    tentacle.tipGroup.position.copy(tip);
    tentacle.tipGroup.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3().subVectors(tip, prev).normalize(),
    );
    tentacle.tipGroup.scale.set(
      boss.tentacleThicknessScale,
      boss.tentacleThicknessScale,
      boss.tentacleThicknessScale,
    );
    tentacle.prevTipWorld.copy(tentacle.tipWorld);
    tentacle.tipWorld.copy(tip);
    tentacle.collidable.pos.x = tip.x;
    tentacle.collidable.pos.z = tip.z;
    tentacle.collidable.radius = boss.config.tipRadius * boss.tentacleThicknessScale;
    if (delta > 0) {
      tentacle.collidable.vel.x = (tentacle.tipWorld.x - tentacle.prevTipWorld.x) / delta;
      tentacle.collidable.vel.z = (tentacle.tipWorld.z - tentacle.prevTipWorld.z) / delta;
    } else {
      tentacle.collidable.vel.x = 0;
      tentacle.collidable.vel.z = 0;
    }
  }
}

export function updateOctobossVisuals(
  boss: OctobossState,
  time: number,
  delta: number,
): void {
  if (!boss.alive) return;

  const phase = getPhaseIndex(boss);
  const rpmFrac = boss.collidable.rpm / boss.config.coreRpmCapacity;
  const exposeFrac = clamp(boss.exposeTimer / Math.max(boss.config.exposeDuration[phase], 0.001), 0, 1);
  const hover = Math.sin(time * boss.config.hoverBobSpeed + boss.hoverTime) * boss.config.hoverBobAmp;
  const tilt = Math.sin(time * 3.4 + boss.hoverTime) * 0.03 + boss.turnRate * 0.03;

  boss.bodyGroup.position.set(boss.collidable.pos.x, 0, boss.collidable.pos.z);
  boss.hpGroup.position.set(boss.collidable.pos.x, 0, boss.collidable.pos.z);
  boss.bodyGroup.rotation.y = boss.facingAngle * 0.45;
  boss.bodyRoot.position.y = boss.config.hoverHeight + hover - exposeFrac * 0.08;
  boss.bodyRoot.rotation.x += (tilt - boss.bodyRoot.rotation.x) * Math.min(5.2 * delta, 1);
  boss.bodyRoot.rotation.z += ((-tilt * 0.65) - boss.bodyRoot.rotation.z) * Math.min(5.2 * delta, 1);
  boss.baseSpinGroup.rotation.y += delta * (phase === 2 ? 4.8 : phase === 1 ? 4.0 : 3.4);

  const bladeSpinSpeed = boss.tentacleMode === 'chasing'
    ? 48
    : boss.tentacleMode === 'extending'
      ? 48
      : boss.tentacleMode === 'retracting'
        ? 14
        : 9;
  for (const tentacle of boss.tentacles) {
    tentacle.bladePivot.rotation.x += delta * bladeSpinSpeed * tentacle.side;
  }

  const eyeCenterY = 2.02 + hover * 0.08;
  boss.eyeWhiteMesh.position.y = eyeCenterY;
  boss.eyeWhiteMesh.position.z = 0.5;
  const irisOffsetX = boss.gazeLocalX * 0.34;
  const irisOffsetY = boss.gazeLocalZ * 0.24;
  boss.irisMesh.position.set(
    irisOffsetX,
    eyeCenterY + 0.02 + irisOffsetY,
    1.17,
  );
  boss.pupilMesh.position.set(
    irisOffsetX * 1.08,
    eyeCenterY + 0.03 + irisOffsetY * 1.08,
    1.28,
  );

  const shielded = !canDamageOctobossCore(boss);
  boss.shieldMesh.visible = shielded;
  if (shielded) {
    const mat = boss.shieldMesh.material as THREE.MeshStandardMaterial;
    const pulse = 0.14 + 0.05 * Math.sin(time * 5.4);
    mat.opacity = pulse;
    mat.emissiveIntensity = 0.28 + pulse * 0.9;
    boss.shieldMesh.rotation.y += delta * 0.65;
  }

  const shellMat = boss.shellMesh.material as THREE.MeshStandardMaterial;
  shellMat.emissiveIntensity = 0.08 + exposeFrac * 0.45 + (1 - rpmFrac) * 0.14;
  shellMat.color.setHex(exposeFrac > 0 ? 0xb28a54 : 0x9a7d56);

  const eyeWhiteMat = boss.eyeWhiteMesh.material as THREE.MeshStandardMaterial;
  eyeWhiteMat.color.setHex(exposeFrac > 0 ? 0xffefe0 : 0xf6f6f1);
  eyeWhiteMat.emissiveIntensity = 0.04 + exposeFrac * 0.08 + (boss.eyeLaserPhase === 'windup' ? 0.14 : boss.eyeLaserPhase === 'firing' ? 0.22 : 0);

  const irisMat = boss.irisMesh.material as THREE.MeshStandardMaterial;
  irisMat.color.setHex(boss.eyeLaserPhase === 'firing' ? 0xff7f34 : exposeFrac > 0 ? 0x080808 : 0x050505);
  irisMat.emissive.setHex(boss.eyeLaserPhase === 'firing' ? 0xff7f34 : boss.eyeLaserPhase === 'windup' ? 0xcc4f1f : 0x000000);
  irisMat.emissiveIntensity = boss.eyeLaserPhase === 'firing' ? 0.9 : boss.eyeLaserPhase === 'windup' ? 0.38 : exposeFrac * 0.03;

  const pupilMat = boss.pupilMesh.material as THREE.MeshStandardMaterial;
  pupilMat.color.setHex(boss.eyeLaserPhase === 'firing' ? 0xffd2a8 : 0x000000);
  pupilMat.emissive.setHex(boss.eyeLaserPhase === 'firing' ? 0xffb05a : boss.eyeLaserPhase === 'windup' ? 0xff6b3d : 0x000000);
  pupilMat.emissiveIntensity = boss.eyeLaserPhase === 'firing' ? 1.2 : boss.eyeLaserPhase === 'windup' ? 0.44 : 0;

  for (let i = 0; i < boss.eyeLaserMeshes.length; i += 1) {
    const beam = boss.eyeLaserMeshes[i];
    const glow = boss.eyeLaserGlowMeshes[i];
    const seg = boss.eyeLaserSegments[i];
    if (!seg || boss.eyeLaserVisualStrength <= 0.001) {
      beam.visible = false;
      glow.visible = false;
      continue;
    }

    const beamWidth = boss.config.eyeLaserWidth[phase];
    setBeamSegmentMesh(beam, seg.start, seg.end, beamWidth * 1.38);
    setBeamSegmentMesh(glow, seg.start, seg.end, beamWidth * 1.86);
    beam.position.y = 1.98;
    beam.scale.y = 0.24;
    glow.position.y = 2.02;
    glow.scale.y = 0.34;

    const beamMat = beam.material as THREE.ShaderMaterial;
    const glowMat = glow.material as THREE.ShaderMaterial;
    const pulse = 0.82 + 0.18 * Math.sin(time * Math.PI * (boss.eyeLaserPhase === 'firing' ? 24 : 10));
    beamMat.uniforms.uTime.value = time;
    glowMat.uniforms.uTime.value = time;
    beamMat.uniforms.uOpacity.value = boss.eyeLaserVisualStrength * 0.54 * pulse;
    glowMat.uniforms.uOpacity.value = boss.eyeLaserVisualStrength * 1.18 * pulse;
  }

  updateHpBar(boss.hpBarFill, rpmFrac, 1.4);
}

export function isOctobossDead(boss: OctobossState): boolean {
  return boss.alive && boss.collidable.rpm <= 0;
}

export function destroyOctoboss(boss: OctobossState): void {
  boss.alive = false;
  deregisterEntity(boss.id);
  untagCollidable(boss.collidable);
  unregisterRefractionMesh(boss.eyeLaserGroup);
  const coreIdx = collidables.indexOf(boss.collidable);
  if (coreIdx !== -1) collidables.splice(coreIdx, 1);

  for (const tentacle of boss.tentacles) {
    untagCollidable(tentacle.collidable);
    const idx = collidables.indexOf(tentacle.collidable);
    if (idx !== -1) collidables.splice(idx, 1);
    scene.remove(tentacle.group);
  }
  clearTelegraphs(boss);
  scene.remove(boss.bodyGroup);
  scene.remove(boss.hpGroup);
  scene.remove(boss.eyeLaserGroup);
  for (const beam of boss.eyeLaserMeshes) {
    beam.geometry.dispose();
    if (beam.material instanceof THREE.Material) beam.material.dispose();
  }
  for (const glow of boss.eyeLaserGlowMeshes) {
    glow.geometry.dispose();
    if (glow.material instanceof THREE.Material) glow.material.dispose();
  }
}
