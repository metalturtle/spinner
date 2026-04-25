import * as THREE from 'three';
import { scene } from './renderer';
import { collidables, type Collidable, type Vec2 } from './physics';
import { createHpBar, updateHpBar } from './hpBar';
import { nextEntityId, tagCollidable, untagCollidable, deregisterEntity } from './systems';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface ObstacleConfig {
  type:       'breakable' | 'movable';
  radius:     number;
  mass:       number;
  hp:         number;   // for breakable; ignored for movable
  heatFactor: number;   // collision damage multiplier to player RPM
  color:      number;
  height:     number;
}

export const CRATE_CONFIG: ObstacleConfig = {
  type:       'breakable',
  radius:     0.6,
  mass:       3.0,
  hp:         5,
  heatFactor: 0.05,
  color:      0x8B6914,
  height:     1.0,
};

export const BARREL_CONFIG: ObstacleConfig = {
  type:       'movable',
  radius:     0.45,
  mass:       0.4,
  hp:         0,
  heatFactor: 0.02,
  color:      0x777788,
  height:     0.8,
};

// ─── Damage scale — simple impact-proportional HP damage ─────────────────────
// Obstacles don't have RPM, so we skip the full collision damage formula.
// hpDamage = impactForce × OBSTACLE_DAMAGE_SCALE
const OBSTACLE_DAMAGE_SCALE = 0.3;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ObstacleState {
  id:          number;
  config:      ObstacleConfig;
  collidable:  Collidable;
  group:       THREE.Group;
  hp:          number;
  maxHp:       number;
  hpBarFill:   THREE.Mesh | null;
  alive:       boolean;
  originalPos: Vec2;   // for reset
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createObstacle(pos: Vec2, config: ObstacleConfig): ObstacleState {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);

  let mesh: THREE.Mesh;
  if (config.type === 'breakable') {
    const half = config.radius * 1.4;
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(half * 2, config.height, half * 2),
      new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.85, metalness: 0.05 })
    );
  } else {
    mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(config.radius, config.radius, config.height, 12),
      new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.5, metalness: 0.6 })
    );
  }
  mesh.position.y = config.height / 2;
  mesh.castShadow = true;
  group.add(mesh);

  // HP bar for breakable obstacles
  let hpBarFill: THREE.Mesh | null = null;
  if (config.type === 'breakable' && config.hp > 0) {
    const { bg, fill } = createHpBar(1.0, 0.1, config.height + 0.3);
    group.add(bg);
    group.add(fill);
    hpBarFill = fill;
  }

  scene.add(group);

  const collidable: Collidable = {
    pos:         { x: pos.x, z: pos.z },
    vel:         { x: 0, z: 0 },
    radius:      config.radius,
    mass:        config.mass,
    isStatic:    config.type === 'breakable',
    rpm:         1,
    rpmCapacity: 1,
    heatFactor:  config.heatFactor,
  };
  collidables.push(collidable);
  tagCollidable(collidable, 'obstacle');

  const id = nextEntityId();

  return {
    id,
    config,
    collidable,
    group,
    hp:          config.hp,
    maxHp:       config.hp,
    hpBarFill,
    alive:       true,
    originalPos: { x: pos.x, z: pos.z },
  };
}

// ─── Sync (movable only) ─────────────────────────────────────────────────────

export function syncObstacle(obstacle: ObstacleState): void {
  if (!obstacle.alive || obstacle.collidable.isStatic) return;
  obstacle.group.position.x = obstacle.collidable.pos.x;
  obstacle.group.position.z = obstacle.collidable.pos.z;
}

// ─── Damage (breakable only) ─────────────────────────────────────────────────

/** Compute HP damage from a collision impact force. */
export function obstacleHpDamage(impactForce: number): number {
  return impactForce * OBSTACLE_DAMAGE_SCALE;
}

/** Apply damage. Returns true if obstacle should die. */
export function applyDamageToObstacle(obstacle: ObstacleState, damage: number): boolean {
  obstacle.hp = Math.max(0, obstacle.hp - damage);
  if (obstacle.hpBarFill) {
    updateHpBar(obstacle.hpBarFill, obstacle.hp / obstacle.maxHp, 0.5);
  }
  return obstacle.hp <= 0;
}

// ─── Destroy ─────────────────────────────────────────────────────────────────

export function destroyObstacle(obstacle: ObstacleState): void {
  obstacle.alive = false;
  deregisterEntity(obstacle.id);
  untagCollidable(obstacle.collidable);
  scene.remove(obstacle.group);
  const idx = collidables.indexOf(obstacle.collidable);
  if (idx !== -1) collidables.splice(idx, 1);
}
