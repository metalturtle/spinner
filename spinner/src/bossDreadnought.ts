import * as THREE from 'three';
import { scene } from './renderer';
import { ARENA_SIZE } from './constants';
import { collidables, zones, type Collidable, type Vec2, type FloorZone } from './physics';
import { createTop, TOP_BASE_RADIUS, type TopResult } from './top';
import { updateSpinnerVisuals, type SpinnerTiltState } from './spinnerVisuals';
import { createHpBar, updateHpBar } from './hpBar';
import {
  nextEntityId, registerMovement, registerRpm,
  tagCollidable, untagCollidable, deregisterEntity,
} from './systems';
import { type DreadnoughtConfig, DREADNOUGHT_TIER_1, type BossPhase } from './bossDesigns';

// ─── Charge AI states ────────────────────────────────────────────────────────

type ChargeState = 'idle' | 'windup' | 'charging' | 'recovering';

// ─── State ───────────────────────────────────────────────────────────────────

export interface DreadnoughtState extends SpinnerTiltState {
  id:             number;
  config:         DreadnoughtConfig;
  collidable:     Collidable;
  topResult:      TopResult;
  baseColor:      THREE.Color;
  alive:          boolean;

  // Phase
  phase:          BossPhase;
  phaseIndex:     number;           // 0, 1, 2

  // Facing
  facingAngle:    number;           // radians, direction the boss faces

  // Charge attack
  chargeState:    ChargeState;
  chargeTimer:    number;
  chargeCooldown: number;
  chargeDir:      Vec2;             // locked direction during charge

  // Visuals
  ventMesh:       THREE.Mesh;
  hpBarFill:      THREE.Mesh;
  group:          THREE.Group;      // parent for HP bar (follows boss)

