import * as THREE from 'three';
import { scene } from './renderer';
import { ARENA_SIZE } from './constants';
import { collidables, type Collidable, type Vec2 } from './physics';
import { createTop, TOP_BASE_RADIUS, type TopResult } from './top';
import { updateSpinnerVisuals, type SpinnerTiltState } from './spinnerVisuals';
import { createHpBar, updateHpBar } from './hpBar';
import {
  nextEntityId, registerMovement, registerRpm,
  tagCollidable, untagCollidable, deregisterEntity,
} from './systems';
import { type SiegeEngineConfig } from './bossDesigns';

// ─── Sub-part types ──────────────────────────────────────────────────────────

export type SiegePartType = 'shield' | 'turret' | 'leg';

export interface SiegeEnginePart {
  type:          SiegePartType;
  collidable:    Collidable;
  group:         THREE.Group;
  hpBarFill:     THREE.Mesh;
  hp:            number;
  maxHp:         number;
  alive:         boolean;
  baseAngle:     number;     // radial position around core
  orbitRadius:   number;
  // Turret-specific
  barrelPivot?:  THREE.Group;
  barrelAngle?:  number;
  fireCooldown?: number;
}

// ─── Fire event (returned to game.ts for projectile creation) ────────────────

export interface SiegeFireEvent {
  firePos: Vec2;
  fireDir: Vec2;
  speed:   number;
  damage:  number;
}

// ─── State ───────────────────────────────────────────────────────────────────

