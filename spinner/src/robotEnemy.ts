import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { scene } from './renderer';
import { ARENA_SIZE } from './constants';
import { collidables, type Collidable, type Vec2 } from './physics';
import { createHpBar, updateHpBar } from './hpBar';
import {
  nextEntityId, registerMovement,
  tagCollidable, untagCollidable, deregisterEntity,
} from './systems';

const DRONE_URL = new URL('../models/drone_animated.glb', import.meta.url).href;
const DRONE_MODEL_SCALE = 1.35;

let cachedDroneGltf: { scene: THREE.Group; animations: THREE.AnimationClip[] } | null = null;
const pendingDroneCallbacks: Array<(payload: { scene: THREE.Group; animations: THREE.AnimationClip[] }) => void> = [];

function getDroneAsset(cb: (payload: { scene: THREE.Group; animations: THREE.AnimationClip[] }) => void): void {
  if (cachedDroneGltf) {
    cb({
      scene: clone(cachedDroneGltf.scene) as THREE.Group,
      animations: cachedDroneGltf.animations,
    });
    return;
  }

  pendingDroneCallbacks.push(cb);
  if (pendingDroneCallbacks.length > 1) return;

  const loader = new GLTFLoader();
  loader.load(
    DRONE_URL,
    (gltf) => {
      cachedDroneGltf = { scene: gltf.scene, animations: gltf.animations };
      for (const fn of pendingDroneCallbacks) {
        fn({
          scene: clone(gltf.scene) as THREE.Group,
          animations: gltf.animations,
        });
      }
      pendingDroneCallbacks.length = 0;
    },
    undefined,
    (err) => console.error('[robotEnemy] Failed to load drone model:', err),
  );
}

// ─── Config ──────────────────────────────────────────────────────────────────

export interface RobotConfig {
  hp:               number;
  radius:           number;
  mass:             number;
  heatFactor:       number;   // RPM damage multiplier to player on body collision

  maxSpeed:         number;
  acceleration:     number;
  friction:         number;

  attackRange:      number;   // distance to enter strafe mode
  preferredRange:   number;   // ideal distance while strafing

  strafeTime:       number;   // seconds circling before firing
  prepareTime:      number;   // wind-up before shot
  cooldownTime:     number;   // pause after firing

  projectileSpeed:  number;
  projectileDamage: number;
  barrelTurnSpeed:  number;

  color:            number;
}

export const ROBOT_TIER_1: RobotConfig = {
  hp:               20,
  radius:           0.55,
  mass:             0.2,
  heatFactor:       0.6,

  maxSpeed:         8,
  acceleration:     20,
  friction:         0.94,

  attackRange:      12,
  preferredRange:   7,

  strafeTime:       2.5,
  prepareTime:      0.6,
  cooldownTime:     1.0,

  projectileSpeed:  26,
  projectileDamage: 12,
  barrelTurnSpeed:  4.0,

  color:            0x44aacc,
};

// ─── AI State ─────────────────────────────────────────────────────────────────

type RobotAIState = 'chase' | 'strafe' | 'prepare' | 'shoot' | 'cooldown';

// ─── Fire event (returned to game.ts) ────────────────────────────────────────

export interface RobotFireEvent {
  firePos: Vec2;
  fireDir: Vec2;
  speed:   number;
  damage:  number;
}

// ─── State ───────────────────────────────────────────────────────────────────

export interface RobotEnemyState {
  id:           number;
  config:       RobotConfig;
  collidable:   Collidable;
  group:        THREE.Group;
  bodyMat:      THREE.MeshStandardMaterial;
  eyeMatL:      THREE.MeshStandardMaterial;
  eyeMatR:      THREE.MeshStandardMaterial;
  cannonMat:    THREE.MeshStandardMaterial;
  barrelPivot:  THREE.Group;
  modelRoot:    THREE.Group;
  droneMixer:   THREE.AnimationMixer | null;
  barrelAngle:  number;
  hpBarFill:    THREE.Mesh;
  hp:           number;
  maxHp:        number;
  alive:        boolean;