  // Floor drain zones spawned by boss
  drainZones:     { zone: FloorZone; mesh: THREE.Mesh }[];
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createDreadnought(pos: Vec2, config: DreadnoughtConfig): DreadnoughtState {
  // Larger top — scale the standard top mesh
  const topResult = createTop(config.color);
  const scale = config.radius / TOP_BASE_RADIUS;
  topResult.spinGroup.scale.set(scale, scale, scale);
  topResult.tiltGroup.position.set(pos.x, 0, pos.z);
  scene.add(topResult.tiltGroup);

  // Rear vent indicator — small glowing ring on the back
  const ventGeo = new THREE.RingGeometry(0.15 * scale, 0.35 * scale, 12);
  const ventMat = new THREE.MeshStandardMaterial({
    color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 1.5,
    side: THREE.DoubleSide, transparent: true, opacity: 0.9,
  });
  const ventMesh = new THREE.Mesh(ventGeo, ventMat);
  ventMesh.position.set(0, 0.8 * scale, -0.5 * scale);
  ventMesh.rotation.x = Math.PI / 2;
  topResult.spinGroup.add(ventMesh);

  // HP bar group (follows boss position but doesn't tilt)
  const hpGroup = new THREE.Group();
  hpGroup.position.set(pos.x, 0, pos.z);
  const { bg, fill } = createHpBar(2.0, 0.16, 2.5 * scale);
  hpGroup.add(bg);
  hpGroup.add(fill);
  scene.add(hpGroup);

  // Collidable
  const collidable: Collidable = {
    pos:         { x: pos.x, z: pos.z },
    vel:         { x: 0, z: 0 },
    radius:      config.radius,
    mass:        config.mass,
    isStatic:    false,
    rpm:         config.rpmCapacity,
    rpmCapacity: config.rpmCapacity,
    heatFactor:  config.heatFactor,
  };
  collidables.push(collidable);

  const id = nextEntityId();
  registerMovement(id, collidable, config.maxSpeed[0], config.friction);
  registerRpm(id, collidable, config.rpmDecayRate, 0);
  tagCollidable(collidable, 'boss');

  return {
    id,
    config,
    collidable,
    topResult,
    baseColor:      new THREE.Color(config.color),
    alive:          true,
    phase:          'phase1',
    phaseIndex:     0,
    facingAngle:    0,
    chargeState:    'idle',
    chargeTimer:    0,
    chargeCooldown: config.chargeCooldown[0] * 0.5,  // first charge sooner
    chargeDir:      { x: 0, z: 1 },
    ventMesh,
    hpBarFill:      fill,
    group:          hpGroup,
    drainZones:     [],
    tiltX:          0,
    tiltZ:          0,
  };
}

// ─── Phase Management ────────────────────────────────────────────────────────

function updatePhase(boss: DreadnoughtState): void {
  const ratio = boss.collidable.rpm / boss.config.rpmCapacity;
  const thresholds = boss.config;

  let newIndex = 0;
  if (ratio <= 0.25) newIndex = 2;
  else if (ratio <= 0.5) newIndex = 1;

  if (newIndex <= boss.phaseIndex) return;

  boss.phaseIndex = newIndex;
  boss.phase = (['phase1', 'phase2', 'phase3'] as BossPhase[])[newIndex];

  // Spawn drain zones for new phase
  spawnDrainZones(boss);
}

function spawnDrainZones(boss: DreadnoughtState): void {
  // Remove old drain zones
  clearDrainZones(boss);

  const count = boss.config.drainZoneCount[boss.phaseIndex];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const dist = 8 + Math.random() * 6;
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;
    const r = boss.config.drainZoneRadius;

    // Clamp to arena
    const clampedX = Math.max(-ARENA_SIZE + r, Math.min(ARENA_SIZE - r, cx));
    const clampedZ = Math.max(-ARENA_SIZE + r, Math.min(ARENA_SIZE - r, cz));

    const zone: FloorZone = {
      minX: clampedX - r, maxX: clampedX + r,
      minZ: clampedZ - r, maxZ: clampedZ + r,
      drainRate: boss.config.drainZoneRate,
    };
    zones.push(zone);

    // Visual
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(r * 2, r * 2),
      new THREE.MeshStandardMaterial({
        color: 0xcc2200, transparent: true, opacity: 0.35,
        roughness: 0.1, metalness: 0.0, side: THREE.DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(clampedX, 0.03, clampedZ);
    scene.add(mesh);

    boss.drainZones.push({ zone, mesh });
  }
}

function clearDrainZones(boss: DreadnoughtState): void {
  for (const dz of boss.drainZones) {
    const idx = zones.indexOf(dz.zone);
    if (idx !== -1) zones.splice(idx, 1);
    scene.remove(dz.mesh);
  }
  boss.drainZones.length = 0;
}

// ─── AI ──────────────────────────────────────────────────────────────────────

export function updateDreadnoughtAI(
  boss:      DreadnoughtState,
  playerPos: Vec2,
  delta:     number,
): void {
  if (!boss.alive) return;

  updatePhase(boss);

  const cfg  = boss.config;
  const body = boss.collidable;
  const pi   = boss.phaseIndex;
  const accel = cfg.acceleration[pi];

  // ── Update facing angle — smooth tracking of velocity direction ──
  const speed = Math.sqrt(body.vel.x ** 2 + body.vel.z ** 2);
  if (speed > 0.5) {
    const targetAngle = Math.atan2(body.vel.x, body.vel.z);
    let diff = targetAngle - boss.facingAngle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    boss.facingAngle += diff * Math.min(3.0 * delta, 1.0);
  }

  // ── Charge state machine ──
  switch (boss.chargeState) {
    case 'idle': {
      // Chase player
      const dx = playerPos.x - body.pos.x;
      const dz = playerPos.z - body.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.1) {
        const inv = 1 / dist;
        body.vel.x += dx * inv * accel * delta;
        body.vel.z += dz * inv * accel * delta;
      }

      // Wall avoidance
      const limit = ARENA_SIZE - 3;
      if (body.pos.x >  limit) body.vel.x -= accel * delta * 0.5;
      if (body.pos.x < -limit) body.vel.x += accel * delta * 0.5;
      if (body.pos.z >  limit) body.vel.z -= accel * delta * 0.5;
      if (body.pos.z < -limit) body.vel.z += accel * delta * 0.5;

      // Check charge cooldown
      boss.chargeCooldown -= delta;
      if (boss.chargeCooldown <= 0 && dist < 15) {
        boss.chargeState = 'windup';
        boss.chargeTimer = cfg.chargeWindUp;
        // Lock direction toward player
        if (dist > 0.1) {
          boss.chargeDir.x = dx / dist;
          boss.chargeDir.z = dz / dist;
        }
      }
      break;
    }

    case 'windup': {
      // Slow down during wind-up (telegraph)
      body.vel.x *= 0.9;
      body.vel.z *= 0.9;
      boss.chargeTimer -= delta;
      if (boss.chargeTimer <= 0) {
        boss.chargeState = 'charging';
        boss.chargeTimer = cfg.chargeDuration;
      }
      break;
    }

    case 'charging': {
      // Lunge in locked direction
      body.vel.x = boss.chargeDir.x * cfg.chargeSpeed;
      body.vel.z = boss.chargeDir.z * cfg.chargeSpeed;
      boss.chargeTimer -= delta;

      // End charge on timer or wall hit
      const atWall = Math.abs(body.pos.x) > ARENA_SIZE - 1.5 ||
                     Math.abs(body.pos.z) > ARENA_SIZE - 1.5;
      if (boss.chargeTimer <= 0 || atWall) {
        boss.chargeState = 'recovering';
        boss.chargeTimer = cfg.chargeRecovery;
        body.vel.x *= 0.2;
        body.vel.z *= 0.2;
      }
      break;
    }

    case 'recovering': {
      // Stunned — coast on inertia (movement system handles friction)
      boss.chargeTimer -= delta;
      if (boss.chargeTimer <= 0) {
        boss.chargeState = 'idle';
        boss.chargeCooldown = cfg.chargeCooldown[pi];
      }
      break;
    }
  }
}

// ─── Directional Damage ──────────────────────────────────────────────────────

export interface DreadnoughtHitResult {
  bossDamageMult:   number;   // multiplier on damage TO the boss
  playerDamageMult: number;   // multiplier on damage TO the player
  hitWeak:          boolean;
}

/** Check if a collision hit the boss's weak point (rear). */
export function checkWeakPoint(
  boss:      DreadnoughtState,
  playerPos: Vec2,
): DreadnoughtHitResult {
  const body = boss.collidable;

  // Angle from boss to player
  const dx = playerPos.x - body.pos.x;
  const dz = playerPos.z - body.pos.z;
  const hitAngle = Math.atan2(dx, dz);

  // Angle difference between hit direction and boss facing
  let diff = hitAngle - boss.facingAngle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;

  // If the player is BEHIND the boss (diff close to ±π), it's a weak hit
  const absDiff = Math.abs(diff);
  const hitWeak = absDiff > Math.PI - boss.config.weakAngle;

  if (hitWeak) {
    return { bossDamageMult: boss.config.weakDamageMult, playerDamageMult: 0.3, hitWeak: true };
  }
  return { bossDamageMult: 0.1, playerDamageMult: boss.config.frontDamageMult, hitWeak: false };
}

// ─── Visuals ─────────────────────────────────────────────────────────────────

export function updateDreadnoughtVisuals(boss: DreadnoughtState, time: number, delta: number): void {
  if (!boss.alive) return;

  const cfg  = boss.config;
  const body = boss.collidable;
  const { tiltGroup, spinGroup, bodyMat } = boss.topResult;
  const rpmFrac = body.rpm / cfg.rpmCapacity;

  // Position sync
  tiltGroup.position.x = body.pos.x;
  tiltGroup.position.z = body.pos.z;
  boss.group.position.x = body.pos.x;
  boss.group.position.z = body.pos.z;

  // HP bar
  updateHpBar(boss.hpBarFill, rpmFrac, 1.0);

  // Shared tilt/wobble/spin/desaturation
  updateSpinnerVisuals(boss, {
    vel: body.vel,
    maxSpeed: cfg.maxSpeed[boss.phaseIndex],
    spinSpeed: cfg.spinSpeed,
    rpmFrac,
    spinFrac: rpmFrac,
    baseColor: boss.baseColor,
    tiltGroup, spinGroup, bodyMat, motionVisuals: boss.topResult.motionVisuals,
  }, time, delta);

  // ── Emissive effects ──

  // Charge wind-up telegraph — yellow pulse
  if (boss.chargeState === 'windup') {
    const pulse = 0.5 + 0.5 * Math.sin(time * 12 * Math.PI * 2);
    bodyMat.emissive.setRGB(pulse * 0.8, pulse * 0.6, 0);
    bodyMat.emissiveIntensity = pulse * 2.0;
    return;
  }

  // Charging — bright red
  if (boss.chargeState === 'charging') {
    bodyMat.emissive.setRGB(1.0, 0.2, 0);
    bodyMat.emissiveIntensity = 2.5;
    return;
  }

  // Recovery — dim, vulnerability indicator
  if (boss.chargeState === 'recovering') {
    const pulse = 0.3 + 0.3 * Math.sin(time * 6 * Math.PI * 2);
    bodyMat.emissive.setRGB(0, pulse * 0.5, pulse);
    bodyMat.emissiveIntensity = pulse;
    // Vent glows brighter during recovery
    (boss.ventMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 3.0 + pulse * 2.0;
    return;
  }

  // Phase-based emissive
  if (boss.phaseIndex === 2) {
    // Phase 3 berserk — erratic red pulse
    const pulse = 0.5 + 0.5 * Math.sin(time * 10 * Math.PI * 2);
    const berserk = new THREE.Color(cfg.berserkColor);
    bodyMat.emissive.copy(berserk).multiplyScalar(pulse);
    bodyMat.emissiveIntensity = 0.5 + pulse;
  } else if (boss.phaseIndex === 1) {
    // Phase 2 — moderate glow
    const pulse = 0.3 + 0.2 * Math.sin(time * 4 * Math.PI * 2);
    bodyMat.emissive.setRGB(pulse * 0.4, 0, 0);
    bodyMat.emissiveIntensity = pulse;
  } else {
    bodyMat.emissiveIntensity = 0;
  }

  // Reset vent glow to default
  (boss.ventMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5;
}

// ─── Death Check ─────────────────────────────────────────────────────────────

export function isDreadnoughtDead(boss: DreadnoughtState): boolean {
  return boss.alive && boss.collidable.rpm <= 0;
}

// ─── Destroy ─────────────────────────────────────────────────────────────────

export function destroyDreadnought(boss: DreadnoughtState): void {
  boss.alive = false;
  deregisterEntity(boss.id);
  untagCollidable(boss.collidable);
  scene.remove(boss.topResult.tiltGroup);
  scene.remove(boss.group);
  clearDrainZones(boss);
  const idx = collidables.indexOf(boss.collidable);
  if (idx !== -1) collidables.splice(idx, 1);
}
