import * as THREE from 'three';
import { scene } from './renderer';
import { ARENA_SIZE, RPM_SOFT_CAP_RATIO } from './constants';
import { collidables, type Collidable, type Vec2 } from './physics';
import { createTop, type TopResult } from './top';
import { releaseAuraLight } from './auraLightPool';
import { updateSpinnerVisuals, type SpinnerTiltState } from './spinnerVisuals';
import { createHpBar, updateHpBar } from './hpBar';
import {
  nextEntityId, registerMovement, registerRpm,
  setMovementMaxSpeed,
  tagCollidable, untagCollidable, deregisterEntity,
} from './systems';

// ─── Config ─────────────────────────────────────────────────────────────────

export interface HiveConfig {
  // Core
  coreHp:           number;  // HP not RPM
  coreRadius:       number;
  coreMass:         number;
  coreMaxSpeed:     [number, number, number, number]; // per phase
  coreAcceleration: number;
  coreFriction:     number;
  coreHeatFactor:   number;

  // Chaingun
  chaingunFireRate:  [number, number, number, number]; // seconds between shots per phase
  chaingunBurstSize: number;  // shots per burst
  chaingunBurstDelay: number; // delay between bursts
  chaingunProjSpeed: number;
  chaingunProjDamage: number;
  chaingunSpread:    number;  // radians of random spread

  // Flock
  flockCount:       number;
  flockRpmCapacity: number;
  flockRpmDecay:    number;
  flockRpmSpeedDrain: number;
  flockRadius:      number;
  flockMass:        number;
  flockMaxSpeed:    number;
  flockAcceleration: number;
  flockFriction:    number;
  flockOrbitRadius: number;
  flockOrbitSpeed:  number;  // base angular velocity (rad/s)
  flockHeatFactor:  number;
  flockSpinSpeed:   number;

  // Visual
  coreColor:        number;
  flockColor:       number;
  rageColor:        number;
}

export const HIVE_TIER_1: HiveConfig = {
  coreHp:           80,
  coreRadius:       0.8,
  coreMass:         3.0,
  coreMaxSpeed:     [5, 6, 8, 14],
  coreAcceleration: 12,
  coreFriction:     0.96,
  coreHeatFactor:   0.3,

  chaingunFireRate:  [0.5, 0.35, 0.25, 0.12],
  chaingunBurstSize: 3,
  chaingunBurstDelay: 1.5,
  chaingunProjSpeed: 32,
  chaingunProjDamage: 5,
  chaingunSpread:    0.08,

  flockCount:       5,
  flockRpmCapacity: 80,
  flockRpmDecay:    0.0,
  flockRpmSpeedDrain: 0.15,
  flockRadius:      0.45,
  flockMass:        0.8,
  flockMaxSpeed:    14,
  flockAcceleration: 22,
  flockFriction:    0.96,
  flockOrbitRadius: 3.5,
  flockOrbitSpeed:  1.2,
  flockHeatFactor:  0.8,
  flockSpinSpeed:   40,

  coreColor:        0x993366,
  flockColor:       0xcc6699,
  rageColor:        0xff2200,
};

// ─── Flock Spinner State ────────────────────────────────────────────────────

type FlockAIState = 'orbit' | 'recover';

export interface FlockSpinner extends SpinnerTiltState {
  id:            number;
  collidable:    Collidable;
  topResult:     TopResult;
  baseColor:     THREE.Color;
  alive:         boolean;
  targetAngle:   number;
  orbitOffset:   number;    // small random offset for organic feel
  aiState:       FlockAIState;
  recoveryTimer: number;
}

// ─── Hive Boss State ────────────────────────────────────────────────────────

export interface HiveBossState {
  id:              number;
  config:          HiveConfig;
  collidable:      Collidable;        // core collidable
  coreGroup:       THREE.Group;       // root group for the core visual
  bodyMat:         THREE.MeshStandardMaterial;
  barrelPivot:     THREE.Group;
  barrelAngle:     number;
  hpBarFill:       THREE.Mesh;
  hp:              number;
  maxHp:           number;
  alive:           boolean;
  flock:           FlockSpinner[];
  baseOrbitRotation: number;          // global orbit angle, increases over time
  phase:           number;
  burstCount:      number;            // shots remaining in current burst
  fireCooldown:    number;
  coreBaseColor:   THREE.Color;
}