export interface SiegeEngineState extends SpinnerTiltState {
  id:          number;
  config:      SiegeEngineConfig;
  collidable:  Collidable;       // the core
  topResult:   TopResult;
  baseColor:   THREE.Color;
  alive:       boolean;
  facingAngle: number;
  parts:       SiegeEnginePart[];
  shieldMesh:  THREE.Mesh;       // visual dome (separate from shield collidable)
  hpBarFill:   THREE.Mesh;       // core RPM bar
  hpGroup:     THREE.Group;      // HP bar follows core
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createSiegeEngine(pos: Vec2, config: SiegeEngineConfig): SiegeEngineState {
  // Core top — scaled
  const topResult = createTop(config.color);
  const scale = config.coreRadius / TOP_BASE_RADIUS;
  topResult.spinGroup.scale.set(scale, scale, scale);
  topResult.tiltGroup.position.set(pos.x, 0, pos.z);
  scene.add(topResult.tiltGroup);

  // Shield dome visual (transparent icosahedron)
  const shieldGeo = new THREE.IcosahedronGeometry(config.shieldRadius, 1);
  const shieldMat = new THREE.MeshStandardMaterial({
    color: 0x4488ff, emissive: 0x2244aa, emissiveIntensity: 0.5,
    transparent: true, opacity: 0.2, side: THREE.DoubleSide,
    roughness: 0.1, metalness: 0.3,
  });
  const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.position.set(pos.x, 1.0, pos.z);
  scene.add(shieldMesh);

  // HP bar for core (RPM-based)
  const hpGroup = new THREE.Group();
  hpGroup.position.set(pos.x, 0, pos.z);
  const { bg, fill } = createHpBar(2.4, 0.16, 3.2);
  hpGroup.add(bg);
  hpGroup.add(fill);
  scene.add(hpGroup);

  // Core collidable
  const coreCol: Collidable = {
    pos:         { x: pos.x, z: pos.z },
    vel:         { x: 0, z: 0 },
    radius:      config.coreRadius,
    mass:        config.coreMass,
    isStatic:    false,
    rpm:         config.coreRpmCapacity,
    rpmCapacity: config.coreRpmCapacity,
    heatFactor:  config.heatFactor,
  };
  collidables.push(coreCol);

  const id = nextEntityId();
  registerMovement(id, coreCol, config.coreMaxSpeed[0], 0.97);
  registerRpm(id, coreCol, 0, 0);
  tagCollidable(coreCol, 'siege_core');

  // ── Create sub-parts ──
  const parts: SiegeEnginePart[] = [];

  // Shield collidable (larger radius, sits on core)
  parts.push(createPart('shield', pos, 0, 0, config.shieldRadius, 8.0,
    config.shieldHp, 0x4488ff, 0.5));

  // Turrets
  for (let i = 0; i < config.turretCount; i++) {
    const angle = (i / config.turretCount) * Math.PI * 2;
    const part = createPart('turret', pos, angle, 2.0, 0.4, 1.5,
      config.turretHp, 0x334455, 0.8);
    part.barrelPivot = createBarrel(part.group);
    part.barrelAngle = 0;
    part.fireCooldown = config.turretFireRate * (0.3 + i * 0.4);
    parts.push(part);
  }

  // Legs
  for (let i = 0; i < config.legCount; i++) {
    const angle = (Math.PI / 4) + (i / config.legCount) * Math.PI * 2;
    parts.push(createPart('leg', pos, angle, 1.4, 0.35, 2.0,
      config.legHp, 0x667788, 0.6));
  }

  // Tag all parts
  for (const p of parts) tagCollidable(p.collidable, 'siege_part');

  return {
    id, config, collidable: coreCol, topResult,
    baseColor: new THREE.Color(config.color),
    alive: true, facingAngle: 0,
    parts, shieldMesh, hpBarFill: fill, hpGroup,
    tiltX: 0, tiltZ: 0,
  };
}

function createPart(
  type: SiegePartType, corePos: Vec2, baseAngle: number, orbitRadius: number,
  radius: number, mass: number, hp: number, color: number, meshHeight: number,
): SiegeEnginePart {
  const worldX = corePos.x + Math.sin(baseAngle) * orbitRadius;
  const worldZ = corePos.z + Math.cos(baseAngle) * orbitRadius;

  const group = new THREE.Group();
  group.position.set(worldX, 0, worldZ);

  // Visual mesh by type
  let mesh: THREE.Mesh;
  if (type === 'shield') {
    // Small generator pylon
    mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.35, 0.8, 8),
      new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.6,
        roughness: 0.3, metalness: 0.7,
      }),
    );
    mesh.position.y = 0.4;
  } else if (type === 'turret') {
    mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.35, 0.6, 10),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.8 }),
    );
    mesh.position.y = 0.3;
  } else {
    // Leg: thick pillar
    mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.25, meshHeight, 8),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.5 }),
    );
    mesh.position.y = meshHeight / 2;
  }
  mesh.castShadow = true;
  group.add(mesh);

  // HP bar
  const { bg, fill } = createHpBar(0.8, 0.08, meshHeight + 0.3);
  group.add(bg);
  group.add(fill);

  scene.add(group);

  // Collidable — static so parts don't get pushed around
  const col: Collidable = {
    pos: { x: worldX, z: worldZ }, vel: { x: 0, z: 0 },
    radius, mass, isStatic: true,
    rpm: 1, rpmCapacity: 1, heatFactor: 0.05,
  };
  collidables.push(col);

  return {
    type, collidable: col, group, hpBarFill: fill,
    hp, maxHp: hp, alive: true, baseAngle, orbitRadius,
  };
}

function createBarrel(parent: THREE.Group): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.y = 0.5;
  parent.add(pivot);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.4, metalness: 0.9 }),
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.3;
  pivot.add(barrel);

  return pivot;
}

// ─── Part Position Sync (call AFTER movementSystem, BEFORE runCollisions) ────

export function syncSiegeEngineParts(boss: SiegeEngineState): void {
  if (!boss.alive) return;

  const core = boss.collidable;

  for (const part of boss.parts) {
    if (!part.alive) continue;

    // Compute world position from core + rotation
    const angle = part.baseAngle + boss.facingAngle;
    const wx = core.pos.x + Math.sin(angle) * part.orbitRadius;
    const wz = core.pos.z + Math.cos(angle) * part.orbitRadius;

    part.collidable.pos.x = wx;
    part.collidable.pos.z = wz;
    part.group.position.x = wx;
    part.group.position.z = wz;
  }

  // Shield dome follows core
  boss.shieldMesh.position.x = core.pos.x;
  boss.shieldMesh.position.z = core.pos.z;
}

// ─── AI (call in entity update phase) ────────────────────────────────────────