  // AI
  aiState:      RobotAIState;
  stateTimer:   number;
  strafeDir:    1 | -1;      // +1 = CCW, -1 = CW around player
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createRobotEnemy(pos: Vec2, config: RobotConfig): RobotEnemyState {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);

  // Base platform
  const baseMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.55, 0.25, 12),
    new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.6, metalness: 0.7 }),
  );
  baseMesh.position.y = 0.125;
  baseMesh.castShadow = true;
  group.add(baseMesh);

  // Body — boxy torso
  const bodyMat = new THREE.MeshStandardMaterial({
    color: config.color, roughness: 0.4, metalness: 0.6,
  });
  const bodyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.9, 0.7),
    bodyMat,
  );
  bodyMesh.position.y = 0.7;
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // Head — smaller box on top
  const headMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.4, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.5, metalness: 0.5 }),
  );
  headMesh.position.y = 1.35;
  headMesh.castShadow = true;
  group.add(headMesh);

  const modelRoot = new THREE.Group();
  modelRoot.position.y = 0.75;
  group.add(modelRoot);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.08, 8, 6);
  const eyeMatL = new THREE.MeshStandardMaterial({
    color: 0xff3300, emissive: 0xff3300, emissiveIntensity: 1.0,
  });
  const eyeMatR = new THREE.MeshStandardMaterial({
    color: 0xff3300, emissive: 0xff3300, emissiveIntensity: 1.0,
  });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMatL);
  eyeL.position.set(-0.14, 1.38, 0.26);
  group.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMatR);
  eyeR.position.set( 0.14, 1.38, 0.26);
  group.add(eyeR);

  // Cannon pivot (mounted on body front)
  const barrelPivot = new THREE.Group();
  barrelPivot.position.set(0, 0.75, 0);
  group.add(barrelPivot);

  const cannonMat = new THREE.MeshStandardMaterial({
    color: 0x556677, roughness: 0.3, metalness: 0.9,
  });
  const cannonBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.14, 0.45, 8),
    cannonMat,
  );
  cannonBody.rotation.x = Math.PI / 2;
  cannonBody.position.z = 0.38;
  barrelPivot.add(cannonBody);

  // Cannon tip glow sphere
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xff6600, emissive: 0xff6600, emissiveIntensity: 0.0,
    roughness: 0.2, metalness: 0.4,
  });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), tipMat);
  tip.position.z = 0.65;
  barrelPivot.add(tip);

  // HP bar
  const { bg, fill } = createHpBar(1.0, 0.1, 2.0);
  group.add(bg);
  group.add(fill);

  scene.add(group);

  // Collidable — uses fake rpm so playerRpmHooks formula works for player damage
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
  tagCollidable(col, 'robot');

  const robotState: RobotEnemyState = {
    id, config, collidable: col, group, bodyMat,
    eyeMatL, eyeMatR, cannonMat,
    barrelPivot, modelRoot, droneMixer: null, barrelAngle: 0,
    hpBarFill: fill,
    hp: config.hp, maxHp: config.hp,
    alive: true,
    aiState: 'chase',
    stateTimer: 0,
    strafeDir: 1,
  };

  getDroneAsset(({ scene: droneScene, animations }) => {
    if (!group.parent) return;

    const box = new THREE.Box3().setFromObject(droneScene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    droneScene.position.set(-center.x, -center.y, -center.z);

    const root = new THREE.Group();
    root.add(droneScene);
    root.scale.setScalar(DRONE_MODEL_SCALE / maxDim);

    const modelMats: THREE.MeshStandardMaterial[] = [];
    droneScene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const mat = mesh.material;
      if (mat instanceof THREE.MeshStandardMaterial) modelMats.push(mat);
    });

    root.onBeforeRender = () => {
      for (const m of modelMats) {
        m.emissive.copy(bodyMat.emissive);
        m.emissiveIntensity = bodyMat.emissiveIntensity;
      }
    };

    modelRoot.clear();
    modelRoot.add(root);
    baseMesh.visible = false;
    bodyMesh.visible = false;
    headMesh.visible = false;

    const mixer = animations.length > 0 ? new THREE.AnimationMixer(droneScene) : null;
    if (mixer) {
      for (const clip of animations) {
        const action = mixer.clipAction(clip);
        action.play();
      }
    }
    robotState.droneMixer = mixer;
  });

  return robotState;
}