// ─── Fire Event ─────────────────────────────────────────────────────────────

export interface HiveFireEvent {
  firePos: Vec2;
  fireDir: Vec2;
  speed:   number;
  damage:  number;
}

// ─── Phase Calculation ──────────────────────────────────────────────────────

function getHivePhase(boss: HiveBossState): number {
  const alive = boss.flock.filter(f => f.alive).length;
  if (alive >= boss.config.flockCount - 1) return 0;  // full swarm
  if (alive >= 2) return 1;  // thinning
  if (alive >= 1) return 2;  // exposed
  return 3;  // rage
}

// ─── Recalculate Flock Angles ───────────────────────────────────────────────

function recalcFlockAngles(boss: HiveBossState): void {
  const alive = boss.flock.filter(f => f.alive);
  for (let i = 0; i < alive.length; i++) {
    alive[i].targetAngle = (i / alive.length) * Math.PI * 2;
  }
}

// ─── Core Visual Construction ───────────────────────────────────────────────

function buildCoreVisual(config: HiveConfig): {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  barrelPivot: THREE.Group;
} {
  const group = new THREE.Group();

  // Octahedron body
  const bodyMat = new THREE.MeshStandardMaterial({
    color: config.coreColor, roughness: 0.35, metalness: 0.7,
  });
  const bodyMesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.6, 0),
    bodyMat,
  );
  bodyMesh.position.y = 0.8;
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // Base ring — decorative
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x664455, roughness: 0.3, metalness: 0.8,
  });
  const ringMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.06, 8, 24),
    ringMat,
  );
  ringMesh.position.y = 0.8;
  ringMesh.rotation.x = Math.PI / 2;
  group.add(ringMesh);

  // Barrel pivot (chaingun mounted on body front)
  const barrelPivot = new THREE.Group();
  barrelPivot.position.set(0, 0.8, 0);
  group.add(barrelPivot);

  const cannonMat = new THREE.MeshStandardMaterial({
    color: 0x556677, roughness: 0.3, metalness: 0.9,
  });
  const cannonBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.10, 0.5, 8),
    cannonMat,
  );
  cannonBody.rotation.x = Math.PI / 2;
  cannonBody.position.z = 0.45;
  barrelPivot.add(cannonBody);

  // Cannon tip glow
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xff6600, emissive: 0xff6600, emissiveIntensity: 0.0,
    roughness: 0.2, metalness: 0.4,
  });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), tipMat);
  tip.position.z = 0.75;
  barrelPivot.add(tip);

  return { group, bodyMat, barrelPivot };
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createHiveBoss(pos: Vec2, config: HiveConfig): HiveBossState {
  // ── Core visual ──
  const { group: coreGroup, bodyMat, barrelPivot } = buildCoreVisual(config);
  coreGroup.position.set(pos.x, 0, pos.z);
  scene.add(coreGroup);

  // HP bar for core
  const { bg, fill } = createHpBar(1.6, 0.12, 2.2);
  coreGroup.add(bg);
  coreGroup.add(fill);

  // Core collidable — HP-based, NOT RPM
  // Fake rpm/rpmCapacity so playerRpmHooks damage formula works
  const rpmCapacity = 100;
  const coreCol: Collidable = {
    pos:         { x: pos.x, z: pos.z },
    vel:         { x: 0, z: 0 },
    radius:      config.coreRadius,
    mass:        config.coreMass,
    isStatic:    false,
    rpm:         rpmCapacity * 0.7,
    rpmCapacity,
    heatFactor:  config.coreHeatFactor,
  };
  collidables.push(coreCol);

  const coreId = nextEntityId();
  registerMovement(coreId, coreCol, config.coreMaxSpeed[0], config.coreFriction);
  // Do NOT registerRpm — core uses HP, not RPM
  tagCollidable(coreCol, 'hive_core');

  // ── Flock spinners ──
  const flock: FlockSpinner[] = [];
  for (let i = 0; i < config.flockCount; i++) {
    const angle = (i / config.flockCount) * Math.PI * 2;
    const spawnX = pos.x + Math.sin(angle) * config.flockOrbitRadius;
    const spawnZ = pos.z + Math.cos(angle) * config.flockOrbitRadius;

    const topResult = createTop(config.flockColor);
    const scale = config.flockRadius / 0.5;
    topResult.spinGroup.scale.set(scale, scale, scale);
    topResult.tiltGroup.position.set(spawnX, 0, spawnZ);
    scene.add(topResult.tiltGroup);

    const flockCol: Collidable = {
      pos:         { x: spawnX, z: spawnZ },
      vel:         { x: 0, z: 0 },
      radius:      config.flockRadius,
      mass:        config.flockMass,
      isStatic:    false,
      rpm:         config.flockRpmCapacity * RPM_SOFT_CAP_RATIO,
      rpmCapacity: config.flockRpmCapacity,
      heatFactor:  config.flockHeatFactor,
    };
    collidables.push(flockCol);

    const flockId = nextEntityId();
    registerMovement(flockId, flockCol, config.flockMaxSpeed, config.flockFriction);
    registerRpm(flockId, flockCol, config.flockRpmDecay, config.flockRpmSpeedDrain);
    tagCollidable(flockCol, 'hive_flock');

    flock.push({
      id:            flockId,
      collidable:    flockCol,
      topResult,
      baseColor:     new THREE.Color(config.flockColor),
      alive:         true,
      targetAngle:   angle,
      orbitOffset:   (Math.random() - 0.5) * 0.4,
      aiState:       'orbit',
      recoveryTimer: 0,
      tiltX:         0,
      tiltZ:         0,
    });
  }

  const boss: HiveBossState = {
    id:              coreId,
    config,
    collidable:      coreCol,
    coreGroup,
    bodyMat,
    barrelPivot,
    barrelAngle:     0,
    hpBarFill:       fill,
    hp:              config.coreHp,
    maxHp:           config.coreHp,
    alive:           true,
    flock,
    baseOrbitRotation: 0,
    phase:           0,
    burstCount:      config.chaingunBurstSize,
    fireCooldown:    config.chaingunFireRate[0],
    coreBaseColor:   new THREE.Color(config.coreColor),
  };
  coreCol.owner = boss;
  for (const spinner of flock) spinner.collidable.owner = { boss, spinner };
  return boss;
}