export function updateSiegeEngineAI(
  boss:      SiegeEngineState,
  playerPos: Vec2,
  delta:     number,
): void {
  if (!boss.alive) return;

  const cfg  = boss.config;
  const body = boss.collidable;
  const pi   = getPhaseIndex(boss);

  // Compute current max speed (phase speed - dead legs penalty)
  const deadLegs = boss.parts.filter(p => p.type === 'leg' && !p.alive).length;
  const maxSpeed = Math.max(2, cfg.coreMaxSpeed[pi] - deadLegs * cfg.speedPerLeg);

  // Update facing angle toward velocity
  const speed = Math.sqrt(body.vel.x ** 2 + body.vel.z ** 2);
  if (speed > 0.3) {
    const target = Math.atan2(body.vel.x, body.vel.z);
    let diff = target - boss.facingAngle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    boss.facingAngle += diff * Math.min(2.5 * delta, 1.0);
  }

  // Chase player
  const dx = playerPos.x - body.pos.x;
  const dz = playerPos.z - body.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  // More aggressive acceleration in later phases
  const accelMult = 1.0 + pi * 0.5;
  const accel = maxSpeed * 2.0 * accelMult;

  if (dist > 0.1) {
    const inv = 1 / dist;
    body.vel.x += dx * inv * accel * delta;
    body.vel.z += dz * inv * accel * delta;
  }

  // Speed clamp (override movement system's if lower)
  if (speed > maxSpeed) {
    const s = maxSpeed / speed;
    body.vel.x *= s;
    body.vel.z *= s;
  }

  // Wall avoidance
  const limit = ARENA_SIZE - 3;
  if (body.pos.x >  limit) body.vel.x -= accel * delta * 0.5;
  if (body.pos.x < -limit) body.vel.x += accel * delta * 0.5;
  if (body.pos.z >  limit) body.vel.z -= accel * delta * 0.5;
  if (body.pos.z < -limit) body.vel.z += accel * delta * 0.5;
}

// ─── Turret Fire (call in update phase, returns fire events for game.ts) ─────

export function updateSiegeEngineTurrets(
  boss:      SiegeEngineState,
  playerPos: Vec2,
  playerVel: Vec2,
  delta:     number,
): SiegeFireEvent[] {
  if (!boss.alive) return [];

  const cfg = boss.config;
  const events: SiegeFireEvent[] = [];

  for (const part of boss.parts) {
    if (!part.alive || part.type !== 'turret') continue;

    // Predictive aim
    const px = part.collidable.pos.x;
    const pz = part.collidable.pos.z;
    const dx = playerPos.x - px;
    const dz = playerPos.z - pz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const T = dist / cfg.turretProjSpeed;
    const predX = playerPos.x + playerVel.x * T;
    const predZ = playerPos.z + playerVel.z * T;
    const aimDx = predX - px;
    const aimDz = predZ - pz;

    // Smooth barrel rotation
    const targetAngle = Math.atan2(aimDx, aimDz);
    let diff = targetAngle - (part.barrelAngle ?? 0);
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    part.barrelAngle = (part.barrelAngle ?? 0) + Math.sign(diff) * Math.min(Math.abs(diff), 3.0 * delta);
    if (part.barrelPivot) part.barrelPivot.rotation.y = part.barrelAngle!;

    // Fire cooldown
    part.fireCooldown = (part.fireCooldown ?? 0) - delta;
    if (part.fireCooldown! > 0) continue;
    part.fireCooldown = cfg.turretFireRate;

    const aimLen = Math.sqrt(aimDx * aimDx + aimDz * aimDz);
    if (aimLen === 0) continue;

    const fireDir = { x: aimDx / aimLen, z: aimDz / aimLen };
    const firePos = { x: px + fireDir.x * 0.5, z: pz + fireDir.z * 0.5 };

    events.push({ firePos, fireDir, speed: cfg.turretProjSpeed, damage: cfg.turretProjDamage });
  }

  return events;
}

// ─── Phase ───────────────────────────────────────────────────────────────────

function getPhaseIndex(boss: SiegeEngineState): number {
  const shieldAlive = boss.parts.some(p => p.type === 'shield' && p.alive);
  if (shieldAlive) return 0;

  const aliveParts = boss.parts.filter(p => p.alive).length;
  if (aliveParts <= 2) return 2;
  return 1;
}

