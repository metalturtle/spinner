import * as THREE from 'three';
import { scene } from './renderer';
import { ARENA_SIZE } from './constants';
import { collidables, type Collidable, type Vec2 } from './physics';
import { createHpBar, updateHpBar } from './hpBar';
import {
  nextEntityId, registerMovement,
  tagCollidable, untagCollidable, deregisterEntity,
} from './systems';

// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

export interface SlugwormConfig {
  hp:               number;
  radius:           number;
  mass:             number;
  heatFactor:       number;

  maxSpeed:         number;
  acceleration:     number;
  friction:         number;

  segmentCount:     number;    // visual body segments (including head)
  segmentSpacing:   number;    // distance between segment centers
  segmentRadius:    number;    // visual radius of each segment

  headArc:          number;    // half-angle (radians) of the poison head zone

  // Shooting (big slug only — set speed to 0 to disable)
  projectileSpeed:  number;
  projectileDamage: number;
  fireInterval:     number;    // seconds between shots
  poisonDrain:      number;    // RPM drained per contact frame with head

  color:            number;
  headColor:        number;
  bellyColor:       number;
}

export const BIG_SLUGWORM: SlugwormConfig = {
  hp:               40,
  radius:           1.0,
  mass:             3.0,
  heatFactor:       0.8,

  maxSpeed:         4,
  acceleration:     8,
  friction:         0.92,

  segmentCount:     8,
  segmentSpacing:   0.7,
  segmentRadius:    0.45,

  headArc:          Math.PI / 3,  // ±60° front arc is poison

  projectileSpeed:  8,
  projectileDamage: 8,
  fireInterval:     3.0,
  poisonDrain:      15,       // RPM/s drained on head contact

  color:            0x2d6b1a,
  headColor:        0x8b2fc9,
  bellyColor:       0x4a8c25,
};

export const BABY_SLUGWORM: SlugwormConfig = {
  hp:               5,
  radius:           0.4,
  mass:             0.5,
  heatFactor:       0.2,

  maxSpeed:         2.5,
  acceleration:     5,
  friction:         0.90,

  segmentCount:     4,
  segmentSpacing:   0.3,
  segmentRadius:    0.18,

  headArc:          0,        // baby has no poison head

  projectileSpeed:  0,        // no shooting
  projectileDamage: 0,
  fireInterval:     999,
  poisonDrain:      0,

  color:            0x3d8520,
  headColor:        0x3d8520,
  bellyColor:       0x5aad30,
};

// ═══════════════════════════════════════════════════════════════════════════════
//  AI STATES
// ═══════════════════════════════════════════════════════════════════════════════

type SlugAIState = 'wander' | 'chase' | 'shoot_cooldown';

// ─── Fire event (returned to game.ts) ───────────────────────────────────────

export interface SlugFireEvent {
  firePos: Vec2;
  fireDir: Vec2;
  speed:   number;
  damage:  number;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════════════════════

export interface SlugwormState {
  id:          number;
  config:      SlugwormConfig;
  collidable:  Collidable;
  group:       THREE.Group;
  bodyMat:     THREE.MeshStandardMaterial;
  headMat:     THREE.MeshStandardMaterial;
  bellyMats:   THREE.MeshStandardMaterial[];
  hpBarFill:   THREE.Mesh;
  hp:          number;
  maxHp:       number;
  alive:       boolean;
  isBig:       boolean;

  // Segment trail (head = index 0, older positions trail behind)
  segX:        Float32Array;
  segZ:        Float32Array;
  segMeshes:   THREE.Mesh[];

  // Facing direction (unit vector)
  facingX:     number;
  facingZ:     number;

  // AI
  aiState:     SlugAIState;
  stateTimer:  number;
  wanderDirX:  number;
  wanderDirZ:  number;
  fireCooldown: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

export function createSlugworm(pos: Vec2, config: SlugwormConfig): SlugwormState {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);

  const isBig = config.projectileSpeed > 0;