// ─── AI (call in entity update phase, before movementSystem) ────────────────

export function updateHiveAI(
  boss:      HiveBossState,
  playerPos: Vec2,
  delta:     number,
): void {
  if (!boss.alive) return;

  const cfg   = boss.config;
  const body  = boss.collidable;
  const phase = getHivePhase(boss);

  // Update phase and adjust core max speed
  if (phase !== boss.phase) {
    boss.phase = phase;
    setMovementMaxSpeed(boss.id, cfg.coreMaxSpeed[phase]);
  }

  // Advance orbit rotation
  boss.baseOrbitRotation += cfg.flockOrbitSpeed * delta;

  // ── Core AI ──
  const dx   = playerPos.x - body.pos.x;
  const dz   = playerPos.z - body.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const accel = cfg.coreAcceleration;

  if (phase < 3) {
    // Phase 0-2: maintain a preferred engagement range
    // Backs off when player is close, drifts closer when player is far
    const preferredDist = 8 - phase * 1.5;   // 8 → 6.5 → 5 as phases advance
    const rangeDiff = dist - preferredDist;
    const radialAccel = Math.sign(rangeDiff) * Math.min(Math.abs(rangeDiff) * 1.5, accel * 0.7);
    if (dist > 0.1) {
      const inv = 1 / dist;
      body.vel.x += dx * inv * radialAccel * delta;
      body.vel.z += dz * inv * radialAccel * delta;
    }
  } else {
    // Phase 3 (rage): chase the player aggressively
    if (dist > 0.1) {
      const inv = 1 / dist;
      body.vel.x += dx * inv * accel * 1.5 * delta;
      body.vel.z += dz * inv * accel * 1.5 * delta;
    }
  }

  // Wall avoidance
  const limit = ARENA_SIZE - 2.5;
  const wallAccel = accel * 0.6;
  if (body.pos.x >  limit) body.vel.x -= wallAccel * delta;
  if (body.pos.x < -limit) body.vel.x += wallAccel * delta;
  if (body.pos.z >  limit) body.vel.z -= wallAccel * delta;
  if (body.pos.z < -limit) body.vel.z += wallAccel * delta;

  // ── Flock spinner AI ──
  for (const spinner of boss.flock) {
    if (!spinner.alive) continue;

    const fBody = spinner.collidable;

    // Recovery: coast on inertia, no steering
    if (spinner.aiState === 'recover') {
      spinner.recoveryTimer -= delta;
      if (spinner.recoveryTimer <= 0) spinner.aiState = 'orbit';
      continue;
    }

    // Compute target orbit position around the core
    const orbitAngle = spinner.targetAngle + boss.baseOrbitRotation + spinner.orbitOffset;
    const targetX = body.pos.x + Math.sin(orbitAngle) * cfg.flockOrbitRadius;
    const targetZ = body.pos.z + Math.cos(orbitAngle) * cfg.flockOrbitRadius;

    // Accelerate toward orbit slot
    const fdx = targetX - fBody.pos.x;
    const fdz = targetZ - fBody.pos.z;
    const fDist = Math.sqrt(fdx * fdx + fdz * fdz);

    if (fDist > 0.1) {
      const inv = 1 / fDist;
      fBody.vel.x += fdx * inv * cfg.flockAcceleration * delta;
      fBody.vel.z += fdz * inv * cfg.flockAcceleration * delta;
    }

    // Wall avoidance for flock spinners
    const fLimit = ARENA_SIZE - 2.0;
    const fWallAccel = cfg.flockAcceleration * 0.5;
    if (fBody.pos.x >  fLimit) fBody.vel.x -= fWallAccel * delta;
    if (fBody.pos.x < -fLimit) fBody.vel.x += fWallAccel * delta;
    if (fBody.pos.z >  fLimit) fBody.vel.z -= fWallAccel * delta;
    if (fBody.pos.z < -fLimit) fBody.vel.z += fWallAccel * delta;
  }
}

