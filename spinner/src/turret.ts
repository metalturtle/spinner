import * as THREE from 'three';
import { scene } from './renderer';
import { collidables, type Collidable, type Vec2 } from './physics';
import { createHpBar, updateHpBar } from './hpBar';
import { nextEntityId, tagCollidable, untagCollidable, deregisterEntity } from './systems';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface TurretConfig {
  hp:                  number;
  fireCooldown:        number;
  projectileSpeed:     number;
  projectileDamage:    number;  // flat RPM drained per projectile hit
  barrelRotationSpeed: number;
  heatFactor:          number;  // collision damage multiplier to player RPM
  mass:                number;
  radius:              number;
  rpmCapacity:         number;  // used in effective-mass collision formula
}

export const TURRET_TIER_1: TurretConfig = {
  hp:                  10,
  fireCooldown:        .2,
  projectileSpeed:     30.0,
  projectileDamage:    15,
  barrelRotationSpeed: 5.5,
  heatFactor:          0.1,
  mass:                2.0,
  radius:              0.75,
  rpmCapacity:         100,
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TurretFireData {
  shouldFire: boolean;
  firePos:    Vec2;
  fireDir:    Vec2;
}

export interface TurretState {
  id:          number;
  pos:         Vec2;
  hp:          number;
  maxHp:       number;
  fireCooldown: number;
  barrelAngle: number;
  config:      TurretConfig;
  group:       THREE.Group;
  barrelPivot: THREE.Group;
  hpBarFill:   THREE.Mesh;
  collidable:  Collidable;
  alive:       boolean;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createTurret(pos: Vec2, config: TurretConfig): TurretState {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);

  // Base — wide short cylinder
  const baseMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.8, 0.6, 16),
    new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.6, metalness: 0.7 })
  );
  baseMesh.position.y = 0.3;
  baseMesh.castShadow = true;
  group.add(baseMesh);

  // Body — smaller cylinder on top
  const bodyMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.5, 16),
    new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.5, metalness: 0.8 })
  );
  bodyMesh.position.y = 0.85;
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // Barrel pivot — rotates around Y to aim
  const barrelPivot = new THREE.Group();
  barrelPivot.position.y = 0.85;
  group.add(barrelPivot);

  // Barrel — horizontal cylinder extending in +Z from pivot
  const barrelMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8),
    new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.4, metalness: 0.9 })
  );
  barrelMesh.rotation.x = Math.PI / 2;
  barrelMesh.position.z = 0.45;
  barrelPivot.add(barrelMesh);

  // HP bar
  const { bg: hpBarBg, fill: hpBarFill } = createHpBar(1.2, 0.14, 2.0);
  group.add(hpBarBg);
  group.add(hpBarFill);

  scene.add(group);

  // Collidable — isStatic so it never moves
  const collidable: Collidable = {
    pos:         { x: pos.x, z: pos.z },
    vel:         { x: 0, z: 0 },
    radius:      config.radius,
    mass:        config.mass,
    isStatic:    true,
    rpm:         config.rpmCapacity * 0.7,
    rpmCapacity: config.rpmCapacity,
    heatFactor:  config.heatFactor,
  };
  collidables.push(collidable);
  tagCollidable(collidable, 'turret');

  const id = nextEntityId();

  const turret: TurretState = {
    id,
    pos,
    hp:          config.hp,
    maxHp:       config.hp,
    fireCooldown: config.fireCooldown * 0.5,  // first shot sooner
    barrelAngle: 0,
    config,
    group,
    barrelPivot,
    hpBarFill,
    collidable,
    alive:       true,
  };
  collidable.owner = turret;
  return turret;
}

// ─── Update ──────────────────────────────────────────────────────────────────

export function updateTurret(
  turret:     TurretState,
  spinnerPos: Vec2,
  spinnerVel: Vec2,
  delta:      number
): TurretFireData {
  if (!turret.alive) return { shouldFire: false, firePos: { x: 0, z: 0 }, fireDir: { x: 0, z: 0 } };

  const cfg = turret.config;

  // Predictive aim
  const dx   = spinnerPos.x - turret.pos.x;
  const dz   = spinnerPos.z - turret.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const T    = dist / cfg.projectileSpeed;

  const predX = spinnerPos.x + spinnerVel.x * T;
  const predZ = spinnerPos.z + spinnerVel.z * T;
  const aimDx = predX - turret.pos.x;
  const aimDz = predZ - turret.pos.z;

  // Smooth barrel rotation
  const targetAngle = Math.atan2(aimDx, aimDz);
  let diff = targetAngle - turret.barrelAngle;
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const maxStep = cfg.barrelRotationSpeed * delta;
  turret.barrelAngle += Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
  turret.barrelPivot.rotation.y = turret.barrelAngle;

  // Fire cooldown
  turret.fireCooldown -= delta;
  if (turret.fireCooldown > 0) {
    return { shouldFire: false, firePos: { x: 0, z: 0 }, fireDir: { x: 0, z: 0 } };
  }

  turret.fireCooldown = cfg.fireCooldown;

  const aimLen = Math.sqrt(aimDx * aimDx + aimDz * aimDz);
  if (aimLen === 0) return { shouldFire: false, firePos: { x: 0, z: 0 }, fireDir: { x: 0, z: 0 } };

  const fireDir: Vec2 = { x: aimDx / aimLen, z: aimDz / aimLen };
  const firePos: Vec2 = {
    x: turret.pos.x + fireDir.x * (cfg.radius + 0.2),
    z: turret.pos.z + fireDir.z * (cfg.radius + 0.2),
  };

  return { shouldFire: true, firePos, fireDir };
}

// ─── Damage & Destroy ────────────────────────────────────────────────────────

export function applyDamageToTurret(turret: TurretState, damage: number): boolean {
  turret.hp = Math.max(0, turret.hp - damage);
  updateHpBar(turret.hpBarFill, turret.hp / turret.maxHp, 0.6);
  return turret.hp <= 0;
}

export function destroyTurret(turret: TurretState): void {
  turret.alive = false;
  deregisterEntity(turret.id);
  untagCollidable(turret.collidable);
  scene.remove(turret.group);
  const idx = collidables.indexOf(turret.collidable);
  if (idx !== -1) collidables.splice(idx, 1);
}
