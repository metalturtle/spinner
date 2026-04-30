import * as THREE from 'three';
import { scene } from './renderer';
import {
  RPM_SOFT_CAP_RATIO, RPM_HYPER_RATIO,
  COLLISION_DAMAGE_RATIO, RPM_OVERDRAIN, WALL_RPM_PENALTY,
} from './constants';
import { spinnerConfig } from './spinnerConfig';
import { collidables, isPointInFloorZone, zones, type Collidable, type CircleHit } from './physics';
import { createTop, TOP_BASE_RADIUS } from './top';
import { updateSpinnerVisuals, type SpinnerTiltState } from './spinnerVisuals';
import {
  nextEntityId, registerUpdate, registerMovement, registerRpm, setMovementMaxSpeed,
  tagCollidable, registerProximityBody, getCollidableType, type ProximityBody,
} from './systems';
import { keys, shiftHeld } from './input';

// ─── Constants ───────────────────────────────────────────────────────────────

const HIT_FLASH_DUR = 0.15;
const BODY_COLOR    = new THREE.Color(0xe94560);
const PIT_FALL_DURATION = 1.0;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isSpinnerDuelType(type: string | undefined): boolean {
  return type === 'enemy' || type === 'hive_flock';
}

function computeSpinnerDuelLoss(enemy: Collidable, impactForce: number): { playerLoss: number; enemyLoss: number } {
  const playerSpeed = Math.hypot(playerBody.vel.x, playerBody.vel.z);
  const enemySpeed = Math.hypot(enemy.vel.x, enemy.vel.z);
  const playerFrac = clamp(playerBody.rpm / Math.max(playerBody.rpmCapacity, 1), 0.05, 1.5);
  const enemyFrac = clamp(enemy.rpm / Math.max(enemy.rpmCapacity, 1), 0.05, 1.5);
  const rpmEdge = clamp(playerFrac - enemyFrac, -0.4, 0.4);
  const sharedCapacity = Math.sqrt(playerBody.rpmCapacity * enemy.rpmCapacity);
  const cappedImpact = clamp(impactForce, 0.65, spinnerConfig.duelImpactCap);
  const clashBase = COLLISION_DAMAGE_RATIO * sharedCapacity * cappedImpact;
  const playerIntent = clamp(playerSpeed / Math.max(spinnerConfig.duelSpeedReference, 0.001), 0, 1.35);
  const enemyIntent = clamp(enemySpeed / Math.max(spinnerConfig.duelSpeedReference, 0.001), 0, 1.35);
  const playerRpmMult = 1 + Math.max(0, rpmEdge) * spinnerConfig.duelRpmInfluenceScale;
  const enemyRpmMult = 1 + Math.max(0, -rpmEdge) * spinnerConfig.duelRpmInfluenceScale;
  const sharedLoss = clashBase * spinnerConfig.duelSharedDamageScale * (0.7 + Math.abs(rpmEdge) * 0.2);
  const playerAttack = clashBase * spinnerConfig.duelVelocityDamageScale * playerIntent * playerRpmMult;
  const enemyAttack = clashBase * spinnerConfig.duelVelocityDamageScale * enemyIntent * enemyRpmMult;
  const playerRecoil = clashBase * 0.03 * playerIntent;
  const enemyRecoil = clashBase * 0.03 * enemyIntent;
  const minLoss = Math.max(0.3, clashBase * 0.02);
  const maxLoss = clashBase * 1.6;

  return {
    playerLoss: clamp(sharedLoss + enemyAttack + playerRecoil, minLoss, maxLoss),
    enemyLoss: clamp(sharedLoss + playerAttack + enemyRecoil, minLoss, maxLoss),
  };
}

// ─── Player Body ─────────────────────────────────────────────────────────────

