import * as THREE from 'three';
import { scene } from './renderer';
import {
  RPM_SOFT_CAP_RATIO, RPM_HYPER_RATIO,
  COLLISION_DAMAGE_RATIO, RPM_OVERDRAIN, WALL_RPM_PENALTY,
} from './constants';
import { spinnerConfig } from './spinnerConfig';
import { collidables, isPointInFloorZone, zones, type Collidable, type CircleHit } from './physics';
import { createTop } from './top';
import { updateSpinnerVisuals, type SpinnerTiltState } from './spinnerVisuals';
import {
  nextEntityId, registerUpdate, registerMovement, registerRpm, setMovementMaxSpeed,
  tagCollidable, registerProximityBody, type ProximityBody,
} from './systems';
import { keys, shiftHeld } from './input';

// ─── Constants ───────────────────────────────────────────────────────────────

const HIT_FLASH_DUR = 0.15;
const BODY_COLOR    = new THREE.Color(0xe94560);
const PIT_FALL_DURATION = 1.0;

// ─── Player Body ─────────────────────────────────────────────────────────────

export const playerBody: Collidable = {
  pos:         { x: 0, z: 0 },
  vel:         { x: 0, z: 0 },
  radius:      spinnerConfig.radius,
  mass:        spinnerConfig.mass,
  isStatic:    false,
  rpm:         spinnerConfig.rpmCapacity * RPM_SOFT_CAP_RATIO,
  rpmCapacity: spinnerConfig.rpmCapacity,
  heatFactor:  1.0,
};
collidables.push(playerBody);

export const playerProximity: ProximityBody = {
  pos:    playerBody.pos,
  radius: playerBody.radius,
  active: true,
  owner:  playerBody,
};

// ─── Mesh ────────────────────────────────────────────────────────────────────

const { tiltGroup, spinGroup, bodyMat } = createTop();
scene.add(tiltGroup);

// ─── Tilt / animation state ──────────────────────────────────────────────────

export const playerTilt: SpinnerTiltState = { tiltX: 0, tiltZ: 0 };
let hitFlashTimer  = 0;
let toppleProgress = 0;
let visualOffsetY  = 0;
let deathMode: 'none' | 'topple' | 'pit' = 'none';
export let playerId = 0;

// ─── Setup (call once at start and again after every reset) ──────────────────

export function setupPlayer(): void {
  playerId = nextEntityId();
  tagCollidable(playerBody, 'player');
  registerProximityBody('player', playerProximity);

  registerUpdate(playerId, (delta: number) => {
    const sprinting = shiftHeld && playerBody.rpm > 0;
    const accel = spinnerConfig.acceleration * (sprinting ? spinnerConfig.sprintAccelMult : 1.0);
    const maxSpd = spinnerConfig.maxSpeed    * (sprinting ? spinnerConfig.sprintSpeedMult : 1.0);

    if (keys.w) playerBody.vel.z -= accel * delta;
    if (keys.s) playerBody.vel.z += accel * delta;
    if (keys.a) playerBody.vel.x -= accel * delta;
    if (keys.d) playerBody.vel.x += accel * delta;

    setMovementMaxSpeed(playerId, maxSpd);
  });

  registerMovement(playerId, playerBody, spinnerConfig.maxSpeed, spinnerConfig.friction);
  registerRpm(playerId, playerBody, spinnerConfig.rpmDecayRate, spinnerConfig.rpmSpeedDrain);
}

// ─── Reset ───────────────────────────────────────────────────────────────────

export function resetPlayer(): void {
  playerBody.pos.x = 0;  playerBody.pos.z = 0;
  playerBody.vel.x = 0;  playerBody.vel.z = 0;
  playerBody.rpm         = spinnerConfig.rpmCapacity * RPM_SOFT_CAP_RATIO;
  playerBody.rpmCapacity = spinnerConfig.rpmCapacity;
  playerBody.radius      = spinnerConfig.radius;
  playerBody.mass        = spinnerConfig.mass;
  playerTilt.tiltX = 0;  playerTilt.tiltZ = 0;
  hitFlashTimer  = 0;
  toppleProgress = 0;
  visualOffsetY  = 0;
  deathMode      = 'none';
  tiltGroup.position.set(0, 0, 0);
  tiltGroup.rotation.set(0, 0, 0);
}

// ─── RPM Hooks (wall + zone + collision damage + overdrain) ──────────────────