// ─── AI ──────────────────────────────────────────────────────────────────────

/**
 * Returns a RobotFireEvent when the robot shoots, null otherwise.
 * Call in the entity-update phase (before movementSystem).
 */
export function updateRobotAI(
  robot:     RobotEnemyState,
  playerPos: Vec2,
  delta:     number,
): RobotFireEvent | null {
  if (!robot.alive) return null;

  const cfg  = robot.config;
  const body = robot.collidable;

  const dx   = playerPos.x - body.pos.x;
  const dz   = playerPos.z - body.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  // Wall avoidance — gentle repulsion near edges
  const limit = ARENA_SIZE - 2.5;
  const wallAccel = cfg.acceleration * 0.6;
  if (body.pos.x >  limit) body.vel.x -= wallAccel * delta;
  if (body.pos.x < -limit) body.vel.x += wallAccel * delta;
  if (body.pos.z >  limit) body.vel.z -= wallAccel * delta;
  if (body.pos.z < -limit) body.vel.z += wallAccel * delta;

  switch (robot.aiState) {

    // ── Chase: rush toward player until in attack range ──
    case 'chase': {
      if (dist > 0.1) {
        const inv = 1 / dist;
        body.vel.x += dx * inv * cfg.acceleration * delta;
        body.vel.z += dz * inv * cfg.acceleration * delta;
      }
      if (dist <= cfg.attackRange) {
        robot.aiState   = 'strafe';
        robot.stateTimer = cfg.strafeTime;
        robot.strafeDir  = Math.random() < 0.5 ? 1 : -1;
      }
      break;
    }

    // ── Strafe: circle player at preferred range, then prepare to shoot ──
    case 'strafe':
    case 'cooldown': {
      // Approach / retreat to preferred range
      const rangeDiff = dist - cfg.preferredRange;
      const radialAccel = Math.sign(rangeDiff) * Math.min(Math.abs(rangeDiff) * 2, cfg.acceleration * 0.7);
      if (dist > 0.1) {
        const inv = 1 / dist;
        body.vel.x += dx * inv * radialAccel * delta;
        body.vel.z += dz * inv * radialAccel * delta;
      }

      // Lateral strafe (perpendicular to player direction)
      const perpX = -dz / (dist || 1) * robot.strafeDir;
      const perpZ =  dx / (dist || 1) * robot.strafeDir;
      body.vel.x += perpX * cfg.acceleration * 0.8 * delta;
      body.vel.z += perpZ * cfg.acceleration * 0.8 * delta;

      robot.stateTimer -= delta;

      if (robot.aiState === 'strafe' && robot.stateTimer <= 0) {
        robot.aiState   = 'prepare';
        robot.stateTimer = cfg.prepareTime;
      } else if (robot.aiState === 'cooldown' && robot.stateTimer <= 0) {
        if (dist > cfg.attackRange * 1.4) {
          robot.aiState = 'chase';
        } else {
          robot.aiState   = 'strafe';
          robot.stateTimer = cfg.strafeTime;
          robot.strafeDir  = Math.random() < 0.5 ? 1 : -1;
        }
      }
      break;
    }

    // ── Prepare: slow down, aim, charge up ──
    case 'prepare': {
      body.vel.x *= 0.88;
      body.vel.z *= 0.88;
      robot.stateTimer -= delta;
      if (robot.stateTimer <= 0) {
        robot.aiState = 'shoot';
      }
      break;
    }

    // ── Shoot: fire and immediately go to cooldown ──
    case 'shoot': {
      robot.aiState   = 'cooldown';
      robot.stateTimer = cfg.cooldownTime;

      // Aim directly at player (locked at moment of fire)
      const aimLen = dist;
      if (aimLen < 0.1) break;

      const fireDir = { x: dx / aimLen, z: dz / aimLen };
      const firePos = {
        x: body.pos.x + fireDir.x * (cfg.radius + 0.15),
        z: body.pos.z + fireDir.z * (cfg.radius + 0.15),
      };
      return { firePos, fireDir, speed: cfg.projectileSpeed, damage: cfg.projectileDamage };
    }
  }

  return null;
}