export const playerBody: Collidable = {
  pos:         { x: 0, z: 0 },
  vel:         { x: 0, z: 0 },
  radius:      spinnerConfig.radius,
  mass:        spinnerConfig.mass,
  isStatic:    false,
  rpm:         spinnerConfig.rpmCapacity * spinnerConfig.startingRpmRatio,
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

const topResult = createTop();
const { tiltGroup, spinGroup, bodyMat } = topResult;
scene.add(tiltGroup);

function syncPlayerTopScale(): void {
  spinGroup.scale.setScalar(spinnerConfig.radius / TOP_BASE_RADIUS);
}

syncPlayerTopScale();

// ─── Tilt / animation state ──────────────────────────────────────────────────

export const playerTilt: SpinnerTiltState = { tiltX: 0, tiltZ: 0 };
let hitFlashTimer  = 0;
let toppleProgress = 0;
let visualOffsetY  = 0;
let deathMode: 'none' | 'topple' | 'pit' = 'none';
let playerControlLocked = false;
let playerInvulnerable = false;
let playerImpactDamageMultiplier = 1;
export let playerId = 0;

// ─── Setup (call once at start and again after every reset) ──────────────────

export function setupPlayer(): void {
  playerId = nextEntityId();
  tagCollidable(playerBody, 'player');
  registerProximityBody('player', playerProximity);

  registerUpdate(playerId, (delta: number) => {
    if (playerControlLocked) {
      setMovementMaxSpeed(playerId, spinnerConfig.maxSpeed);
      return;
    }

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

export function resetPlayer(spawnPos: { x: number; z: number } = { x: 0, z: 0 }): void {
  playerBody.pos.x = spawnPos.x;  playerBody.pos.z = spawnPos.z;
  playerBody.vel.x = 0;  playerBody.vel.z = 0;
  playerBody.rpm         = spinnerConfig.rpmCapacity * spinnerConfig.startingRpmRatio;
  playerBody.rpmCapacity = spinnerConfig.rpmCapacity;
  playerBody.radius      = spinnerConfig.radius;
  playerProximity.radius = playerBody.radius;
  playerBody.mass        = spinnerConfig.mass;
  playerTilt.tiltX = 0;  playerTilt.tiltZ = 0;
  hitFlashTimer  = 0;
  toppleProgress = 0;
  visualOffsetY  = 0;
  deathMode      = 'none';
  playerControlLocked = false;
  playerInvulnerable = false;
  playerImpactDamageMultiplier = 1;
  syncPlayerTopScale();
  tiltGroup.position.set(spawnPos.x, 0, spawnPos.z);
  tiltGroup.rotation.set(0, 0, 0);
}

// ─── RPM Hooks (wall + zone + collision damage + overdrain) ──────────────────

export function playerRpmHooks(delta: number, playerWallHit: boolean, circleHits: CircleHit[]): void {
  // Sprint drain — only when actually moving
  const isMoving = keys.w || keys.s || keys.a || keys.d;
  if (!playerControlLocked && shiftHeld && isMoving && playerBody.rpm > 0) {
    playerBody.rpm -= spinnerConfig.sprintRpmDrain * delta;
  }

  if (playerInvulnerable) {
    playerBody.rpm = Math.max(0, playerBody.rpm);
    return;
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
    const enemyType = getCollidableType(enemy);
    if (isSpinnerDuelType(enemyType)) {
      const { playerLoss, enemyLoss } = computeSpinnerDuelLoss(enemy, hit.impactForce);
      playerBody.rpm = Math.max(0, playerBody.rpm - playerLoss);
      if (!enemy.isStatic) {
        enemy.rpm = Math.max(0, enemy.rpm - enemyLoss);
      }
      continue;
    }

    const safePlayerRpm = Math.max(0.01, playerBody.rpm);
    const safeEnemyRpm  = Math.max(0.01, enemy.rpm);

    const damage = COLLISION_DAMAGE_RATIO * enemy.rpmCapacity
      * hit.impactForce * (enemy.mass / playerBody.mass)
      * (safeEnemyRpm / safePlayerRpm) * enemy.heatFactor;

    const enemyDamage = COLLISION_DAMAGE_RATIO * playerBody.rpmCapacity
      * hit.impactForce * (playerBody.mass / enemy.mass)
      * (playerBody.rpm / safeEnemyRpm) * playerBody.heatFactor * playerImpactDamageMultiplier;

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

  playerBody.rpm = clamp(playerBody.rpm, 0, spinnerConfig.maxRpmCapacity);
}

export function addPlayerCapacity(amount: number): number {
  const prevCapacity = spinnerConfig.rpmCapacity;
  const nextCapacity = clamp(prevCapacity + amount, prevCapacity, spinnerConfig.maxRpmCapacity);
  const gained = nextCapacity - prevCapacity;
  if (gained <= 0) return 0;

  spinnerConfig.rpmCapacity = nextCapacity;
  playerBody.rpmCapacity = nextCapacity;
  playerBody.rpm += gained + spinnerConfig.growthPickupRpmGain;
  playerBody.rpm = clamp(playerBody.rpm, 0, spinnerConfig.maxRpmCapacity);
  return gained;
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
    tiltGroup, spinGroup, bodyMat, motionVisuals: topResult.motionVisuals,
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

export function setPlayerControlLocked(locked: boolean): void {
  playerControlLocked = locked;
  if (locked) {
    playerBody.vel.x = 0;
    playerBody.vel.z = 0;
  }
}

export function setPlayerInvulnerable(invulnerable: boolean): void {
  playerInvulnerable = invulnerable;
}

export function isPlayerInvulnerable(): boolean {
  return playerInvulnerable;
}

export function setPlayerImpactDamageMultiplier(multiplier: number): void {
  playerImpactDamageMultiplier = Math.max(1, multiplier);
}

export function getPlayerImpactDamageMultiplier(): number {
  return playerImpactDamageMultiplier;
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
