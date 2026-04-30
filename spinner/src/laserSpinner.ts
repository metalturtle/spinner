import * as THREE from 'three';
import { createTop, TOP_BASE_RADIUS, type TopResult } from './top';
import { updateSpinnerVisuals, type SpinnerTiltState } from './spinnerVisuals';
import { scene } from './renderer';
import { getArenaBounds } from './arena';
import { collidables, type Collidable, type Segment, type Vec2 } from './physics';
import {
  applySpinnerWallAvoidance,
  beginSpinnerBurst,
  beginSpinnerWindup,
  clamp,
  normalizeDir,
  resetSpinnerDuelState,
  resetSpinnerOrbitTimer,
  steerSpinnerOrbit,
  tickSpinnerOrbitFlip,
  updateSpinnerDashState,
  type SpinnerDuelAiState,
} from './spinnerDuelAi';
import {
  nextEntityId,
  registerMovement,
  registerRpm,
  setMovementMaxSpeed,
  tagCollidable,
  untagCollidable,
  deregisterEntity,
} from './systems';

type LaserAIState = SpinnerDuelAiState;
type LaserBeamPhase = 'idle' | 'cooldown' | 'windup' | 'firing';

export interface LaserBeamSegment {
  start: Vec2;
  end: Vec2;
}

export interface LaserSpinnerConfig {
  rpmCapacity: number;
  rpmDecayRate: number;
  rpmSpeedDrain: number;
  radius: number;
  mass: number;
  maxSpeed: number;
  acceleration: number;
  friction: number;
  spinSpeed: number;
  heatFactor: number;
  chargeRange: number;
  chargeBoost: number;
  recoveryTime: number;
  wallAvoidDist: number;
  orbitRange: number;
  orbitStrafeStrength: number;
  cutInDuration: number;
  cutInCooldown: number;
  orbitFlipInterval: number;
  dashWindupDuration: number;
  dashSpeedMult: number;
  beamRange: number;
  beamWidth: number;
  beamReflectCount: number;
  idleBeamDamagePerSecond: number;
  combatBeamDamagePerSecond: number;
  idleBeamSpinRate: number;
  combatBeamSpinRate: number;
  beamWindupDuration: number;
  beamFireDuration: number;
  beamCooldown: number;
  color: number;
}

export const LASER_SPINNER_TIER_1: LaserSpinnerConfig = {
  rpmCapacity: 220,
  rpmDecayRate: 0.0,
  rpmSpeedDrain: 0.0,
  radius: 1.72,
  mass: 1.7,
  maxSpeed: 12.6,
  acceleration: 21.0,
  friction: 0.97,
  spinSpeed: 38,
  heatFactor: 1.12,
  chargeRange: 7.2,
  chargeBoost: 2.15,
  recoveryTime: 0.7,
  wallAvoidDist: 2.8,
  orbitRange: 7.1,
  orbitStrafeStrength: 1.06,
  cutInDuration: 0.72,
  cutInCooldown: 1.45,
  orbitFlipInterval: 1.15,
  dashWindupDuration: 0.18,
  dashSpeedMult: 1.85,
  beamRange: 1000,
  beamWidth: 0.62,
  beamReflectCount: 20,
  idleBeamDamagePerSecond: 9,
  combatBeamDamagePerSecond: 21,
  idleBeamSpinRate: 0.95,
  combatBeamSpinRate: 0.95,
  beamWindupDuration: 0.7,
  beamFireDuration: 2.4,
  beamCooldown: 2.1,
  color: 0xff5d4a,
};

export interface LaserSpinnerState extends SpinnerTiltState {
  id: number;
  config: LaserSpinnerConfig;
  collidable: Collidable;
  topResult: TopResult;
  baseColor: THREE.Color;
  alive: boolean;
  awakened: boolean;
  aiState: LaserAIState;
  recoveryTimer: number;
  orbitDir: -1 | 1;
  orbitFlipTimer: number;
  windupTimer: number;
  cutInTimer: number;
  dashCooldown: number;
  dashDirX: number;
  dashDirZ: number;
  beamPhase: LaserBeamPhase;
  beamTimer: number;
  beamAngle: number;
  beamDamagePerSecond: number;
  beamVisualStrength: number;
  beamDealsDamage: boolean;
  beamSegments: LaserBeamSegment[];
  beamGroup: THREE.Group;
  beamMeshes: THREE.Mesh[];
  beamGlowMeshes: THREE.Mesh[];
}