// ─── Chaingun (returns fire events for game.ts) ─────────────────────────────

export function updateHiveChaingun(
  boss:      HiveBossState,
  playerPos: Vec2,
  playerVel: Vec2,
  delta:     number,
): HiveFireEvent[] {
  if (!boss.alive) return [];

  const cfg    = boss.config;
  const body   = boss.collidable;
  const phase  = boss.phase;
  const events: HiveFireEvent[] = [];

  // Cooldown
  boss.fireCooldown -= delta;
  if (boss.fireCooldown > 0) return events;

  if (boss.burstCount > 0) {
    // Fire a shot
    boss.burstCount--;
    boss.fireCooldown = cfg.chaingunFireRate[phase];

    // Predictive aim toward player
    const dx   = playerPos.x - body.pos.x;
    const dz   = playerPos.z - body.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.1) return events;

    const T     = dist / cfg.chaingunProjSpeed;
    const predX = playerPos.x + playerVel.x * T;
    const predZ = playerPos.z + playerVel.z * T;
    const aimDx = predX - body.pos.x;
    const aimDz = predZ - body.pos.z;
    const aimLen = Math.sqrt(aimDx * aimDx + aimDz * aimDz);
    if (aimLen < 0.1) return events;

    // Apply random spread
    const baseAngle = Math.atan2(aimDx, aimDz);
    const spread = (Math.random() - 0.5) * cfg.chaingunSpread;
    const finalAngle = baseAngle + spread;

    const fireDir = { x: Math.sin(finalAngle), z: Math.cos(finalAngle) };
    const firePos = {
      x: body.pos.x + fireDir.x * (cfg.coreRadius + 0.2),
      z: body.pos.z + fireDir.z * (cfg.coreRadius + 0.2),
    };

    events.push({
      firePos,
      fireDir,
      speed:  cfg.chaingunProjSpeed,
      damage: cfg.chaingunProjDamage,
    });
  }

  // Reset burst when empty
  if (boss.burstCount <= 0) {
    boss.fireCooldown = cfg.chaingunBurstDelay;
    boss.burstCount   = cfg.chaingunBurstSize;
  }

  return events;
}