export function isShieldAlive(boss: SiegeEngineState): boolean {
  return boss.parts.some(p => p.type === 'shield' && p.alive);
}

// ─── Part Damage ─────────────────────────────────────────────────────────────

/** Apply HP damage to a sub-part. Returns true if part died. */
export function applyDamageToSiegePart(
  boss: SiegeEngineState, part: SiegeEnginePart, damage: number,
): boolean {
  part.hp = Math.max(0, part.hp - damage);
  updateHpBar(part.hpBarFill, part.hp / part.maxHp, 0.4);
  if (part.hp <= 0) {
    destroySiegePart(boss, part);
    return true;
  }
  return false;
}

function destroySiegePart(boss: SiegeEngineState, part: SiegeEnginePart): void {
  part.alive = false;
  untagCollidable(part.collidable);
  scene.remove(part.group);
  const idx = collidables.indexOf(part.collidable);
  if (idx !== -1) collidables.splice(idx, 1);

  // If shield, hide the dome
  if (part.type === 'shield') {
    scene.remove(boss.shieldMesh);
  }
}

// ─── Visuals ─────────────────────────────────────────────────────────────────

export function updateSiegeEngineVisuals(
  boss: SiegeEngineState, time: number, delta: number,
): void {
  if (!boss.alive) return;

  const cfg  = boss.config;
  const body = boss.collidable;
  const { tiltGroup, spinGroup, bodyMat } = boss.topResult;
  const rpmFrac = body.rpm / cfg.coreRpmCapacity;
  const pi = getPhaseIndex(boss);

  // Position sync
  tiltGroup.position.x = body.pos.x;
  tiltGroup.position.z = body.pos.z;
  boss.hpGroup.position.x = body.pos.x;
  boss.hpGroup.position.z = body.pos.z;

  // Core RPM bar
  updateHpBar(boss.hpBarFill, rpmFrac, 1.2);

  // Shield dome pulse
  if (isShieldAlive(boss)) {
    const pulse = 0.15 + 0.1 * Math.sin(time * 2 * Math.PI);
    (boss.shieldMesh.material as THREE.MeshStandardMaterial).opacity = pulse;
    boss.shieldMesh.rotation.y += delta * 0.3;
  }

  // Shared tilt/wobble/spin
  updateSpinnerVisuals(boss, {
    vel: body.vel,
    maxSpeed: cfg.coreMaxSpeed[pi],
    spinSpeed: 10,
    rpmFrac,
    spinFrac: rpmFrac,
    baseColor: boss.baseColor,
    tiltGroup, spinGroup, bodyMat, motionVisuals: boss.topResult.motionVisuals,
  }, time, delta);

  // Phase-based emissive
  if (pi === 2) {
    // Phase 3: aggressive red glow
    const pulse = 0.5 + 0.5 * Math.sin(time * 8 * Math.PI * 2);
    bodyMat.emissive.setRGB(pulse * 0.8, pulse * 0.1, 0);
    bodyMat.emissiveIntensity = 0.5 + pulse;
  } else if (pi === 1) {
    // Phase 2: moderate warning
    const pulse = 0.3 + 0.2 * Math.sin(time * 4 * Math.PI * 2);
    bodyMat.emissive.setRGB(pulse * 0.5, pulse * 0.3, 0);
    bodyMat.emissiveIntensity = pulse;
  } else {
    bodyMat.emissiveIntensity = 0;
  }
}

// ─── Death Check ─────────────────────────────────────────────────────────────

export function isSiegeEngineDead(boss: SiegeEngineState): boolean {
  return boss.alive && boss.collidable.rpm <= 0;
}

// ─── Destroy ─────────────────────────────────────────────────────────────────

export function destroySiegeEngine(boss: SiegeEngineState): void {
  boss.alive = false;
  deregisterEntity(boss.id);
  untagCollidable(boss.collidable);
  scene.remove(boss.topResult.tiltGroup);
  scene.remove(boss.hpGroup);
  scene.remove(boss.shieldMesh);

  // Destroy all remaining parts
  for (const p of boss.parts) {
    if (p.alive) destroySiegePart(boss, p);
  }

  const idx = collidables.indexOf(boss.collidable);
  if (idx !== -1) collidables.splice(idx, 1);
}