const BEAM_EPSILON = 0.02;

function cross2(a: Vec2, b: Vec2): number {
  return a.x * b.z - a.z * b.x;
}

function resetMovementState(enemy: LaserSpinnerState): void {
  resetSpinnerDuelState(enemy, enemy.config, setMovementMaxSpeed);
}

function setBeamSegmentMesh(mesh: THREE.Mesh, start: Vec2, end: Vec2, width: number): void {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const len = Math.max(0.001, Math.hypot(dx, dz));
  mesh.visible = true;
  mesh.position.set(start.x + dx * 0.5, 0.2, start.z + dz * 0.5);
  mesh.rotation.y = Math.atan2(dx, dz);
  mesh.scale.set(width, 0.18, len);
}

function buildBeamVisuals(maxSegments: number, color: number): {
  group: THREE.Group;
  beamMeshes: THREE.Mesh[];
  glowMeshes: THREE.Mesh[];
} {
  const group = new THREE.Group();
  const beamMeshes: THREE.Mesh[] = [];
  const glowMeshes: THREE.Mesh[] = [];

  for (let i = 0; i < maxSegments; i += 1) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    beam.visible = false;
    beam.renderOrder = 4;
    group.add(beam);
    beamMeshes.push(beam);

    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xfff1d6,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.visible = false;
    glow.renderOrder = 5;
    group.add(glow);
    glowMeshes.push(glow);
  }

  scene.add(group);
  return { group, beamMeshes, glowMeshes };
}

function updateBeamPhase(enemy: LaserSpinnerState, delta: number): void {
  if (!enemy.awakened) {
    enemy.beamPhase = 'idle';
    enemy.beamTimer = 0;
    enemy.beamAngle += enemy.config.idleBeamSpinRate * delta;
    enemy.beamDealsDamage = true;
    enemy.beamDamagePerSecond = enemy.config.idleBeamDamagePerSecond;
    enemy.beamVisualStrength = 0.46;
    return;
  }

  enemy.beamTimer -= delta;
  if (enemy.beamPhase === 'idle') {
    enemy.beamPhase = 'cooldown';
    enemy.beamTimer = enemy.config.beamCooldown * 0.5;
  }

  if (enemy.beamPhase === 'cooldown' && enemy.beamTimer <= 0) {
    enemy.beamPhase = 'windup';
    enemy.beamTimer = enemy.config.beamWindupDuration;
  } else if (enemy.beamPhase === 'windup' && enemy.beamTimer <= 0) {
    enemy.beamPhase = 'firing';
    enemy.beamTimer = enemy.config.beamFireDuration;
  } else if (enemy.beamPhase === 'firing' && enemy.beamTimer <= 0) {
    enemy.beamPhase = 'cooldown';
    enemy.beamTimer = enemy.config.beamCooldown;
  }

  if (enemy.beamPhase === 'firing') {
    enemy.beamAngle += enemy.config.combatBeamSpinRate * delta;
    enemy.beamDealsDamage = true;
    enemy.beamDamagePerSecond = enemy.config.combatBeamDamagePerSecond;
    enemy.beamVisualStrength = 1.0;
  } else if (enemy.beamPhase === 'windup') {
    enemy.beamAngle += enemy.config.combatBeamSpinRate * 0.34 * delta;
    enemy.beamDealsDamage = false;
    enemy.beamDamagePerSecond = 0;
    enemy.beamVisualStrength = 0.34;
  } else {
    enemy.beamDealsDamage = false;
    enemy.beamDamagePerSecond = 0;
    enemy.beamVisualStrength = 0;
  }
}

function raycastSegment(origin: Vec2, dir: Vec2, seg: Segment): { distance: number; point: Vec2 } | null {
  const segVec = { x: seg.p2.x - seg.p1.x, z: seg.p2.z - seg.p1.z };
  const denom = cross2(dir, segVec);
  if (Math.abs(denom) < 0.00001) return null;

  const delta = { x: seg.p1.x - origin.x, z: seg.p1.z - origin.z };
  const t = cross2(delta, segVec) / denom;
  const u = cross2(delta, dir) / denom;
  if (t <= BEAM_EPSILON || u < -0.0001 || u > 1.0001) return null;

  return {
    distance: t,
    point: { x: origin.x + dir.x * t, z: origin.z + dir.z * t },
  };
}