export function playerRpmHooks(delta: number, playerWallHit: boolean, circleHits: CircleHit[]): void {
  // Sprint drain — only when actually moving
  const isMoving = keys.w || keys.s || keys.a || keys.d;
  if (shiftHeld && isMoving && playerBody.rpm > 0) {
    playerBody.rpm -= spinnerConfig.sprintRpmDrain * delta;
  }

  // Wall penalty
  if (playerWallHit) {
    // playerBody.rpm -= WALL_RPM_PENALTY;
    hitFlashTimer = HIT_FLASH_DUR;
  }

  // Floor zone drain
  for (const zone of zones) {
    if (isPointInFloorZone(playerBody.pos, zone)) {
      playerBody.rpm -= zone.drainRate * delta;
    }
  }

  // RPM collision damage (bidirectional — centralized here, not per-entity pair)
  for (const hit of circleHits) {
    const playerIsA = hit.i === 0;
    const playerIsB = hit.j === 0;
    if (!playerIsA && !playerIsB) continue;

    const enemy = collidables[playerIsA ? hit.j : hit.i];
    const safePlayerRpm = Math.max(0.01, playerBody.rpm);
    const safeEnemyRpm  = Math.max(0.01, enemy.rpm);

    const damage = COLLISION_DAMAGE_RATIO * enemy.rpmCapacity
      * hit.impactForce * (enemy.mass / playerBody.mass)
      * (safeEnemyRpm / safePlayerRpm) * enemy.heatFactor;

    const enemyDamage = COLLISION_DAMAGE_RATIO * playerBody.rpmCapacity
      * hit.impactForce * (playerBody.mass / enemy.mass)
      * (playerBody.rpm / safeEnemyRpm) * playerBody.heatFactor;

    playerBody.rpm = Math.max(0, playerBody.rpm - damage);
    if (!enemy.isStatic) {
      enemy.rpm = Math.max(0, enemy.rpm - enemyDamage);
    }
  }

  // Overdrain above soft cap
  const softCap = spinnerConfig.rpmCapacity * RPM_SOFT_CAP_RATIO;
  if (playerBody.rpm > softCap) {
    playerBody.rpm -= RPM_OVERDRAIN * delta;
  }

  playerBody.rpm = Math.max(0, playerBody.rpm);
}

// ─── Visuals ─────────────────────────────────────────────────────────────────

export function updatePlayerVisuals(time: number, delta: number): void {
  const cap         = spinnerConfig.rpmCapacity;
  const softCap     = cap * RPM_SOFT_CAP_RATIO;
  const hyperMax    = cap * RPM_HYPER_RATIO;
  const overcharged = playerBody.rpm > softCap;
  const rpmFraction = playerBody.rpm / cap;
  const normalFrac  = Math.min(playerBody.rpm, softCap) / softCap;

  tiltGroup.position.x = playerBody.pos.x;
  tiltGroup.position.y = visualOffsetY;
  tiltGroup.position.z = playerBody.pos.z;

  const spinFrac = overcharged ? playerBody.rpm / softCap : rpmFraction;
  updateSpinnerVisuals(playerTilt, {
    vel: playerBody.vel, maxSpeed: spinnerConfig.maxSpeed, spinSpeed: spinnerConfig.spinSpeed,
    rpmFrac: normalFrac, spinFrac, baseColor: BODY_COLOR,
    tiltGroup, spinGroup, bodyMat,
  }, time, delta);

  // Player-specific emissive
  if (hitFlashTimer > 0) {
    hitFlashTimer -= delta;
    const intensity = Math.max(0, hitFlashTimer / HIT_FLASH_DUR);
    bodyMat.emissive.setRGB(intensity, intensity * 0.3, 0);
    bodyMat.emissiveIntensity = intensity;
  } else if (overcharged) {
    const overFrac = Math.min(1, (playerBody.rpm - softCap) / (hyperMax - softCap));
    const pulse    = 0.6 + 0.4 * Math.sin(time * 6 * Math.PI * 2);
    bodyMat.emissive.setRGB(0, pulse * overFrac, pulse * overFrac);
    bodyMat.emissiveIntensity = 0.8 + overFrac * 0.8;
  } else if (normalFrac < 0.25) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 8 * Math.PI * 2);
    const critIntensity = pulse * (1 - normalFrac / 0.25) * 0.8;
    bodyMat.emissive.setRGB(critIntensity, 0, 0);
    bodyMat.emissiveIntensity = critIntensity;
  } else {
    bodyMat.emissiveIntensity = 0;
  }
}

// ─── External Hit Notification (e.g. projectile damage from turret) ──────────

export function notifyHit(): void {
  hitFlashTimer = HIT_FLASH_DUR;
}

// ─── Topple (game-over animation) ────────────────────────────────────────────

export function startPlayerToppleDeath(): void {
  toppleProgress = 0;
  visualOffsetY = 0;
  deathMode = 'topple';
}

export function startPlayerPitFallDeath(): void {
  toppleProgress = 0;
  visualOffsetY = 0;
  deathMode = 'pit';
  playerBody.vel.x = 0;
  playerBody.vel.z = 0;
}

export function updateTopple(delta: number): boolean {
  if (deathMode === 'pit') {
    toppleProgress = Math.min(1, toppleProgress + delta / PIT_FALL_DURATION);
    const ease = 1 - Math.pow(1 - toppleProgress, 3);
    tiltGroup.rotation.x = ease * 0.55;
    tiltGroup.rotation.z = ease * (Math.PI / 2.6);
    visualOffsetY = -6 * ease;
    tiltGroup.position.y = visualOffsetY;
    spinGroup.rotation.y += (0.5 + ease * 8.0) * delta;
    return toppleProgress >= 1;
  }

  toppleProgress = Math.min(1, toppleProgress + delta * 1.5);
  const ease = 1 - Math.pow(1 - toppleProgress, 3);
  tiltGroup.rotation.z = ease * (Math.PI / 2);
  tiltGroup.position.y = visualOffsetY;
  spinGroup.rotation.y += 0.5 * delta;
  return toppleProgress >= 1;
}