// ─── Sync Flock Positions (after movementSystem, before runCollisions) ──────
//
// Flock spinners move independently via their own collidables + movement
// system. This is a light leash check — if a spinner strays too far from
// the core it gets gently pulled back.

export function syncFlockPositions(boss: HiveBossState): void {
  if (!boss.alive) return;

  const cfg  = boss.config;
  const core = boss.collidable;
  const maxLeash = cfg.flockOrbitRadius * 2.0;

  for (const spinner of boss.flock) {
    if (!spinner.alive) continue;

    const dx = spinner.collidable.pos.x - core.pos.x;
    const dz = spinner.collidable.pos.z - core.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > maxLeash && dist > 0) {
      // Gently pull back toward core
      const overshoot = dist - maxLeash;
      const inv = 1 / dist;
      spinner.collidable.pos.x -= dx * inv * overshoot * 0.5;
      spinner.collidable.pos.z -= dz * inv * overshoot * 0.5;
    }
  }
}

// ─── Visuals ────────────────────────────────────────────────────────────────

export function updateHiveVisuals(
  boss:      HiveBossState,
  playerPos: Vec2,
  time:      number,
  delta:     number,
): void {
  if (!boss.alive) return;

  const cfg   = boss.config;
  const body  = boss.collidable;
  const phase = boss.phase;

  // ── Core visual sync ──
  boss.coreGroup.position.x = body.pos.x;
  boss.coreGroup.position.z = body.pos.z;

  // Slow rotation of the octahedron body
  const octahedron = boss.coreGroup.children[0] as THREE.Mesh;
  if (octahedron) {
    octahedron.rotation.y += delta * 0.8;
  }

  // Core HP bar
  updateHpBar(boss.hpBarFill, boss.hp / boss.maxHp, 0.8);

  // Barrel aims at player
  const dx = playerPos.x - body.pos.x;
  const dz = playerPos.z - body.pos.z;
  const targetBarrel = Math.atan2(dx, dz);
  let barrelDiff = targetBarrel - boss.barrelAngle;
  while (barrelDiff >  Math.PI) barrelDiff -= 2 * Math.PI;
  while (barrelDiff < -Math.PI) barrelDiff += 2 * Math.PI;
  boss.barrelAngle += Math.sign(barrelDiff) * Math.min(Math.abs(barrelDiff), 4.0 * delta);
  boss.barrelPivot.rotation.y = boss.barrelAngle;

  // Cannon tip glow — pulses faster in later phases
  const tipMesh = boss.barrelPivot.children[1] as THREE.Mesh | undefined;
  if (tipMesh) {
    const tipRate = 2 + phase * 2;
    const tipGlow = 0.3 + 0.3 * Math.sin(time * tipRate * Math.PI * 2);
    (tipMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = tipGlow * (phase + 1) * 0.3;
  }

  // Phase-driven emissive
  if (phase === 3) {
    // Rage: pulsing red glow
    const pulse = 0.5 + 0.5 * Math.sin(time * 8 * Math.PI * 2);
    const rageColor = new THREE.Color(cfg.rageColor);
    boss.bodyMat.emissive.copy(rageColor).multiplyScalar(pulse);
    boss.bodyMat.emissiveIntensity = 0.6 + pulse * 0.8;
    boss.bodyMat.color.copy(boss.coreBaseColor).lerp(rageColor, 0.4 + pulse * 0.3);
  } else if (phase === 2) {
    const pulse = 0.3 + 0.2 * Math.sin(time * 5 * Math.PI * 2);
    boss.bodyMat.emissive.setRGB(pulse * 0.6, pulse * 0.1, 0);
    boss.bodyMat.emissiveIntensity = pulse;
    boss.bodyMat.color.copy(boss.coreBaseColor);
  } else if (phase === 1) {
    const pulse = 0.1 + 0.1 * Math.sin(time * 3 * Math.PI * 2);
    boss.bodyMat.emissive.setRGB(pulse * 0.3, pulse * 0.1, pulse * 0.2);
    boss.bodyMat.emissiveIntensity = pulse;
    boss.bodyMat.color.copy(boss.coreBaseColor);
  } else {
    boss.bodyMat.emissiveIntensity = 0;
    boss.bodyMat.color.copy(boss.coreBaseColor);
  }

  // ── Flock spinner visuals ──
  for (const spinner of boss.flock) {
    if (!spinner.alive) continue;

    const fBody = spinner.collidable;
    const { tiltGroup, spinGroup, bodyMat } = spinner.topResult;
    const rpmFrac = fBody.rpm / cfg.flockRpmCapacity;

    // Position sync
    tiltGroup.position.x = fBody.pos.x;
    tiltGroup.position.z = fBody.pos.z;

    // Shared tilt / wobble / spin / desaturation
    updateSpinnerVisuals(spinner, {
      vel:       fBody.vel,
      maxSpeed:  cfg.flockMaxSpeed,
      spinSpeed: cfg.flockSpinSpeed,
      rpmFrac,
      spinFrac:  rpmFrac,
      baseColor: spinner.baseColor,
      tiltGroup,
      spinGroup,
      bodyMat,
    }, time, delta);

    // Critical pulse when low RPM
    if (rpmFrac < 0.25 && rpmFrac > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 8 * Math.PI * 2);
      const crit  = pulse * (1 - rpmFrac / 0.25) * 0.6;
      bodyMat.emissive.setRGB(crit * 0.3, crit * 0.3, crit);
      bodyMat.emissiveIntensity = crit;
    } else {
      bodyMat.emissiveIntensity = 0;
    }
  }
}

