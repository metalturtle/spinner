import * as THREE from 'three';
import { scene } from './renderer';
import { ARENA_SIZE, RPM_SOFT_CAP_RATIO } from './constants';
import { collidables, type Collidable, type Vec2 } from './physics';
import { createTop, TOP_BASE_RADIUS, type TopResult } from './top';
import { updateSpinnerVisuals, type SpinnerTiltState } from './spinnerVisuals';
import {
  nextEntityId,
  registerMovement,
  registerRpm,
  tagCollidable,
  untagCollidable,
  deregisterEntity,
} from './systems';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface EnemySpinnerConfig {
  // Physics / RPM
  rpmCapacity:   number;
  rpmDecayRate:  number;
  rpmSpeedDrain: number;
  radius:        number;
  mass:          number;
  maxSpeed:      number;
  acceleration:  number;
  friction:      number;
  spinSpeed:     number;

  // Combat
  heatFactor:    number;

  // AI
  chargeRange:   number;   // distance to trigger sprint boost
  chargeBoost:   number;   // acceleration multiplier when charging
  recoveryTime:  number;   // stun window after collision (seconds)
  wallAvoidDist: number;   // distance from wall to start steering away
  orbitRange:    number;   // preferred duel distance while circling the player
  orbitStrafeStrength: number; // how strongly the enemy prefers sideways motion while orbiting
  cutInDuration: number;   // seconds spent committing to a direct inward burst
  cutInCooldown: number;   // minimum delay between cut-in attempts
  orbitFlipInterval: number; // average interval before changing orbit direction
  comboDashCount: number;  // number of chained rushes in the combo attack
  comboPauseDuration: number; // brief hold between combo rushes
  comboCooldown: number;   // minimum delay between combo attempts
  comboLockDuration: number; // how long the player is briefly locked on combo contact

  // Visual
  color:         number;
}

export const ENEMY_SPINNER_TIER_1: EnemySpinnerConfig = {
  rpmCapacity:   120,
  rpmDecayRate:  0.0,      // ~30% of player's 1.0
  rpmSpeedDrain: 0.2,
  radius:        1.425,
  mass:          1.15,
  maxSpeed:      12,       // slightly slower than player (15)
  acceleration:  18,       // slightly less than player (25)
  friction:      0.97,
  spinSpeed:     36,

  heatFactor:    1.0,

  chargeRange:   6.0,
  chargeBoost:   1.8,
  recoveryTime:  0.8,
  wallAvoidDist: 3.0,
  orbitRange:    6.8,
  orbitStrafeStrength: 1.05,
  cutInDuration: 0.55,
  cutInCooldown: 1.6,
  orbitFlipInterval: 1.4,
  comboDashCount: 2,
  comboPauseDuration: 0.1,
  comboCooldown: 4.4,
  comboLockDuration: 0.09,

  color:         0x4466cc, // blue
};

export const ENEMY_SPINNER_TIER_2: EnemySpinnerConfig = {
  ...ENEMY_SPINNER_TIER_1,
  rpmCapacity:   180,
  radius:        1.6875,
  mass:          1.45,
  maxSpeed:      12.6,
  acceleration:  19.4,
  chargeBoost:   1.95,
  recoveryTime:  0.72,
  heatFactor:    1.08,
  orbitRange:    7.2,
  orbitStrafeStrength: 1.15,
  cutInDuration: 0.65,
  cutInCooldown: 1.35,
  orbitFlipInterval: 1.2,
  comboDashCount: 3,
  comboPauseDuration: 0.1,
  comboCooldown: 3.8,
  comboLockDuration: 0.12,
  color:         0x6f63ff,
};

export const ENEMY_SPINNER_TIER_3: EnemySpinnerConfig = {
  ...ENEMY_SPINNER_TIER_2,
  rpmCapacity:   260,
  radius:        2.025,
  mass:          1.85,
  maxSpeed:      13.2,
  acceleration:  23.5,
  chargeBoost:   2.85,
  recoveryTime:  0.66,
  heatFactor:    1.16,
  orbitRange:    8.6,
  orbitStrafeStrength: 1.08,
  cutInDuration: 0.98,
  cutInCooldown: 0.82,
  orbitFlipInterval: 1.0,
  comboDashCount: 3,
  comboPauseDuration: 0.075,
  comboCooldown: 2.8,
  comboLockDuration: 0.15,
  color:         0xa052ff,
};