function reflectDirection(dir: Vec2, seg: Segment): Vec2 {
  const tangent = normalizeDir(seg.p2.x - seg.p1.x, seg.p2.z - seg.p1.z);
  let normal = { x: -tangent.z, z: tangent.x };
  if (dir.x * normal.x + dir.z * normal.z > 0) {
    normal = { x: -normal.x, z: -normal.z };
  }
  const dot = dir.x * normal.x + dir.z * normal.z;
  return normalizeDir(
    dir.x - 2 * dot * normal.x,
    dir.z - 2 * dot * normal.z,
  );
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

export function createLaserSpinner(pos: Vec2, config: LaserSpinnerConfig): LaserSpinnerState {
  const topResult = createTop(config.color);
  const scale = config.radius / TOP_BASE_RADIUS;
  topResult.spinGroup.scale.setScalar(scale);
  topResult.tiltGroup.position.set(pos.x, 0, pos.z);
  scene.add(topResult.tiltGroup);

  const collidable: Collidable = {
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: config.radius,
    mass: config.mass,
    isStatic: false,
    rpm: config.rpmCapacity * 0.72,
    rpmCapacity: config.rpmCapacity,
    heatFactor: config.heatFactor,
  };
  collidables.push(collidable);

  const id = nextEntityId();
  registerMovement(id, collidable, config.maxSpeed, config.friction);
  registerRpm(id, collidable, config.rpmDecayRate, config.rpmSpeedDrain);
  tagCollidable(collidable, 'laser_spinner');

  const beamVisuals = buildBeamVisuals(config.beamReflectCount + 1, config.color);
  const enemy: LaserSpinnerState = {
    id,
    config,
    collidable,
    topResult,
    baseColor: new THREE.Color(config.color),
    alive: true,
    awakened: true,
    aiState: 'orbit',
    recoveryTimer: 0,
    orbitDir: Math.random() < 0.5 ? -1 : 1,
    orbitFlipTimer: config.orbitFlipInterval,
    windupTimer: 0,
    cutInTimer: 0,
    dashCooldown: 0,
    dashDirX: 0,
    dashDirZ: 1,
    beamPhase: 'cooldown',
    beamTimer: config.beamCooldown * 0.4,
    beamAngle: Math.random() * Math.PI * 2,
    beamDamagePerSecond: 0,
    beamVisualStrength: 0,
    beamDealsDamage: false,
    beamSegments: [],
    beamGroup: beamVisuals.group,
    beamMeshes: beamVisuals.beamMeshes,
    beamGlowMeshes: beamVisuals.glowMeshes,
    tiltX: 0,
    tiltZ: 0,
  };
  collidable.owner = enemy;
  resetMovementState(enemy);
  return enemy;
}

export function setLaserSpinnerAwake(enemy: LaserSpinnerState, awakened: boolean): void {
  enemy.awakened = awakened;
  enemy.collidable.enabled = awakened;
  enemy.collidable.vel.x = 0;
  enemy.collidable.vel.z = 0;
  resetMovementState(enemy);
  if (awakened) {
    enemy.beamPhase = 'cooldown';
    enemy.beamTimer = enemy.config.beamCooldown * 0.35;
  } else {
    enemy.beamPhase = 'idle';
    enemy.beamTimer = 0;
  }
}

export function updateLaserSpinnerAI(
  enemy: LaserSpinnerState,
  playerPos: Vec2,
  playerRadius: number,
  playerSpeed: number,
  delta: number,
): void {
  if (!enemy.alive) return;

  updateBeamPhase(enemy, delta);
  if (!enemy.awakened) return;

  const cfg = enemy.config;
  const body = enemy.collidable;
  setMovementMaxSpeed(enemy.id, enemy.aiState === 'dash'
    ? cfg.maxSpeed * cfg.dashSpeedMult
    : cfg.maxSpeed);
  enemy.dashCooldown = Math.max(0, enemy.dashCooldown - delta);
  enemy.orbitFlipTimer -= delta;
  const playerIdle = playerSpeed < 0.65;

  if (enemy.aiState === 'recover') {
    enemy.recoveryTimer -= delta;
    if (enemy.recoveryTimer <= 0) {
      resetMovementState(enemy);
    }
    return;
  }

  const dx = playerPos.x - body.pos.x;
  const dz = playerPos.z - body.pos.z;
  const dist = Math.hypot(dx, dz);
  const dir = dist > 0.001 ? { x: dx / dist, z: dz / dist } : { x: 0, z: 1 };
  const combinedRadius = body.radius + playerRadius;

  tickSpinnerOrbitFlip(enemy, enemy.config, delta);

  if (enemy.aiState === 'windup') {
    enemy.windupTimer -= delta;
    body.vel.x *= Math.max(0, 1 - delta * 12);
    body.vel.z *= Math.max(0, 1 - delta * 12);
    if (enemy.windupTimer <= 0) beginSpinnerBurst(enemy, body, cfg, setMovementMaxSpeed);
    applySpinnerWallAvoidance(enemy, body, cfg, delta);
    return;
  }

  if (enemy.aiState === 'dash') {
    if (updateSpinnerDashState(enemy, body, playerPos, combinedRadius, cfg, delta, {
      accelMultiplier: 1.22,
      closeEnoughPadding: 0.55,
    })) {
      enemy.aiState = 'orbit';
      setMovementMaxSpeed(enemy.id, cfg.maxSpeed);
      resetSpinnerOrbitTimer(enemy, enemy.config);
    }
    applySpinnerWallAvoidance(enemy, body, cfg, delta);
    return;
  }

  enemy.aiState = 'orbit';
  const cutInRangeMult = playerIdle ? 1.6 : 1.38;
  const shouldCutIn = dist <= cfg.chargeRange * cutInRangeMult
    && dist >= combinedRadius + 0.75
    && enemy.dashCooldown <= 0
    && enemy.beamPhase !== 'firing';

  if (shouldCutIn) {
    enemy.dashCooldown = cfg.cutInCooldown;
    beginSpinnerWindup(enemy, body, cfg, setMovementMaxSpeed, dir.x, dir.z, 0.24);
  } else if (dist > 0.1) {
    steerSpinnerOrbit(enemy, body, playerPos, combinedRadius, cfg, delta, playerIdle, {
      desiredRangeMultiplier: 0.74,
      playerIdleInwardBias: -0.18,
      playerIdleStrafeMultiplier: 0.34,
    });
  }

  applySpinnerWallAvoidance(enemy, body, cfg, delta);
}

export function traceLaserSpinnerBeam(
  enemy: LaserSpinnerState,
  playerPos: Vec2,
  playerRadius: number,
  wallSegments: readonly Segment[],
  delta: number,
  playerInvulnerable: boolean,
): number {
  enemy.beamSegments.length = 0;
  if (!enemy.alive) return 0;

  const beamVisible = !enemy.awakened || enemy.beamPhase === 'idle' || enemy.beamPhase === 'windup' || enemy.beamPhase === 'firing';
  if (!beamVisible || enemy.beamVisualStrength <= 0.001) return 0;

  const dir = normalizeDir(Math.sin(enemy.beamAngle), Math.cos(enemy.beamAngle));
  let origin = { x: enemy.collidable.pos.x, z: enemy.collidable.pos.z };
  let beamDir = dir;
  let remainingRange = enemy.config.beamRange;
  let ignoreSegmentIndex = -1;

  for (let bounce = 0; bounce <= enemy.config.beamReflectCount && remainingRange > 0.05; bounce += 1) {
    let closestDistance = remainingRange;
    let hitPoint: Vec2 | null = null;
    let hitSegmentIndex = -1;

    for (let i = 0; i < wallSegments.length; i += 1) {
      if (i === ignoreSegmentIndex) continue;
      const seg = wallSegments[i];
      const hit = raycastSegment(origin, beamDir, seg);
      if (!hit || hit.distance >= closestDistance) continue;
      closestDistance = hit.distance;
      hitPoint = hit.point;
      hitSegmentIndex = i;
    }

    const segmentEnd = hitPoint ?? {
      x: origin.x + beamDir.x * closestDistance,
      z: origin.z + beamDir.z * closestDistance,
    };
    enemy.beamSegments.push({
      start: { x: origin.x, z: origin.z },
      end: segmentEnd,
    });
    remainingRange -= closestDistance;

    if (hitSegmentIndex < 0 || !hitPoint) break;
    const hitSegment = wallSegments[hitSegmentIndex];
    if (!hitSegment.reflective) break;

    beamDir = reflectDirection(beamDir, hitSegment);
    origin = {
      x: hitPoint.x + beamDir.x * BEAM_EPSILON,
      z: hitPoint.z + beamDir.z * BEAM_EPSILON,
    };
    ignoreSegmentIndex = hitSegmentIndex;
  }

  if (!enemy.beamDealsDamage || playerInvulnerable) return 0;

  const hitRadius = enemy.config.beamWidth * 0.5 + playerRadius * 0.8;
  const hitRadiusSq = hitRadius * hitRadius;
  for (const segment of enemy.beamSegments) {
    if (distanceSqPointToSegment(playerPos, segment.start, segment.end) <= hitRadiusSq) {
      return enemy.beamDamagePerSecond * delta;
    }
  }

  return 0;
}

export function updateLaserSpinnerVisuals(enemy: LaserSpinnerState, time: number, delta: number): void {
  if (!enemy.alive) return;

  const cfg = enemy.config;
  const body = enemy.collidable;
  const { tiltGroup, bodyMat } = enemy.topResult;
  const rpmFrac = body.rpm / cfg.rpmCapacity;

  tiltGroup.position.x = body.pos.x;
  tiltGroup.position.z = body.pos.z;

  updateSpinnerVisuals(enemy, {
    vel: body.vel,
    maxSpeed: cfg.maxSpeed,
    spinSpeed: cfg.spinSpeed,
    rpmFrac,
    spinFrac: rpmFrac,
    baseColor: enemy.baseColor,
    tiltGroup,
    spinGroup: enemy.topResult.spinGroup,
    bodyMat,
    motionVisuals: enemy.topResult.motionVisuals,
  }, time, delta);

  if (enemy.beamPhase === 'firing') {
    const pulse = 0.7 + 0.3 * Math.sin(time * Math.PI * 20);
    bodyMat.emissive.copy(enemy.baseColor).multiplyScalar(0.8 + pulse * 0.6);
    bodyMat.emissiveIntensity = 0.9 + pulse * 0.4;
  } else if (enemy.beamPhase === 'windup' || !enemy.awakened) {
    const pulse = 0.55 + 0.45 * Math.sin(time * Math.PI * 8);
    bodyMat.emissive.copy(enemy.baseColor).multiplyScalar(0.3 + pulse * 0.45);
    bodyMat.emissiveIntensity = 0.35 + pulse * 0.18;
  } else if (enemy.aiState === 'dash') {
    bodyMat.emissive.copy(enemy.baseColor).multiplyScalar(0.52);
    bodyMat.emissiveIntensity = 0.38;
  } else {
    bodyMat.emissiveIntensity = 0;
  }

  for (let i = 0; i < enemy.beamMeshes.length; i += 1) {
    const beam = enemy.beamMeshes[i];
    const glow = enemy.beamGlowMeshes[i];
    const seg = enemy.beamSegments[i];
    if (!seg || enemy.beamVisualStrength <= 0.001) {
      beam.visible = false;
      glow.visible = false;
      continue;
    }

    setBeamSegmentMesh(beam, seg.start, seg.end, enemy.config.beamWidth);
    setBeamSegmentMesh(glow, seg.start, seg.end, enemy.config.beamWidth * 0.52);
    glow.position.y = 0.26;
    glow.scale.y = 0.06;

    const beamMat = beam.material as THREE.MeshBasicMaterial;
    const glowMat = glow.material as THREE.MeshBasicMaterial;
    const pulse = 0.82 + 0.18 * Math.sin(time * Math.PI * (enemy.beamPhase === 'firing' ? 24 : 10) + i * 0.4);
    beamMat.opacity = enemy.beamVisualStrength * 0.4 * pulse;
    glowMat.opacity = enemy.beamVisualStrength * 0.95 * pulse;
  }
}

export function onLaserSpinnerCollision(enemy: LaserSpinnerState): void {
  if (enemy.aiState !== 'recover') {
    enemy.aiState = 'recover';
    enemy.recoveryTimer = enemy.config.recoveryTime;
    enemy.windupTimer = 0;
    enemy.cutInTimer = 0;
  }
}

export function getLaserSpinnerComboLockDuration(_enemy: LaserSpinnerState): number {
  return 0;
}

export function isLaserSpinnerDead(enemy: LaserSpinnerState): boolean {
  return enemy.collidable.rpm <= 0;
}

export function destroyLaserSpinner(enemy: LaserSpinnerState): void {
  enemy.alive = false;
  deregisterEntity(enemy.id);
  untagCollidable(enemy.collidable);
  scene.remove(enemy.topResult.tiltGroup);
  scene.remove(enemy.beamGroup);
  const idx = collidables.indexOf(enemy.collidable);
  if (idx !== -1) collidables.splice(idx, 1);
}