  // ── Build segments ────────────────────────────────────────────────────────
  const segMeshes: THREE.Mesh[] = [];
  const bellyMats: THREE.MeshStandardMaterial[] = [];

  // Head material — glows purple/toxic for big slug
  const headMat = new THREE.MeshStandardMaterial({
    color:     config.headColor,
    emissive:  isBig ? config.headColor : 0x000000,
    emissiveIntensity: isBig ? 0.6 : 0,
    roughness: 0.7,
    metalness: 0.2,
  });

  // Body material
  const bodyMat = new THREE.MeshStandardMaterial({
    color:     config.color,
    roughness: 0.8,
    metalness: 0.1,
  });

  const segGeo = new THREE.SphereGeometry(1, 12, 8);

  for (let i = 0; i < config.segmentCount; i++) {
    const isHead = i === 0;
    const mat = isHead ? headMat : new THREE.MeshStandardMaterial({
      color:     config.bellyColor,
      roughness: 0.8,
      metalness: 0.1,
    });
    if (!isHead) bellyMats.push(mat);

    const mesh = new THREE.Mesh(segGeo, mat);
    // Head is biggest, segments taper toward the tail
    const taper = isHead ? 1.0 : 1.0 - (i / config.segmentCount) * 0.5;
    const r = config.segmentRadius * taper;
    mesh.scale.set(r, r * 0.6, r); // squished vertically — slug-like
    mesh.position.y = r * 0.6;     // sit on floor
    mesh.castShadow = true;
    group.add(mesh);
    segMeshes.push(mesh);
  }

  // ── Poison glow light for big slug head ───────────────────────────────────
  if (isBig) {
    const light = new THREE.PointLight(0x9933ff, 2.0, 5, 1.5);
    light.position.y = 0.8;
    segMeshes[0].add(light);
  }

  // ── HP bar ────────────────────────────────────────────────────────────────
  const barWidth = isBig ? 1.4 : 0.6;
  const { bg, fill } = createHpBar(barWidth, 0.08, isBig ? 1.5 : 0.8);
  group.add(bg);
  group.add(fill);

  scene.add(group);

  // ── Collidable ────────────────────────────────────────────────────────────
  const rpmCapacity = 100;
  const col: Collidable = {
    pos:         { x: pos.x, z: pos.z },
    vel:         { x: 0, z: 0 },
    radius:      config.radius,
    mass:        config.mass,
    isStatic:    false,
    rpm:         rpmCapacity * 0.7,
    rpmCapacity,
    heatFactor:  config.heatFactor,
  };
  collidables.push(col);

  const id = nextEntityId();
  registerMovement(id, col, config.maxSpeed, config.friction);
  tagCollidable(col, isBig ? 'slug_big' : 'slug_baby');

  // ── Init segment positions ────────────────────────────────────────────────
  const segX = new Float32Array(config.segmentCount).fill(pos.x);
  const segZ = new Float32Array(config.segmentCount).fill(pos.z);

  // Pick random initial wander direction
  const wanderAngle = Math.random() * Math.PI * 2;

