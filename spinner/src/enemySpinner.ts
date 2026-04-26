import * as THREE from 'three';
import { scene } from './renderer';
import { ARENA_SIZE, RPM_SOFT_CAP_RATIO } from './constants';
import { collidables, type Collidable, type Vec2 } from './physics';
import { createTop, type TopResult } from './top';
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

  // Visual
  color:         number;
}

export const ENEMY_SPINNER_TIER_1: EnemySpinnerConfig = {
  rpmCapacity:   120,
  rpmDecayRate:  0.0,      // ~30% of player's 1.0
  rpmSpeedDrain: 0.2,
  radius:        0.5,
  mass:          1.0,
  maxSpeed:      12,       // slightly slower than player (15)
  acceleration:  18,       // slightly less than player (25)
  friction:      0.97,
  spinSpeed:     36,

  heatFactor:    1.0,

  chargeRange:   6.0,
  chargeBoost:   1.8,
  recoveryTime:  0.8,
  wallAvoidDist: 3.0,

  color:         0x4466cc, // blue
};

// ─── Types ───────────────────────────────────────────────────────────────────

type AIState = 'chase' | 'charge' | 'recover';

export interface EnemySpinnerState extends SpinnerTiltState {
  id:            number;
  config:        EnemySpinnerConfig;
  collidable:    Collidable;
  topResult:     TopResult;
  baseColor:     THREE.Color;
  alive:         boolean;
  aiState:       AIState;
  recoveryTimer: number;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createEnemySpinner(pos: Vec2, config: EnemySpinnerConfig): EnemySpinnerState {
  const topResult = createTop(config.color);
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
    aiState:       'chase',
    recoveryTimer: 0,
    tiltX:         0,
    tiltZ:         0,
  };
}

// ─── AI Movement (call BEFORE runCollisions) ─────────────────────────────────

export function updateEnemyAI(
  enemy:     EnemySpinnerState,
  playerPos: Vec2,
  delta:     number
): void {
  if (!enemy.alive) return;

  const cfg  = enemy.config;
  const body = enemy.collidable;

  // ── Recovery: coast on inertia, no steering ──
  // Movement system handles friction + position update every frame.
  if (enemy.aiState === 'recover') {
    enemy.recoveryTimer -= delta;
    if (enemy.recoveryTimer <= 0) enemy.aiState = 'chase';
    return;
  }

  // ── Direction toward player ──
  const dx   = playerPos.x - body.pos.x;
  const dz   = playerPos.z - body.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  let accel = cfg.acceleration;

  if (dist < cfg.chargeRange) {
    enemy.aiState = 'charge';
    accel *= cfg.chargeBoost;
  } else {
    enemy.aiState = 'chase';
  }

  // Steer toward player
  if (dist > 0.1) {
    const invDist = 1 / dist;
    body.vel.x += dx * invDist * accel * delta;
    body.vel.z += dz * invDist * accel * delta;
  }

  // ── Wall avoidance — gentle repulsion near edges ──
  const limit = ARENA_SIZE - cfg.wallAvoidDist;
  if (body.pos.x >  limit) body.vel.x -= accel * delta * 0.5;
  if (body.pos.x < -limit) body.vel.x += accel * delta * 0.5;
  if (body.pos.z >  limit) body.vel.z -= accel * delta * 0.5;
  if (body.pos.z < -limit) body.vel.z += accel * delta * 0.5;

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
  if (rpmFrac < 0.25 && rpmFrac > 0) {
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
  if (enemy.aiState !== 'recover') {
    enemy.aiState       = 'recover';
    enemy.recoveryTimer = enemy.config.recoveryTime;
  }
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