// ─── HP Damage ───────────────────────────────────────────────────────────────

/** Apply HP damage from a player collision. Returns true if robot died. */
export function applyDamageToRobot(robot: RobotEnemyState, damage: number): boolean {
  robot.hp = Math.max(0, robot.hp - damage);
  updateHpBar(robot.hpBarFill, robot.hp / robot.maxHp, 0.5);
  return robot.hp <= 0;
}

export function isRobotDead(robot: RobotEnemyState): boolean {
  return robot.alive && robot.hp <= 0;
}

// ─── Visuals ─────────────────────────────────────────────────────────────────

export function updateRobotVisuals(
  robot:     RobotEnemyState,
  playerPos: Vec2,
  time:      number,
  delta:     number,
): void {
  if (!robot.alive) return;

  const body = robot.collidable;

  // Sync group position
  robot.group.position.x = body.pos.x;
  robot.group.position.z = body.pos.z;
  robot.droneMixer?.update(delta);

  // Face movement direction (body rotates to face where it's going)
  const speed = Math.sqrt(body.vel.x ** 2 + body.vel.z ** 2);
  if (speed > 0.5) {
    const targetAngle = Math.atan2(body.vel.x, body.vel.z);
    let diff = targetAngle - robot.group.rotation.y;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    robot.group.rotation.y += diff * Math.min(5.0 * delta, 1.0);
  }

  // Cannon aims at player (world space → local angle)
  const dx = playerPos.x - body.pos.x;
  const dz = playerPos.z - body.pos.z;
  const targetBarrel = Math.atan2(dx, dz) - robot.group.rotation.y;
  let barrelDiff = targetBarrel - robot.barrelAngle;
  while (barrelDiff >  Math.PI) barrelDiff -= 2 * Math.PI;
  while (barrelDiff < -Math.PI) barrelDiff += 2 * Math.PI;
  robot.barrelAngle += Math.sign(barrelDiff)
    * Math.min(Math.abs(barrelDiff), robot.config.barrelTurnSpeed * delta);
  robot.barrelPivot.rotation.y = robot.barrelAngle;

  // Eye pulse — always alive glow
  const eyePulse = 0.8 + 0.2 * Math.sin(time * 3 * Math.PI * 2);
  robot.eyeMatL.emissiveIntensity = eyePulse;
  robot.eyeMatR.emissiveIntensity = eyePulse;

  // State-driven cannon tip glow
  if (robot.aiState === 'prepare') {
    const chargeT = 1 - robot.stateTimer / robot.config.prepareTime;
    const glow = chargeT * chargeT * 3.0;
    const tip = robot.barrelPivot.children[1] as THREE.Mesh;
    (tip.material as THREE.MeshStandardMaterial).emissiveIntensity = glow;
    // Eyes flare during wind-up
    robot.eyeMatL.emissiveIntensity = 1.0 + glow * 0.5;
    robot.eyeMatR.emissiveIntensity = 1.0 + glow * 0.5;
  } else {
    const tip = robot.barrelPivot.children[1] as THREE.Mesh;
    (tip.material as THREE.MeshStandardMaterial).emissiveIntensity =
      robot.aiState === 'cooldown' ? 0.4 : 0.0;
  }

  // Body colour — reddens at low HP
  const hpFrac = robot.hp / robot.maxHp;
  if (hpFrac < 0.4) {
    const danger = 1 - hpFrac / 0.4;
    const pulse  = 0.5 + 0.5 * Math.sin(time * 6 * Math.PI * 2);
    robot.bodyMat.emissive.setRGB(danger * pulse * 0.5, 0, 0);
    robot.bodyMat.emissiveIntensity = danger * pulse;
  } else {
    robot.bodyMat.emissiveIntensity = 0;
  }
}

// ─── Destroy ─────────────────────────────────────────────────────────────────

export function destroyRobotEnemy(robot: RobotEnemyState): void {
  robot.alive = false;
  deregisterEntity(robot.id);
  untagCollidable(robot.collidable);
  scene.remove(robot.group);
  const idx = collidables.indexOf(robot.collidable);
  if (idx !== -1) collidables.splice(idx, 1);
}