  const slug: SlugwormState = {
    id, config, collidable: col, group, bodyMat, headMat, bellyMats,
    hpBarFill: fill,
    hp: config.hp, maxHp: config.hp,
    alive: true, isBig,
    segX, segZ, segMeshes,
    facingX: Math.cos(wanderAngle), facingZ: Math.sin(wanderAngle),
    aiState: 'wander',
    stateTimer: 2 + Math.random() * 3,
    wanderDirX: Math.cos(wanderAngle),
    wanderDirZ: Math.sin(wanderAngle),
    fireCooldown: config.fireInterval,
  };
  col.owner = slug;
  return slug;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AI
// ═══════════════════════════════════════════════════════════════════════════════

export function updateSlugwormAI(
  slug:      SlugwormState,
  playerPos: Vec2,
  delta:     number,
): SlugFireEvent | null {
  if (!slug.alive) return null;

  const cfg  = slug.config;
  const body = slug.collidable;

  const dx   = playerPos.x - body.pos.x;
  const dz   = playerPos.z - body.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  // Wall avoidance
  const limit = ARENA_SIZE - 2.5;
  const wallAccel = cfg.acceleration * 0.8;
  if (body.pos.x >  limit) body.vel.x -= wallAccel * delta;
  if (body.pos.x < -limit) body.vel.x += wallAccel * delta;
  if (body.pos.z >  limit) body.vel.z -= wallAccel * delta;
  if (body.pos.z < -limit) body.vel.z += wallAccel * delta;

  // Baby slugs just wander. Big slugs chase and shoot.
  if (!slug.isBig) {
    // ── Baby wander AI ──────────────────────────────────────────────────────
    slug.stateTimer -= delta;
    if (slug.stateTimer <= 0) {
      // Pick new random direction
      const angle = Math.random() * Math.PI * 2;
      slug.wanderDirX = Math.cos(angle);
      slug.wanderDirZ = Math.sin(angle);
      slug.stateTimer = 3 + Math.random() * 4;
    }
    body.vel.x += slug.wanderDirX * cfg.acceleration * delta;
    body.vel.z += slug.wanderDirZ * cfg.acceleration * delta;
    return null;
  }

  // ── Big slug AI ───────────────────────────────────────────────────────────
  switch (slug.aiState) {
    case 'wander': {
      // Wander until player is close, then chase
      slug.stateTimer -= delta;
      if (slug.stateTimer <= 0) {
        const angle = Math.random() * Math.PI * 2;
        slug.wanderDirX = Math.cos(angle);
        slug.wanderDirZ = Math.sin(angle);
        slug.stateTimer = 2 + Math.random() * 3;
      }
      body.vel.x += slug.wanderDirX * cfg.acceleration * delta;
      body.vel.z += slug.wanderDirZ * cfg.acceleration * delta;

      if (dist < 14) {
        slug.aiState = 'chase';
      }
      break;
    }

    case 'chase': {
      // Slowly pursue player
      if (dist > 0.5) {
        const inv = 1 / dist;
        body.vel.x += dx * inv * cfg.acceleration * delta;
        body.vel.z += dz * inv * cfg.acceleration * delta;
      }

      // Fire poison
      slug.fireCooldown -= delta;
      if (slug.fireCooldown <= 0 && dist < 16) {
        slug.fireCooldown = cfg.fireInterval;
        slug.aiState = 'shoot_cooldown';
        slug.stateTimer = 0.5; // brief pause after shooting

        if (dist > 0.1) {
          const fireDir = { x: dx / dist, z: dz / dist };
          const firePos = {
            x: body.pos.x + fireDir.x * (cfg.radius + 0.3),
            z: body.pos.z + fireDir.z * (cfg.radius + 0.3),
          };
          return { firePos, fireDir, speed: cfg.projectileSpeed, damage: cfg.projectileDamage };
        }
      }

      if (dist > 18) slug.aiState = 'wander';
      break;
    }

    case 'shoot_cooldown': {
      // Slow down briefly after shooting
      body.vel.x *= 0.9;
      body.vel.z *= 0.9;
      slug.stateTimer -= delta;
      if (slug.stateTimer <= 0) {
        slug.aiState = 'chase';
      }
      break;
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DIRECTIONAL HIT CHECK — head vs belly
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns true if the player hit the slug from the FRONT (head/poison zone).
 * The head arc is defined by config.headArc (half-angle from facing direction).
 * If headArc is 0 (baby slug), always returns false.
 */
export function isHeadHit(slug: SlugwormState, playerPos: Vec2): boolean {
  if (slug.config.headArc <= 0) return false;

  const dx = playerPos.x - slug.collidable.pos.x;
  const dz = playerPos.z - slug.collidable.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;

  // Dot product of facing direction and direction to player
  const dot = slug.facingX * (dx / dist) + slug.facingZ * (dz / dist);
  // dot > cos(headArc) means player is within the front arc
  return dot > Math.cos(slug.config.headArc);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HP DAMAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function applyDamageToSlug(slug: SlugwormState, damage: number): boolean {
  slug.hp = Math.max(0, slug.hp - damage);
  updateHpBar(slug.hpBarFill, slug.hp / slug.maxHp, slug.isBig ? 0.7 : 0.3);
  return slug.hp <= 0;
}

export function isSlugDead(slug: SlugwormState): boolean {
  return slug.alive && slug.hp <= 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  VISUALS
// ═══════════════════════════════════════════════════════════════════════════════

export function updateSlugwormVisuals(
  slug:  SlugwormState,
  time:  number,
  delta: number,
): void {
  if (!slug.alive) return;

  const body = slug.collidable;
  const cfg  = slug.config;

  // ── Update facing direction from velocity ─────────────────────────────────
  const speed = Math.sqrt(body.vel.x ** 2 + body.vel.z ** 2);
  if (speed > 0.3) {
    slug.facingX = body.vel.x / speed;
    slug.facingZ = body.vel.z / speed;
  }

  // ── Update segment chain (head follows physics, rest follows ahead segment)
  slug.segX[0] = body.pos.x;
  slug.segZ[0] = body.pos.z;

  for (let i = 1; i < cfg.segmentCount; i++) {
    const targetX = slug.segX[i - 1];
    const targetZ = slug.segZ[i - 1];
    const dx = slug.segX[i] - targetX;
    const dz = slug.segZ[i] - targetZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > cfg.segmentSpacing) {
      const pull = (dist - cfg.segmentSpacing) / dist;
      slug.segX[i] -= dx * pull;
      slug.segZ[i] -= dz * pull;
    }
  }

  // ── Position segment meshes ───────────────────────────────────────────────
  // Segments are positioned relative to the group's world position
  slug.group.position.x = body.pos.x;
  slug.group.position.z = body.pos.z;

  for (let i = 0; i < cfg.segmentCount; i++) {
    const mesh = slug.segMeshes[i];
    // Local offset from group center (which is at body.pos)
    mesh.position.x = slug.segX[i] - body.pos.x;
    mesh.position.z = slug.segZ[i] - body.pos.z;

    // Subtle undulation
    const wave = Math.sin(time * 3 + i * 0.8) * 0.04;
    mesh.position.y = cfg.segmentRadius * (i === 0 ? 1.0 : (1.0 - (i / cfg.segmentCount) * 0.5)) * 0.6 + wave;
  }

  // ── Rotate head mesh to face movement direction ───────────────────────────
  if (speed > 0.2) {
    const headAngle = Math.atan2(slug.facingX, slug.facingZ);
    slug.segMeshes[0].rotation.y = headAngle;
  }

  // ── HP bar follows group ──────────────────────────────────────────────────
  // Already parented to group, so it auto-follows

  // ── Head glow pulse (big slug) ────────────────────────────────────────────
  if (slug.isBig) {
    const pulse = 0.4 + 0.3 * Math.sin(time * 2.5);
    slug.headMat.emissiveIntensity = pulse;
  }

  // ── Damage flash ──────────────────────────────────────────────────────────
  const hpFrac = slug.hp / slug.maxHp;
  if (hpFrac < 0.4) {
    const danger = 1 - hpFrac / 0.4;
    const pulse = 0.5 + 0.5 * Math.sin(time * 8);
    for (const mat of slug.bellyMats) {
      mat.emissive.setRGB(danger * pulse * 0.4, 0, 0);
      mat.emissiveIntensity = danger * pulse;
    }
  } else {
    for (const mat of slug.bellyMats) {
      mat.emissiveIntensity = 0;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DESTROY
// ═══════════════════════════════════════════════════════════════════════════════

export function destroySlugworm(slug: SlugwormState): void {
  slug.alive = false;
  deregisterEntity(slug.id);
  untagCollidable(slug.collidable);
  scene.remove(slug.group);
  const idx = collidables.indexOf(slug.collidable);
  if (idx !== -1) collidables.splice(idx, 1);
}