// ─── Flock Collision Callback ───────────────────────────────────────────────

export function onFlockCollision(spinner: FlockSpinner): void {
  if (spinner.aiState !== 'recover') {
    spinner.aiState       = 'recover';
    spinner.recoveryTimer = 0.5;
  }
}

// ─── Flock Death Check ──────────────────────────────────────────────────────

export function isFlockSpinnerDead(spinner: FlockSpinner): boolean {
  return spinner.alive && spinner.collidable.rpm <= 0;
}

// ─── Flock Destroy ──────────────────────────────────────────────────────────

export function destroyFlockSpinner(boss: HiveBossState, spinner: FlockSpinner): void {
  spinner.alive = false;
  deregisterEntity(spinner.id);
  untagCollidable(spinner.collidable);
  if (spinner.topResult.motionVisuals) {
    releaseAuraLight(spinner.topResult.motionVisuals.auraLight);
  }
  scene.remove(spinner.topResult.tiltGroup);
  const idx = collidables.indexOf(spinner.collidable);
  if (idx !== -1) collidables.splice(idx, 1);

  // Recalculate surviving spinners' orbit slots
  recalcFlockAngles(boss);
}

// ─── Core HP Damage ─────────────────────────────────────────────────────────

/** Apply HP damage to the hive core. Returns true if boss died. */
export function applyDamageToHiveCore(boss: HiveBossState, damage: number): boolean {
  boss.hp = Math.max(0, boss.hp - damage);
  updateHpBar(boss.hpBarFill, boss.hp / boss.maxHp, 0.8);
  return boss.hp <= 0;
}

// ─── Boss Death Check ───────────────────────────────────────────────────────

export function isHiveBossDead(boss: HiveBossState): boolean {
  return boss.alive && boss.hp <= 0;
}

// ─── Destroy ────────────────────────────────────────────────────────────────

export function destroyHiveBoss(boss: HiveBossState): void {
  boss.alive = false;

  // Destroy core
  deregisterEntity(boss.id);
  untagCollidable(boss.collidable);
  scene.remove(boss.coreGroup);
  const coreIdx = collidables.indexOf(boss.collidable);
  if (coreIdx !== -1) collidables.splice(coreIdx, 1);

  // Destroy all alive flock spinners
  for (const spinner of boss.flock) {
    if (spinner.alive) {
      spinner.alive = false;
      deregisterEntity(spinner.id);
      untagCollidable(spinner.collidable);
      if (spinner.topResult.motionVisuals) {
        releaseAuraLight(spinner.topResult.motionVisuals.auraLight);
      }
      scene.remove(spinner.topResult.tiltGroup);
      const idx = collidables.indexOf(spinner.collidable);
      if (idx !== -1) collidables.splice(idx, 1);
    }
  }
}