// ─── Types ───────────────────────────────────────────────────────────────────

type AIState = 'orbit' | 'cut_in' | 'recover';
type EnemyAttackState = 'idle' | 'dash_windup' | 'dash_commit' | 'combo_chain' | 'heat_active';

export interface EnemySpinnerState extends SpinnerTiltState {
  id:            number;
  config:        EnemySpinnerConfig;
  collidable:    Collidable;
  topResult:     TopResult;
  baseColor:     THREE.Color;
  alive:         boolean;
  aiState:       AIState;
  attackState:   EnemyAttackState;
  recoveryTimer: number;
  orbitDir:      -1 | 1;
  orbitFlipTimer:number;
  cutInTimer:    number;
  dashCooldown:  number;
  comboCooldown: number;
  heatCooldown:  number;
  comboBurstsRemaining: number;
  comboPauseTimer: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resetOrbitTimer(enemy: EnemySpinnerState): void {
  const variance = 0.72 + Math.random() * 0.56;
  enemy.orbitFlipTimer = enemy.config.orbitFlipInterval * variance;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createEnemySpinner(pos: Vec2, config: EnemySpinnerConfig): EnemySpinnerState {
  const topResult = createTop(config.color);
  const scale = config.radius / TOP_BASE_RADIUS;
  topResult.spinGroup.scale.setScalar(scale);
  topResult.tiltGroup.position.set(pos.x, 0, pos.z);
  scene.add(topResult.tiltGroup);

  const collidable: Collidable = {
    pos:         { x: pos.x, z: pos.z },
    vel:         { x: 0, z: 0 },
    radius:      config.radius,
    mass:        config.mass,
    isStatic:    false,
    rpm:         config.rpmCapacity * RPM_SOFT_CAP_RATIO,
    rpmCapacity: config.rpmCapacity,
    heatFactor:  config.heatFactor,
  };
  collidables.push(collidable);

  const id = nextEntityId();
  registerMovement(id, collidable, config.maxSpeed, config.friction);
  registerRpm(id, collidable, config.rpmDecayRate, config.rpmSpeedDrain);
  tagCollidable(collidable, 'enemy');

  return {
    id,
    config,
    collidable,
    topResult,
    baseColor:     new THREE.Color(config.color),
    alive:         true,
    aiState:       'orbit',
    attackState:   'idle',
    recoveryTimer: 0,
    orbitDir:      Math.random() < 0.5 ? -1 : 1,
    orbitFlipTimer: config.orbitFlipInterval * (0.8 + Math.random() * 0.5),
    cutInTimer:    0,
    dashCooldown:  0,
    comboCooldown: 0,
    heatCooldown:  0,
    comboBurstsRemaining: 0,
    comboPauseTimer: 0,
    tiltX:         0,
    tiltZ:         0,
  };
}

function beginEnemyCutIn(enemy: EnemySpinnerState, duration: number, attackState: EnemyAttackState): void {
  enemy.aiState = 'cut_in';
  enemy.attackState = attackState;
  enemy.cutInTimer = duration;
  enemy.comboPauseTimer = 0;
  enemy.collidable.vel.x *= 0.42;
  enemy.collidable.vel.z *= 0.42;
}

// ─── AI Movement (call BEFORE runCollisions) ─────────────────────────────────

export function updateEnemyAI(
  enemy:     EnemySpinnerState,
  playerPos: Vec2,
  playerRadius: number,
  playerSpeed: number,
  delta:     number
): void {
  if (!enemy.alive) return;

  const cfg  = enemy.config;
  const body = enemy.collidable;
  enemy.dashCooldown = Math.max(0, enemy.dashCooldown - delta);
  enemy.comboCooldown = Math.max(0, enemy.comboCooldown - delta);
  enemy.heatCooldown = Math.max(0, enemy.heatCooldown - delta);
  enemy.orbitFlipTimer -= delta;
  enemy.comboPauseTimer = Math.max(0, enemy.comboPauseTimer - delta);
  const playerIdle = playerSpeed < 0.6;

  // ── Recovery: coast on inertia, no steering ──
  // Movement system handles friction + position update every frame.
  if (enemy.aiState === 'recover') {
    enemy.recoveryTimer -= delta;
    if (enemy.recoveryTimer <= 0) {
      enemy.aiState = 'orbit';
      enemy.attackState = 'idle';
      enemy.cutInTimer = 0;
      enemy.comboBurstsRemaining = 0;
      enemy.comboPauseTimer = 0;
      resetOrbitTimer(enemy);
    }
    return;
  }

  // ── Direction toward player ──
  const dx   = playerPos.x - body.pos.x;
  const dz   = playerPos.z - body.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const invDist = dist > 0.001 ? 1 / dist : 0;
  const dirX = dx * invDist;
  const dirZ = dz * invDist;
  const combinedRadius = body.radius + playerRadius;

  if (enemy.orbitFlipTimer <= 0) {
    enemy.orbitDir = enemy.orbitDir === 1 ? -1 : 1;
    resetOrbitTimer(enemy);
  }

  if (enemy.aiState === 'cut_in') {
    if (enemy.comboPauseTimer > 0) {
      body.vel.x *= Math.max(0, 1 - delta * 10);
      body.vel.z *= Math.max(0, 1 - delta * 10);
      return;
    }

    enemy.cutInTimer -= delta;
    const accel = cfg.acceleration * cfg.chargeBoost;
    const forwardSpeed = body.vel.x * dirX + body.vel.z * dirZ;
    body.vel.x = dirX * forwardSpeed + (body.vel.x - dirX * forwardSpeed) * Math.max(0, 1 - delta * 8.5);
    body.vel.z = dirZ * forwardSpeed + (body.vel.z - dirZ * forwardSpeed) * Math.max(0, 1 - delta * 8.5);
    if (dist > 0.1) {
      body.vel.x += dirX * accel * delta;
      body.vel.z += dirZ * accel * delta;
    }

    if (enemy.cutInTimer <= 0 || dist <= combinedRadius + 0.4) {
      if (enemy.attackState === 'combo_chain' && enemy.comboBurstsRemaining > 0) {
        enemy.comboBurstsRemaining -= 1;
        enemy.comboPauseTimer = cfg.comboPauseDuration;
        enemy.cutInTimer = cfg.cutInDuration * 0.82;
      } else {
        enemy.aiState = 'orbit';
        enemy.attackState = 'idle';
        enemy.comboBurstsRemaining = 0;
        resetOrbitTimer(enemy);
      }
    }
  } else {
    enemy.aiState = 'orbit';
    const comboRangeMult = cfg.chargeBoost >= 2.5 ? 1.45 : 1.2;
    const cutInRangeMult = playerIdle
      ? (cfg.chargeBoost >= 2.5 ? 1.95 : 1.55)
      : (cfg.chargeBoost >= 2.5 ? 1.7 : 1.35);
    const shouldCombo = playerIdle
      && cfg.comboDashCount > 1
      && dist <= cfg.chargeRange * comboRangeMult
      && dist >= combinedRadius + 0.6
      && enemy.comboCooldown <= 0;
    const shouldCutIn = dist <= cfg.chargeRange * cutInRangeMult
      && dist >= combinedRadius + 0.75
      && enemy.dashCooldown <= 0;

    if (shouldCombo) {
      enemy.comboBurstsRemaining = Math.max(0, cfg.comboDashCount - 1);
      enemy.comboCooldown = cfg.comboCooldown;
      enemy.dashCooldown = Math.max(cfg.cutInCooldown * 0.7, cfg.comboPauseDuration * cfg.comboDashCount);
      beginEnemyCutIn(enemy, cfg.cutInDuration * 0.92, 'combo_chain');
    } else if (shouldCutIn) {
      enemy.dashCooldown = cfg.cutInCooldown;
      beginEnemyCutIn(enemy, cfg.cutInDuration, 'dash_commit');
    } else if (dist > 0.1) {
      const tangentX = -dirZ * enemy.orbitDir;
      const tangentZ = dirX * enemy.orbitDir;
      const desiredRange = playerIdle ? cfg.orbitRange * 0.7 : cfg.orbitRange;
      const radialError = dist - desiredRange;
      const radialPull = clamp(radialError / Math.max(desiredRange, 0.001), -0.95, 0.95);
      const closePush = dist < combinedRadius + 1.0 ? -0.9 : 0;
      const inwardBias = radialPull + closePush + (playerIdle ? -0.28 : 0);
      const accel = cfg.acceleration;
      const strafeStrength = playerIdle ? cfg.orbitStrafeStrength * 0.28 : cfg.orbitStrafeStrength;

      body.vel.x += (tangentX * strafeStrength + dirX * inwardBias) * accel * delta;
      body.vel.z += (tangentZ * strafeStrength + dirZ * inwardBias) * accel * delta;
    }
  }

  // ── Wall avoidance — gentle repulsion near edges ──
  const limit = ARENA_SIZE - cfg.wallAvoidDist;
  const wallAvoidAccel = cfg.acceleration * (enemy.aiState === 'cut_in' ? 0.72 : 0.5);
  if (body.pos.x >  limit) body.vel.x -= wallAvoidAccel * delta;
  if (body.pos.x < -limit) body.vel.x += wallAvoidAccel * delta;
  if (body.pos.z >  limit) body.vel.z -= wallAvoidAccel * delta;
  if (body.pos.z < -limit) body.vel.z += wallAvoidAccel * delta;

  // Friction, speed clamp, and position update handled by movementSystem
}

// RPM decay handled by rpmSystem in systems.ts

// ─── Visuals ─────────────────────────────────────────────────────────────────

export function updateEnemyVisuals(enemy: EnemySpinnerState, time: number, delta: number): void {
  if (!enemy.alive) return;

  const cfg  = enemy.config;
  const body = enemy.collidable;
  const { tiltGroup, bodyMat } = enemy.topResult;
  const rpmFrac = body.rpm / cfg.rpmCapacity;

  // Position sync
  tiltGroup.position.x = body.pos.x;
  tiltGroup.position.z = body.pos.z;

  // Shared tilt / wobble / spin / desaturation
  updateSpinnerVisuals(enemy, {
    vel: body.vel, maxSpeed: cfg.maxSpeed, spinSpeed: cfg.spinSpeed,
    rpmFrac, spinFrac: rpmFrac, baseColor: enemy.baseColor,
    tiltGroup, spinGroup: enemy.topResult.spinGroup, bodyMat,
  }, time, delta);

  // Enemy-specific emissive: critical pulse only (no hit flash or overcharge)
  if (enemy.aiState === 'cut_in') {
    const pulse = 0.65 + 0.35 * Math.sin(time * 11 * Math.PI * 2);
    bodyMat.emissive.copy(enemy.baseColor).multiplyScalar(0.55 + pulse * 0.75);
    bodyMat.emissiveIntensity = 0.55 + pulse * 0.35;
  } else if (rpmFrac < 0.25 && rpmFrac > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 8 * Math.PI * 2);
    const crit  = pulse * (1 - rpmFrac / 0.25) * 0.6;
    bodyMat.emissive.setRGB(crit * 0.3, crit * 0.3, crit);
    bodyMat.emissiveIntensity = crit;
  } else {
    bodyMat.emissiveIntensity = 0;
  }
}

// ─── Collision Callback ──────────────────────────────────────────────────────

export function onEnemyCollision(enemy: EnemySpinnerState): void {
  if (enemy.attackState === 'combo_chain' && enemy.comboBurstsRemaining > 0) {
    enemy.aiState = 'cut_in';
    enemy.comboPauseTimer = Math.max(enemy.comboPauseTimer, enemy.config.comboPauseDuration);
    enemy.cutInTimer = enemy.config.cutInDuration * 0.78;
    enemy.collidable.vel.x *= 0.3;
    enemy.collidable.vel.z *= 0.3;
    return;
  }

  if (enemy.aiState !== 'recover') {
    enemy.aiState       = 'recover';
    enemy.attackState   = 'idle';
    enemy.recoveryTimer = enemy.config.recoveryTime;
    enemy.cutInTimer    = 0;
    enemy.comboBurstsRemaining = 0;
    enemy.comboPauseTimer = 0;
  }
}

export function getEnemyComboLockDuration(enemy: EnemySpinnerState): number {
  return enemy.attackState === 'combo_chain' ? enemy.config.comboLockDuration : 0;
}

// ─── Death ───────────────────────────────────────────────────────────────────

export function isEnemyDead(enemy: EnemySpinnerState): boolean {
  return enemy.alive && enemy.collidable.rpm <= 0;
}

export function destroyEnemySpinner(enemy: EnemySpinnerState): void {
  enemy.alive = false;
  deregisterEntity(enemy.id);
  untagCollidable(enemy.collidable);
  scene.remove(enemy.topResult.tiltGroup);
  const idx = collidables.indexOf(enemy.collidable);
  if (idx !== -1) collidables.splice(idx, 1);
}
