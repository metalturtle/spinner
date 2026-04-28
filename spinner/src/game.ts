import * as THREE from 'three';
import { renderer, scene, camera } from './renderer';
import { createArena } from './arena';
import {
  RPM_HALF_POINT_RATIO, COLLISION_DAMAGE_RATIO,
  PICKUP_RPM_BOOST, HYPER_BOOST,
} from './constants';
import { spinnerConfig } from './spinnerConfig';
import { runCollisions, collidables, zones, type Collidable } from './physics';
import { initHud, updateHud } from './hud';
import { initCamera, updateCamera } from './camera';
import {
  defineEntityType,
  registerCollisionPair, registerProximityPair,
  entityUpdateSystem, movementSystem, collisionSystem, proximitySystem, rpmSystem,
  resetEntityRegistrations, deregisterEntity, untagCollidable,
} from './systems';
import {
  playerBody, setupPlayer, resetPlayer,
  playerRpmHooks, updatePlayerVisuals, updateTopple, notifyHit as notifyPlayerHit,
  startPlayerPitFallDeath, startPlayerToppleDeath,
} from './player';
import {
  createNormalPickup, createHyperPickup, updatePickups, spawnPickupAt, ejectPickupAt,
  collectPickup, pickupRpmGain, type Pickup,
} from './pickup';
import { type LevelData, lvPos } from './levelLoader';
import level1 from './levels/level1.json';
import level2 from './levels/level2.json';
import level3 from './levels/level3.json';
import level4 from './levels/level4.json';
import level5 from './levels/level5.json';
import levelActive from './levels/level-active.json';
import { createTurret, updateTurret, applyDamageToTurret, destroyTurret, TURRET_TIER_1 } from './turret';
import { createProjectile, updateProjectiles, type Projectile } from './projectile';
import { createExplosion, createRobotExplosion, updateExplosions, type Explosion } from './explosion';
import {
  createObstacle, syncObstacle, obstacleHpDamage, applyDamageToObstacle, destroyObstacle,
  CRATE_CONFIG, BARREL_CONFIG, type ObstacleState,
} from './obstacle';
import {
  createEnemySpinner, updateEnemyAI, updateEnemyVisuals,
  onEnemyCollision, isEnemyDead, destroyEnemySpinner,
  ENEMY_SPINNER_TIER_1, type EnemySpinnerState,
} from './enemySpinner';
import {
  createZombieEnemy, updateZombieAI, updateZombieVisuals,
  applyDamageToZombie, isZombieDead, destroyZombieEnemy,
  ZOMBIE_TIER_1, type ZombieState,
} from './zombieEnemy';
import {
  createDreadnought, updateDreadnoughtAI, updateDreadnoughtVisuals,
  checkWeakPoint, isDreadnoughtDead, destroyDreadnought,
  type DreadnoughtState,
} from './bossDreadnought';
import { DREADNOUGHT_TIER_1, SIEGE_ENGINE_TIER_1 } from './bossDesigns';
import {
  createSiegeEngine, updateSiegeEngineAI, syncSiegeEngineParts,
  updateSiegeEngineTurrets, updateSiegeEngineVisuals,
  isShieldAlive, applyDamageToSiegePart, isSiegeEngineDead, destroySiegeEngine,
  type SiegeEngineState,
} from './bossSiegeEngine';
import {
  createSpiderReliquary, updateSpiderReliquaryAI, syncSpiderReliquaryLegs,
  updateSpiderReliquaryVisuals, canDamageSpiderCore, getSpiderCoreDamageMultiplier,
  applyDamageToSpiderLeg, isSpiderReliquaryDead, destroySpiderReliquary,
  SPIDER_RELIQUARY_TIER_1, type SpiderReliquaryState,
} from './bossSpiderReliquary';
import {
  createRobotEnemy, updateRobotAI, updateRobotVisuals,
  applyDamageToRobot, isRobotDead, destroyRobotEnemy, ROBOT_TIER_1,
  type RobotEnemyState,
} from './robotEnemy';
import {
  createHiveBoss, updateHiveAI, updateHiveChaingun, syncFlockPositions,
  updateHiveVisuals, onFlockCollision, isFlockSpinnerDead, destroyFlockSpinner,
  applyDamageToHiveCore, isHiveBossDead, destroyHiveBoss, HIVE_TIER_1,
  type HiveBossState,
} from './bossHive';
import { initSparks, emitSparks, emitGoo, emitPlasma, emitBlood, updateSparks, resetSparks, computeContactInfo } from './sparks';
import { hasPlayerWallHit } from './physics';
import { initTrails, updateTrails, resetTrails } from './trails';
import {
  createSlugworm, updateSlugwormAI, updateSlugwormVisuals,
  isHeadHit, applyDamageToSlug, isSlugDead, destroySlugworm,
  BIG_SLUGWORM, BABY_SLUGWORM, type SlugwormState,
} from './slugworm';
import { createPoisonProjectile } from './projectile';
import { initGooDecals, spawnGooSplat, spawnBloodSplat, updateGooDecals, resetGooDecals } from './gooDecals';
import { spawnZombieGibs, updateGibs, resetGibs } from './gibs';
import { updateRicochetBubbles, resetRicochetBubbles } from './ricochetBubbles';
import { createLevelPointLightRoot, setupLevelLights, clearLevelLights } from './levelLights';
import { updateLavaSurfaces } from './lavaSurface';
import { initLavaEmbers, resetLavaEmbers, updateLavaEmbers } from './lavaEmbers';
import { createFireTorch, destroyFireTorch, type FireTorch, updateFireTorch } from './fireTorch';
import { initSpaceBackground, updateSpaceBackground } from './spaceBackground';
import type { LevelCircle, LevelEntity, LevelPolygon } from './levelLoader';


// ─── Level-driven state ──────────────────────────────────────────────────────

let currentLevel: LevelData = levelActive as LevelData;


// ─── Scene Setup ─────────────────────────────────────────────────────────────

createArena(scene, currentLevel);
setupLevelLights(scene, currentLevel);
initHud();
initCamera();
initSparks(scene);
initTrails(scene);
initGooDecals(scene);
initLavaEmbers(scene);
// initSpaceBackground();

// ─── Entity Type Managers ─────────────────────────────────────────────────────

const TurretEntities      = defineEntityType({ create: createTurret,       destroy: destroyTurret       });
const EnemyEntities       = defineEntityType({ create: createEnemySpinner,  destroy: destroyEnemySpinner  });
const ZombieEntities      = defineEntityType({ create: createZombieEnemy,   destroy: destroyZombieEnemy   });
const ObstacleEntities    = defineEntityType({ create: createObstacle,      destroy: destroyObstacle      });
const DreadnoughtEntities = defineEntityType({ create: createDreadnought,   destroy: destroyDreadnought   });
const SiegeEntities       = defineEntityType({ create: createSiegeEngine,   destroy: destroySiegeEngine   });
const SpiderEntities      = defineEntityType({ create: createSpiderReliquary, destroy: destroySpiderReliquary });
const RobotEntities       = defineEntityType({ create: createRobotEnemy,    destroy: destroyRobotEnemy    });
const HiveEntities        = defineEntityType({ create: createHiveBoss,      destroy: destroyHiveBoss      });
const BigSlugEntities     = defineEntityType({ create: createSlugworm,      destroy: destroySlugworm      });
const BabySlugEntities    = defineEntityType({ create: createSlugworm,      destroy: destroySlugworm      });

// ─── Collision Pair Handlers (permanent, registered once) ────────────────────

registerCollisionPair('player', 'turret', (_playerCol, turretCol, hit) => {
  const turret = TurretEntities.getAll().find(t => t.collidable === turretCol);
  if (!turret?.alive) return;
  const safePlayerRpm = Math.max(0.01, playerBody.rpm);
  const safeEnemyRpm  = Math.max(0.01, turretCol.rpm);
  const hpDamage = COLLISION_DAMAGE_RATIO * playerBody.rpmCapacity
    * hit.impactForce * (playerBody.mass / turretCol.mass)
    * (safePlayerRpm / safeEnemyRpm) * playerBody.heatFactor;
  if (applyDamageToTurret(turret, hpDamage)) {
    const pos = { x: turret.pos.x, z: turret.pos.z };
    TurretEntities.destroy(turret);
    explosions.push(createExplosion(pos));
  }
  const { point, normal } = computeContactInfo(_playerCol, turretCol);
  emitSparks(point, normal, Math.floor(10 + hit.impactForce * 8), Math.min(1, hit.impactForce / 10));
});

registerCollisionPair('player', 'obstacle', (_playerCol, obsCol, hit) => {
  const obs = ObstacleEntities.getAll().find(o => o.collidable === obsCol);
  if (!obs?.alive || obs.config.type !== 'breakable') return;
  const hpDamage = obstacleHpDamage(hit.impactForce);
  if (applyDamageToObstacle(obs, hpDamage)) {
    const pos = { x: obsCol.pos.x, z: obsCol.pos.z };
    ObstacleEntities.destroy(obs);
    explosions.push(createExplosion(pos));
  }
  const { point, normal } = computeContactInfo(_playerCol, obsCol);
  emitSparks(point, normal, Math.floor(6 + hit.impactForce * 5), Math.min(1, hit.impactForce / 10));
});

registerCollisionPair('player', 'enemy', (_playerCol, enemyCol, hit) => {
  const enemy = EnemyEntities.getAll().find(e => e.collidable === enemyCol);
  if (enemy?.alive) onEnemyCollision(enemy);
  const { point, normal } = computeContactInfo(_playerCol, enemyCol);
  emitSparks(point, normal, Math.floor(12 + hit.impactForce * 10), Math.min(1, hit.impactForce / 8));
});

registerCollisionPair('player', 'zombie', (_playerCol, zombieCol, hit) => {
  const zombie = ZombieEntities.getAll().find((z) => z.collidable === zombieCol);
  if (!zombie?.alive) return;

  const playerSpeed = Math.hypot(playerBody.vel.x, playerBody.vel.z);
  if (hit.impactForce >= zombie.config.gibImpactThreshold || playerSpeed >= zombie.config.gibImpactThreshold + 1.5) {
    killZombie(zombie, true);
    return;
  }

  const hpDamage = hit.impactForce * zombie.config.impactDamageScale
    * Math.max(0.35, playerBody.rpm / playerBody.rpmCapacity);
  applyDamageToZombie(zombie, hpDamage);

  const { point, normal } = computeContactInfo(_playerCol, zombieCol);
  emitBlood(point, Math.floor(24 + hit.impactForce * 7), Math.min(1, 0.95 + hit.impactForce / 10));
  emitSparks(point, normal, Math.floor(5 + hit.impactForce * 3), Math.min(1, hit.impactForce / 10));
});

// ── Siege Engine: core damage (only if shield is down) ──
registerCollisionPair('player', 'siege_core', (_playerCol, coreCol, hit) => {
  const siege = SiegeEntities.getAll().find(s => s.collidable === coreCol);
  if (!siege?.alive) return;
  if (isShieldAlive(siege)) return;  // shield blocks core damage

  const safePlayerRpm = Math.max(0.01, playerBody.rpm);
  const safeEnemyRpm  = Math.max(0.01, coreCol.rpm);
  const rpmDamage = COLLISION_DAMAGE_RATIO * playerBody.rpmCapacity
    * hit.impactForce * (playerBody.mass / coreCol.mass)
    * (safePlayerRpm / safeEnemyRpm) * playerBody.heatFactor;
  siege.collidable.rpm = Math.max(0, siege.collidable.rpm - rpmDamage);
  const { point, normal } = computeContactInfo(_playerCol, coreCol);
  emitSparks(point, normal, Math.floor(15 + hit.impactForce * 12), Math.min(1, hit.impactForce / 8));
});

// ── Siege Engine: sub-part HP damage ──
registerCollisionPair('player', 'siege_part', (_playerCol, partCol, hit) => {
  for (const siege of SiegeEntities.getAll()) {
    if (!siege.alive) continue;
    const part = siege.parts.find(p => p.alive && p.collidable === partCol);
    if (!part) continue;

    const hpDamage = hit.impactForce * 0.4;

    // Eject pickups outward from the hit part on significant impacts
    if (hit.impactForce > 2.0) {
      const count = hit.impactForce > 6.0 ? 2 : 1;
      const dx = partCol.pos.x - siege.collidable.pos.x;
      const dz = partCol.pos.z - siege.collidable.pos.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      for (let i = 0; i < count; i++) {
        const spread = (Math.random() - 0.5) * 2;
        const speed = 5 + Math.random() * 4;
        ejectPickupAt(pickups, { x: partCol.pos.x, z: partCol.pos.z }, {
          x: (dx / len + spread * 0.4) * speed,
          z: (dz / len + spread * 0.4) * speed,
        });
      }
    }

    if (applyDamageToSiegePart(siege, part, hpDamage)) {
      explosions.push(createExplosion({ x: partCol.pos.x, z: partCol.pos.z }));
    }
    const { point, normal } = computeContactInfo(_playerCol, partCol);
    emitSparks(point, normal, Math.floor(10 + hit.impactForce * 8), Math.min(1, hit.impactForce / 8));
    return;
  }
});

registerCollisionPair('player', 'spider_core', (_playerCol, coreCol, hit) => {
  const spider = SpiderEntities.getAll().find((boss) => boss.collidable === coreCol);
  if (!spider?.alive) return;

  const { point, normal } = computeContactInfo(_playerCol, coreCol);
  if (!canDamageSpiderCore(spider)) {
    emitSparks(point, normal, Math.floor(16 + hit.impactForce * 10), Math.min(1, hit.impactForce / 7));
    return;
  }

  const safePlayerRpm = Math.max(0.01, playerBody.rpm);
  const safeEnemyRpm = Math.max(0.01, coreCol.rpm);
  const rpmDamage = COLLISION_DAMAGE_RATIO * playerBody.rpmCapacity
    * hit.impactForce * (playerBody.mass / coreCol.mass)
    * (safePlayerRpm / safeEnemyRpm) * playerBody.heatFactor
    * getSpiderCoreDamageMultiplier(spider);
  spider.collidable.rpm = Math.max(0, spider.collidable.rpm - rpmDamage);
  emitSparks(point, normal, Math.floor(18 + hit.impactForce * 12), Math.min(1, hit.impactForce / 6));
});

registerCollisionPair('player', 'spider_leg', (_playerCol, legCol, hit) => {
  for (const spider of SpiderEntities.getAll()) {
    if (!spider.alive) continue;
    const leg = spider.legs.find((entry) => entry.alive && entry.collidable === legCol);
    if (!leg) continue;

    const hpDamage = hit.impactForce * 0.55 * Math.max(0.4, playerBody.rpm / playerBody.rpmCapacity);
    const { point, normal } = computeContactInfo(_playerCol, legCol);
    if (applyDamageToSpiderLeg(spider, leg, hpDamage)) {
      explosions.push(createExplosion({ x: legCol.pos.x, z: legCol.pos.z }));
      emitSparks(point, normal, Math.floor(24 + hit.impactForce * 12), Math.min(1, 0.5 + hit.impactForce / 8));
    } else {
      emitSparks(point, normal, Math.floor(12 + hit.impactForce * 7), Math.min(1, hit.impactForce / 8));
    }
    return;
  }
});

registerCollisionPair('player', 'robot', (_playerCol, robotCol, hit) => {
  const robot = RobotEntities.getAll().find(r => r.collidable === robotCol);
  if (!robot?.alive) return;
  const hpDamage = hit.impactForce * 2.5 * (playerBody.rpm / playerBody.rpmCapacity);
  applyDamageToRobot(robot, hpDamage);
  const { point, normal } = computeContactInfo(_playerCol, robotCol);
  emitSparks(point, normal, Math.floor(8 + hit.impactForce * 6), Math.min(1, hit.impactForce / 10));
});

registerCollisionPair('player', 'hive_flock', (_playerCol, flockCol, hit) => {
  for (const hive of HiveEntities.getAll()) {
    const spinner = hive.flock.find(f => f.alive && f.collidable === flockCol);
    if (spinner) { onFlockCollision(spinner); break; }
  }
  const { point, normal } = computeContactInfo(_playerCol, flockCol);
  emitSparks(point, normal, Math.floor(10 + hit.impactForce * 8), Math.min(1, hit.impactForce / 8));
});

registerCollisionPair('player', 'hive_core', (_playerCol, coreCol, hit) => {
  const hive = HiveEntities.getAll().find(h => h.collidable === coreCol);
  if (!hive?.alive) return;
  const aliveCount = hive.flock.filter(f => f.alive).length;
  // Damage reduced while flock protects
  const shieldMult = aliveCount >= 3 ? 0.1 : aliveCount >= 1 ? 0.4 : 1.0;
  const hpDamage = hit.impactForce * 3.0 * (playerBody.rpm / playerBody.rpmCapacity) * shieldMult;
  applyDamageToHiveCore(hive, hpDamage);
  const { point, normal } = computeContactInfo(_playerCol, coreCol);
  emitSparks(point, normal, Math.floor(15 + hit.impactForce * 10), Math.min(1, hit.impactForce / 8));
});

registerCollisionPair('player', 'boss', (_playerCol, bossCol, hit) => {
  const boss = DreadnoughtEntities.getAll().find(b => b.collidable === bossCol);
  if (!boss?.alive) return;

  // Directional damage — weak point check
  const { bossDamageMult, playerDamageMult, hitWeak } = checkWeakPoint(boss, playerBody.pos);

  // Damage TO boss (RPM drain)
  const safePlayerRpm = Math.max(0.01, playerBody.rpm);
  const safeEnemyRpm  = Math.max(0.01, bossCol.rpm);
  const baseDamage = COLLISION_DAMAGE_RATIO * playerBody.rpmCapacity
    * hit.impactForce * (playerBody.mass / bossCol.mass)
    * (safePlayerRpm / safeEnemyRpm) * playerBody.heatFactor;
  boss.collidable.rpm = Math.max(0, boss.collidable.rpm - baseDamage * bossDamageMult);

  // Damage TO player (RPM drain) — frontal hits punish hard
  const playerDamage = COLLISION_DAMAGE_RATIO * bossCol.rpmCapacity
    * hit.impactForce * (bossCol.mass / playerBody.mass)
    * (safeEnemyRpm / safePlayerRpm) * bossCol.heatFactor;
  playerBody.rpm = Math.max(0, playerBody.rpm - playerDamage * playerDamageMult);

  if (hitWeak || playerDamage * playerDamageMult > 5) {
    notifyPlayerHit();
  }
  const { point, normal } = computeContactInfo(_playerCol, bossCol);
  emitSparks(point, normal, Math.floor(20 + hit.impactForce * 12), Math.min(1, hit.impactForce / 6));
});

// ── Big Slugworm: head = poison (drains player RPM), belly = vulnerable ──
registerCollisionPair('player', 'slug_big', (_playerCol, slugCol, hit) => {
  const slug = BigSlugEntities.getAll().find(s => s.collidable === slugCol);
  if (!slug?.alive) return;

  const { point } = computeContactInfo(_playerCol, slugCol);

  if (isHeadHit(slug, playerBody.pos)) {
    // Head contact — poison drains player RPM, no damage to slug
    const drain = slug.config.poisonDrain * 0.1 * (1 + hit.impactForce * 0.3);
    playerBody.rpm = Math.max(0, playerBody.rpm - drain);
    notifyPlayerHit();
    // Toxic green sparks
    emitGoo(point, Math.floor(6 + hit.impactForce * 3), Math.min(1, hit.impactForce / 8));
  } else {
    // Belly hit — damage the slug
    const hpDamage = hit.impactForce * 2.0 * (playerBody.rpm / playerBody.rpmCapacity);
    applyDamageToSlug(slug, hpDamage);
    // Goo splatter on belly hit
    emitGoo(point, Math.floor(10 + hit.impactForce * 6), Math.min(1, hit.impactForce / 6));
  }
});

// ── Baby Slugworm: easy kill, big goo splash ──
registerCollisionPair('player', 'slug_baby', (_playerCol, slugCol, hit) => {
  const slug = BabySlugEntities.getAll().find(s => s.collidable === slugCol);
  if (!slug?.alive) return;

  const hpDamage = hit.impactForce * 4.0 * (playerBody.rpm / playerBody.rpmCapacity);
  applyDamageToSlug(slug, hpDamage);

  const { point } = computeContactInfo(_playerCol, slugCol);
  emitGoo(point, Math.floor(15 + hit.impactForce * 8), Math.min(1, hit.impactForce / 4));
});

// ─── Proximity Pair Handlers (permanent) ─────────────────────────────────────

registerProximityPair('player', 'pickup', (_playerProx, pickupProx) => {
  const pickup = pickupProx.owner as Pickup;
  if (pickup.collected) return;

  if (pickup.type === 'normal') {
    const halfPoint = spinnerConfig.rpmCapacity * RPM_HALF_POINT_RATIO;
    playerBody.rpm += pickupRpmGain(playerBody.rpm, halfPoint, PICKUP_RPM_BOOST);
  } else {
    playerBody.rpm += HYPER_BOOST;
  }
  collectPickup(pickup);
});

// ─── Player ──────────────────────────────────────────────────────────────────

setupPlayer();

// ─── Game state ──────────────────────────────────────────────────────────────

const pickups:     Pickup[]     = [];
const projectiles: Projectile[] = [];
const explosions:  Explosion[]  = [];
const fireTorches: FireTorch[]  = [];
const dynamicLevelLightRoots: THREE.Object3D[] = [];
const pendingTriggeredEntities = new Map<string, LevelEntity[]>();

interface AreaZone {
  contains(point: { x: number; z: number }): boolean;
}

interface SpawnTriggerZone extends AreaZone {
  id: string;
  fired: boolean;
}

interface FallingVictim {
  roots: THREE.Object3D[];
  primaryRoot: THREE.Object3D;
  spinRoot?: THREE.Object3D;
  driftX: number;
  driftZ: number;
  fallSpeed: number;
  spinSpeed: number;
  tumbleSpeed: number;
  elapsed: number;
  duration: number;
  finalize: () => void;
}

interface FallableActor {
  active: boolean;
  collidable: Collidable;
  killFallTimer: number;
  beginFall: () => void;
}

const spawnTriggerZones: SpawnTriggerZone[] = [];
const killFallZones: AreaZone[] = [];
const fallingVictims: FallingVictim[] = [];
const fallableActors: FallableActor[] = [];
const KILL_FALL_DELAY = 0.5;
let playerKillFallTimer = 0;

function readStringProperty(props: Record<string, unknown> | undefined, key: string): string | null {
  const raw = props?.[key];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function readBooleanProperty(props: Record<string, unknown> | undefined, key: string): boolean {
  const raw = props?.[key];
  return raw === true || raw === 'true' || raw === '1';
}

function isPointInPolygon(point: { x: number; z: number }, vertices: { x: number; z: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const zi = vertices[i].z;
    const xj = vertices[j].x;
    const zj = vertices[j].z;
    const intersects = ((zi > point.z) !== (zj > point.z))
      && (point.x < ((xj - xi) * (point.z - zi)) / ((zj - zi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function buildAreaZoneFromPolygon(poly: LevelPolygon): AreaZone | null {
  if (poly.vertices.length < 3) return null;
  const vertices = poly.vertices.map((vertex) => ({ x: vertex.x, z: vertex.y }));
  const holes = (poly.holes ?? []).map((hole) => hole.map((vertex) => ({ x: vertex.x, z: vertex.y })));
  return {
    contains(point) {
      if (!isPointInPolygon(point, vertices)) return false;
      return !holes.some((hole) => hole.length >= 3 && isPointInPolygon(point, hole));
    },
  };
}

function buildAreaZoneFromCircle(circle: LevelCircle): AreaZone | null {
  if (circle.radius <= 0) return null;
  const center = { x: circle.center.x, z: circle.center.y };
  const radiusSq = circle.radius * circle.radius;
  return {
    contains(point) {
      const dx = point.x - center.x;
      const dz = point.z - center.z;
      return dx * dx + dz * dz <= radiusSq;
    },
  };
}

function rebuildTriggerZones(level: LevelData): void {
  spawnTriggerZones.length = 0;
  killFallZones.length = 0;

  for (const poly of level.polygons ?? []) {
    if (poly.layer !== 'trigger') continue;
    const zone = buildAreaZoneFromPolygon(poly);
    if (!zone) continue;

    const triggerId = readStringProperty(poly.properties, 'triggerId');
    if (triggerId) {
      spawnTriggerZones.push({ id: triggerId, fired: false, contains: zone.contains });
    }
    if (readStringProperty(poly.properties, 'triggerAction') === 'kill_fall') {
      killFallZones.push(zone);
    }
  }

  for (const circle of level.circles ?? []) {
    if (circle.layer !== 'trigger') continue;
    const zone = buildAreaZoneFromCircle(circle);
    if (!zone) continue;

    const triggerId = readStringProperty(circle.properties, 'triggerId');
    if (triggerId) {
      spawnTriggerZones.push({ id: triggerId, fired: false, contains: zone.contains });
    }
    if (readStringProperty(circle.properties, 'triggerAction') === 'kill_fall') {
      killFallZones.push(zone);
    }
  }
}

function clearDynamicLevelLights(): void {
  while (dynamicLevelLightRoots.length > 0) {
    scene.remove(dynamicLevelLightRoots.pop()!);
  }
}

function removeCollidableFromGameplay(collidable: Collidable): void {
  untagCollidable(collidable);
  const idx = collidables.indexOf(collidable);
  if (idx !== -1) collidables.splice(idx, 1);
}

function createFallingVictim(
  roots: THREE.Object3D[],
  primaryRoot: THREE.Object3D,
  finalize: () => void,
  spinRoot?: THREE.Object3D,
): FallingVictim {
  const angle = Math.random() * Math.PI * 2;
  const drift = 0.6 + Math.random() * 0.7;
  return {
    roots,
    primaryRoot,
    spinRoot,
    driftX: Math.cos(angle) * drift,
    driftZ: Math.sin(angle) * drift,
    fallSpeed: 2.5 + Math.random() * 0.8,
    spinSpeed: 4 + Math.random() * 6,
    tumbleSpeed: 1.5 + Math.random() * 2.5,
    elapsed: 0,
    duration: 0.85 + Math.random() * 0.2,
    finalize,
  };
}

function enqueueFallingVictim(victim: FallingVictim): void {
  fallingVictims.push(victim);
}

function registerFallableActor(collidable: Collidable, beginFall: () => void): void {
  fallableActors.push({ active: true, collidable, killFallTimer: 0, beginFall });
}

function removeBossDrainZones(boss: DreadnoughtState): void {
  for (const drain of boss.drainZones) {
    const idx = zones.indexOf(drain.zone);
    if (idx !== -1) zones.splice(idx, 1);
    scene.remove(drain.mesh);
  }
  boss.drainZones.length = 0;
}

function deactivateEnemySpinnerForFall(enemy: EnemySpinnerState): THREE.Object3D[] {
  enemy.alive = false;
  enemy.collidable.vel.x = 0;
  enemy.collidable.vel.z = 0;
  deregisterEntity(enemy.id);
  removeCollidableFromGameplay(enemy.collidable);
  return [enemy.topResult.tiltGroup];
}

function deactivateZombieForFall(zombie: ZombieState): THREE.Object3D[] {
  zombie.alive = false;
  zombie.collidable.vel.x = 0;
  zombie.collidable.vel.z = 0;
  deregisterEntity(zombie.id);
  removeCollidableFromGameplay(zombie.collidable);
  return [zombie.group];
}

function deactivateRobotForFall(robot: RobotEnemyState): THREE.Object3D[] {
  robot.alive = false;
  robot.collidable.vel.x = 0;
  robot.collidable.vel.z = 0;
  deregisterEntity(robot.id);
  removeCollidableFromGameplay(robot.collidable);
  return [robot.group];
}

function deactivateObstacleForFall(obstacle: ObstacleState): THREE.Object3D[] {
  obstacle.alive = false;
  obstacle.collidable.vel.x = 0;
  obstacle.collidable.vel.z = 0;
  deregisterEntity(obstacle.id);
  removeCollidableFromGameplay(obstacle.collidable);
  return [obstacle.group];
}

function deactivateSlugForFall(slug: SlugwormState): THREE.Object3D[] {
  slug.alive = false;
  slug.collidable.vel.x = 0;
  slug.collidable.vel.z = 0;
  deregisterEntity(slug.id);
  removeCollidableFromGameplay(slug.collidable);
  return [slug.group];
}

function deactivateDreadnoughtForFall(boss: DreadnoughtState): THREE.Object3D[] {
  boss.alive = false;
  boss.collidable.vel.x = 0;
  boss.collidable.vel.z = 0;
  deregisterEntity(boss.id);
  removeCollidableFromGameplay(boss.collidable);
  removeBossDrainZones(boss);
  return [boss.topResult.tiltGroup, boss.group];
}

function deactivateSiegeForFall(boss: SiegeEngineState): THREE.Object3D[] {
  boss.alive = false;
  boss.collidable.vel.x = 0;
  boss.collidable.vel.z = 0;
  deregisterEntity(boss.id);
  removeCollidableFromGameplay(boss.collidable);
  for (const part of boss.parts) {
    removeCollidableFromGameplay(part.collidable);
  }
  return [boss.topResult.tiltGroup, boss.hpGroup, boss.shieldMesh, ...boss.parts.map((part) => part.group)];
}

function deactivateSpiderForFall(boss: SpiderReliquaryState): THREE.Object3D[] {
  boss.alive = false;
  boss.collidable.vel.x = 0;
  boss.collidable.vel.z = 0;
  deregisterEntity(boss.id);
  removeCollidableFromGameplay(boss.collidable);
  for (const leg of boss.legs) {
    if (leg.alive) removeCollidableFromGameplay(leg.collidable);
  }
  return [boss.bodyGroup, boss.hpGroup, ...boss.legs.filter((leg) => leg.alive).map((leg) => leg.group)];
}

function deactivateHiveForFall(boss: HiveBossState): THREE.Object3D[] {
  boss.alive = false;
  boss.collidable.vel.x = 0;
  boss.collidable.vel.z = 0;
  deregisterEntity(boss.id);
  removeCollidableFromGameplay(boss.collidable);
  for (const spinner of boss.flock) {
    deregisterEntity(spinner.id);
    removeCollidableFromGameplay(spinner.collidable);
  }
  return [boss.coreGroup, ...boss.flock.map((spinner) => spinner.topResult.tiltGroup)];
}

function updateFallingVictims(delta: number): void {
  for (let i = fallingVictims.length - 1; i >= 0; i--) {
    const victim = fallingVictims[i];
    victim.elapsed += delta;
    const t = Math.min(1, victim.elapsed / victim.duration);
    const fallStep = victim.fallSpeed * (1 + t * 1.8) * delta;

    for (const root of victim.roots) {
      root.position.x += victim.driftX * delta;
      root.position.y -= fallStep;
      root.position.z += victim.driftZ * delta;
    }

    victim.primaryRoot.rotation.z += victim.tumbleSpeed * delta;
    victim.primaryRoot.rotation.x += victim.tumbleSpeed * 0.35 * delta;
    if (victim.spinRoot) {
      victim.spinRoot.rotation.y += victim.spinSpeed * delta;
    } else {
      victim.primaryRoot.rotation.y += victim.spinSpeed * 0.4 * delta;
    }

    if (victim.elapsed >= victim.duration) {
      victim.finalize();
      fallingVictims.splice(i, 1);
    }
  }
}

function triggerPlayerPitFall(): void {
  if (gameOver) return;
  playerBody.rpm = 0;
  startPlayerPitFallDeath();
  gameOver = true;
}

function updateKillFallZones(delta: number): void {
  if (killFallZones.length === 0) return;

  if (!gameOver) {
    if (killFallZones.some((zone) => zone.contains(playerBody.pos))) {
      playerKillFallTimer += delta;
      if (playerKillFallTimer >= KILL_FALL_DELAY) {
        triggerPlayerPitFall();
      }
    } else {
      playerKillFallTimer = 0;
    }
  }

  for (const actor of fallableActors) {
    if (!actor.active) continue;
    if (!collidables.includes(actor.collidable)) {
      actor.active = false;
      continue;
    }
    if (!killFallZones.some((zone) => zone.contains(actor.collidable.pos))) {
      actor.killFallTimer = 0;
      continue;
    }
    actor.killFallTimer += delta;
    if (actor.killFallTimer < KILL_FALL_DELAY) continue;
    actor.active = false;
    actor.beginFall();
  }
}

// ─── Spawn from level data ───────────────────────────────────────────────────

function isEntityFallable(ent: LevelEntity): boolean {
  return readBooleanProperty(ent.properties, 'fallable');
}

function spawnLevelEntity(ent: LevelEntity): void {
  const pos = lvPos(ent.position);
  switch (ent.type) {
    case 'pickup':
      pickups.push(createNormalPickup(pos));
      break;
    case 'pickup_hyper':
      pickups.push(createHyperPickup(pos));
      break;
    case 'obstacle': {
      const cfg = ent.properties?.config === 'barrel' ? BARREL_CONFIG : CRATE_CONFIG;
      const obstacle = ObstacleEntities.spawn(pos, cfg);
      if (isEntityFallable(ent)) {
        registerFallableActor(obstacle.collidable, () => {
          const roots = deactivateObstacleForFall(obstacle);
          enqueueFallingVictim(createFallingVictim(
            roots,
            obstacle.group,
            () => ObstacleEntities.destroy(obstacle),
          ));
        });
      }
      break;
    }
    case 'robot': {
      const robot = RobotEntities.spawn(pos, ROBOT_TIER_1);
      if (isEntityFallable(ent)) {
        registerFallableActor(robot.collidable, () => {
          const roots = deactivateRobotForFall(robot);
          enqueueFallingVictim(createFallingVictim(
            roots,
            robot.group,
            () => RobotEntities.destroy(robot),
          ));
        });
      }
      break;
    }
    case 'siege_engine': {
      const siege = SiegeEntities.spawn(pos, SIEGE_ENGINE_TIER_1);
      if (isEntityFallable(ent)) {
        registerFallableActor(siege.collidable, () => {
          const roots = deactivateSiegeForFall(siege);
          enqueueFallingVictim(createFallingVictim(
            roots,
            siege.topResult.tiltGroup,
            () => SiegeEntities.destroy(siege),
            siege.topResult.spinGroup,
          ));
        });
      }
      break;
    }
    case 'spider_reliquary': {
      const spider = SpiderEntities.spawn(pos, SPIDER_RELIQUARY_TIER_1);
      if (isEntityFallable(ent)) {
        registerFallableActor(spider.collidable, () => {
          const roots = deactivateSpiderForFall(spider);
          enqueueFallingVictim(createFallingVictim(
            roots,
            spider.bodyGroup,
            () => SpiderEntities.destroy(spider),
          ));
        });
      }
      break;
    }
    case 'turret':
      TurretEntities.spawn(pos, TURRET_TIER_1);
      break;
    case 'enemy_spinner': {
      const enemy = EnemyEntities.spawn(pos, ENEMY_SPINNER_TIER_1);
      if (isEntityFallable(ent)) {
        registerFallableActor(enemy.collidable, () => {
          const roots = deactivateEnemySpinnerForFall(enemy);
          enqueueFallingVictim(createFallingVictim(
            roots,
            enemy.topResult.tiltGroup,
            () => EnemyEntities.destroy(enemy),
            enemy.topResult.spinGroup,
          ));
        });
      }
      break;
    }
    case 'zombie': {
      const zombie = ZombieEntities.spawn(pos, ZOMBIE_TIER_1);
      if (isEntityFallable(ent)) {
        registerFallableActor(zombie.collidable, () => {
          const roots = deactivateZombieForFall(zombie);
          enqueueFallingVictim(createFallingVictim(
            roots,
            zombie.group,
            () => ZombieEntities.destroy(zombie),
          ));
        });
      }
      break;
    }
    case 'dreadnought': {
      const dreadnought = DreadnoughtEntities.spawn(pos, DREADNOUGHT_TIER_1);
      if (isEntityFallable(ent)) {
        registerFallableActor(dreadnought.collidable, () => {
          const roots = deactivateDreadnoughtForFall(dreadnought);
          enqueueFallingVictim(createFallingVictim(
            roots,
            dreadnought.topResult.tiltGroup,
            () => DreadnoughtEntities.destroy(dreadnought),
            dreadnought.topResult.spinGroup,
          ));
        });
      }
      break;
    }
    case 'hive_boss': {
      const hive = HiveEntities.spawn(pos, HIVE_TIER_1);
      if (isEntityFallable(ent)) {
        registerFallableActor(hive.collidable, () => {
          const roots = deactivateHiveForFall(hive);
          enqueueFallingVictim(createFallingVictim(
            roots,
            hive.coreGroup,
            () => HiveEntities.destroy(hive),
          ));
        });
      }
      break;
    }
    case 'slug_big': {
      const slug = BigSlugEntities.spawn(pos, BIG_SLUGWORM);
      if (isEntityFallable(ent)) {
        registerFallableActor(slug.collidable, () => {
          const roots = deactivateSlugForFall(slug);
          enqueueFallingVictim(createFallingVictim(
            roots,
            slug.group,
            () => BigSlugEntities.destroy(slug),
          ));
        });
      }
      break;
    }
    case 'slug_baby': {
      const slug = BabySlugEntities.spawn(pos, BABY_SLUGWORM);
      if (isEntityFallable(ent)) {
        registerFallableActor(slug.collidable, () => {
          const roots = deactivateSlugForFall(slug);
          enqueueFallingVictim(createFallingVictim(
            roots,
            slug.group,
            () => BabySlugEntities.destroy(slug),
          ));
        });
      }
      break;
    }
    case 'fire_torch':
      fireTorches.push(createFireTorch(scene, ent));
      break;
    case 'light_point': {
      const root = createLevelPointLightRoot(ent);
      dynamicLevelLightRoots.push(root);
      scene.add(root);
      break;
    }
  }
}

function spawnTriggeredEntities(triggerId: string): void {
  const queued = pendingTriggeredEntities.get(triggerId);
  if (!queued || queued.length === 0) return;

  pendingTriggeredEntities.delete(triggerId);
  for (const entity of queued) {
    spawnLevelEntity(entity);
  }
}

function spawnAll(level: LevelData): void {
  pendingTriggeredEntities.clear();
  fallableActors.length = 0;
  playerKillFallTimer = 0;
  rebuildTriggerZones(level);

  for (const ent of level.entities) {
    const pos = lvPos(ent.position);
    if (ent.type === 'player_spawn') {
      playerBody.pos.x = pos.x;
      playerBody.pos.z = pos.z;
      continue;
    }

    const spawnTrigger = readStringProperty(ent.properties, 'spawnTrigger');
    if (spawnTrigger) {
      const pending = pendingTriggeredEntities.get(spawnTrigger);
      if (pending) pending.push(ent);
      else pendingTriggeredEntities.set(spawnTrigger, [ent]);
      continue;
    }

    if (ent.type === 'light_point') continue;
    spawnLevelEntity(ent);
  }
}

function updateTriggerSpawns(): void {
  for (const zone of spawnTriggerZones) {
    if (zone.fired) continue;
    if (!zone.contains(playerBody.pos)) continue;
    zone.fired = true;
    spawnTriggeredEntities(zone.id);
  }
}

spawnAll(currentLevel);

// ─── Game Over Overlay ───────────────────────────────────────────────────────

const gameOverOverlay = document.createElement('div');
gameOverOverlay.style.cssText = [
  'position:fixed', 'inset:0', 'display:none',
  'align-items:center', 'justify-content:center', 'flex-direction:column',
  'background:rgba(0,0,0,0.65)', 'z-index:10',
].join(';');
gameOverOverlay.innerHTML = `
  <div style="font-size:3.5rem;font-weight:bold;color:#e94560;font-family:monospace;letter-spacing:.1em">GAME OVER</div>
  <div style="margin-top:1rem;font-size:1.1rem;color:#aaa;font-family:monospace">Press R to restart</div>
`;
document.body.appendChild(gameOverOverlay);

// ─── Shared State ────────────────────────────────────────────────────────────

let time     = 0;
let gameOver = false;

// ─── Reset ───────────────────────────────────────────────────────────────────

function resetGame(): void {
  // Destroy dynamic entities first (removes their collidables and scene objects)
  TurretEntities.destroyAll();
  EnemyEntities.destroyAll();
  ZombieEntities.destroyAll();
  ObstacleEntities.destroyAll();
  DreadnoughtEntities.destroyAll();
  SiegeEntities.destroyAll();
  SpiderEntities.destroyAll();
  RobotEntities.destroyAll();
  HiveEntities.destroyAll();
  BigSlugEntities.destroyAll();
  BabySlugEntities.destroyAll();

  // Clear ECS registrations and reset player
  resetEntityRegistrations();
  resetPlayer();
  setupPlayer();

  gameOver = false;
  gameOverOverlay.style.display = 'none';

  // Clear all pickups (level + dynamic drops) — meshes still in scene need removal
  for (const p of pickups) { if (!p.collected) scene.remove(p.mesh); }
  pickups.length = 0;

  for (const p of projectiles) { if (p.alive) scene.remove(p.mesh); }
  projectiles.length = 0;
  for (const e of explosions)  { if (e.alive) scene.remove(e.mesh); }
  explosions.length = 0;
  for (const torch of fireTorches) destroyFireTorch(scene, torch);
  fireTorches.length = 0;

  resetSparks();
  resetTrails();
  resetGooDecals();
  resetGibs();
  resetRicochetBubbles();
  resetLavaEmbers();
  fallingVictims.length = 0;
  fallableActors.length = 0;
  playerKillFallTimer = 0;
  clearDynamicLevelLights();
  clearLevelLights(scene);
  setupLevelLights(scene, currentLevel);
  spawnAll(currentLevel);
}

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r' && gameOver) resetGame();
});

// ─── Turret System (AI + projectiles) ────────────────────────────────────────

function updateTurretSystem(delta: number): void {
  for (const turret of TurretEntities.getAll()) {
    if (!turret.alive) continue;
    const { shouldFire, firePos, fireDir } = updateTurret(turret, playerBody.pos, playerBody.vel, delta);
    if (shouldFire) {
      projectiles.push(createProjectile(
        firePos, fireDir, turret.config.projectileSpeed, turret.config.projectileDamage
      ));
    }
  }

  const { rpmDamage, hitFlash } = updateProjectiles(projectiles, playerBody.pos, playerBody.radius, delta);
  if (rpmDamage > 0) {
    playerBody.rpm = Math.max(0, playerBody.rpm - rpmDamage);
    if (hitFlash) {
      notifyPlayerHit();
      emitPlasma({ x: playerBody.pos.x, y: 0.5, z: playerBody.pos.z }, 25, 0.9);
    }
  }

  updateExplosions(explosions, delta);
}

// ─── Siege Engine Turret System ───────────────────────────────────────────────

function updateSiegeTurretSystem(delta: number): void {
  for (const siege of SiegeEntities.getAll()) {
    if (!siege.alive) continue;
    const events = updateSiegeEngineTurrets(siege, playerBody.pos, playerBody.vel, delta);
    for (const ev of events) {
      projectiles.push(createProjectile(ev.firePos, ev.fireDir, ev.speed, ev.damage));
    }
  }
}

function updateSpiderSystem(delta: number): void {
  for (const spider of SpiderEntities.getAll()) {
    if (!spider.alive) continue;
    const events = updateSpiderReliquaryAI(spider, playerBody.pos, playerBody.radius, delta);
    for (const event of events) {
      emitSparks(
        event.point,
        { x: 0, y: 1, z: 0 },
        event.kind === 'pulse' ? 18 : 26,
        event.kind === 'pulse' ? 0.7 : 0.9,
      );
      if (!event.hitPlayer) continue;

      playerBody.rpm = Math.max(0, playerBody.rpm - event.damage);
      notifyPlayerHit();
    }
  }
}

function updateSpiderCorePassThroughHits(): void {
  for (const spider of SpiderEntities.getAll()) {
    if (!spider.alive || spider.corePassThroughCooldown > 0) continue;

    const core = spider.collidable;
    const dx = core.pos.x - playerBody.pos.x;
    const dz = core.pos.z - playerBody.pos.z;
    const radius = playerBody.radius + core.radius;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;

    const dist = Math.sqrt(distSq) || 0.0001;
    const nx = dx / dist;
    const nz = dz / dist;
    const relVx = playerBody.vel.x - core.vel.x;
    const relVz = playerBody.vel.z - core.vel.z;
    const approachSpeed = relVx * nx + relVz * nz;
    if (approachSpeed <= 1.1) continue;

    const point = {
      x: playerBody.pos.x + nx * playerBody.radius,
      y: 0.7,
      z: playerBody.pos.z + nz * playerBody.radius,
    };
    const normal = { x: -nx, y: 0, z: -nz };

    if (!canDamageSpiderCore(spider)) {
      emitSparks(point, normal, Math.floor(16 + approachSpeed * 8), Math.min(1, approachSpeed / 7));
      spider.corePassThroughCooldown = 0.12;
      continue;
    }

    const safePlayerRpm = Math.max(0.01, playerBody.rpm);
    const safeEnemyRpm = Math.max(0.01, core.rpm);
    const rpmDamage = COLLISION_DAMAGE_RATIO * playerBody.rpmCapacity
      * approachSpeed * (playerBody.mass / core.mass)
      * (safePlayerRpm / safeEnemyRpm) * playerBody.heatFactor
      * getSpiderCoreDamageMultiplier(spider);
    spider.collidable.rpm = Math.max(0, spider.collidable.rpm - rpmDamage);
    emitSparks(point, normal, Math.floor(18 + approachSpeed * 10), Math.min(1, approachSpeed / 6));
    spider.corePassThroughCooldown = 0.16;
  }
}

// ─── Enemy Death Check ───────────────────────────────────────────────────────

function checkEnemyDeath(): void {
  for (const enemy of [...EnemyEntities.getAll()]) {
    if (isEnemyDead(enemy)) {
      const deathPos = { x: enemy.collidable.pos.x, z: enemy.collidable.pos.z };
      EnemyEntities.destroy(enemy);
      explosions.push(createExplosion(deathPos));
      spawnPickupAt(pickups, deathPos);
    }
  }
}

// ─── Boss Death Check ────────────────────────────────────────────────────────

function checkBossDeath(): void {
  for (const boss of [...DreadnoughtEntities.getAll()]) {
    if (isDreadnoughtDead(boss)) {
      const deathPos = { x: boss.collidable.pos.x, z: boss.collidable.pos.z };
      DreadnoughtEntities.destroy(boss);
      explosions.push(createExplosion(deathPos));
      // Big reward: drop multiple pickups
      spawnPickupAt(pickups, deathPos);
      spawnPickupAt(pickups, { x: deathPos.x + 2, z: deathPos.z });
      spawnPickupAt(pickups, { x: deathPos.x - 2, z: deathPos.z });
      spawnPickupAt(pickups, { x: deathPos.x, z: deathPos.z + 2 });
    }
  }
}

// ─── Robot System (AI + fire events) ─────────────────────────────────────────

function updateRobotSystem(delta: number): void {
  for (const robot of RobotEntities.getAll()) {
    const event = updateRobotAI(robot, playerBody.pos, delta);
    if (event) {
      projectiles.push(createProjectile(event.firePos, event.fireDir, event.speed, event.damage));
    }
  }
}

function killZombie(zombie: ZombieState, gib: boolean): void {
  if (!zombie.alive) return;

  const deathPos = { x: zombie.collidable.pos.x, z: zombie.collidable.pos.z };
  ZombieEntities.destroy(zombie);

  if (gib) {
    emitBlood({ x: deathPos.x, y: 0.95, z: deathPos.z }, 72, 1.0);
    spawnBloodSplat(deathPos, 10, time);
    // spawnBloodSplat({ x: deathPos.x + 0.7, z: deathPos.z + 0.25 }, 120, time + 0.08);
    // spawnBloodSplat({ x: deathPos.x - 0.6, z: deathPos.z - 0.3 }, 60, time + 0.16);
    spawnZombieGibs(deathPos, 16);
  } else {
    emitBlood({ x: deathPos.x, y: 0.75, z: deathPos.z }, 26, 0.82);
    spawnBloodSplat(deathPos, 12, time);
  }

  spawnPickupAt(pickups, deathPos);
}

function updateZombieSystem(delta: number): void {
  for (const zombie of ZombieEntities.getAll()) {
    const attacked = updateZombieAI(zombie, playerBody.pos, delta);
    if (!attacked) continue;

    playerBody.rpm = Math.max(0, playerBody.rpm - zombie.config.attackDamage);
    notifyPlayerHit();
    emitBlood({ x: playerBody.pos.x, y: 0.45, z: playerBody.pos.z }, 8, 0.42);
  }
}

// ─── Robot Death Check ────────────────────────────────────────────────────────

function checkRobotDeath(): void {
  for (const robot of [...RobotEntities.getAll()]) {
    if (isRobotDead(robot)) {
      const deathPos = { x: robot.collidable.pos.x, z: robot.collidable.pos.z };
      RobotEntities.destroy(robot);
      explosions.push(createRobotExplosion(deathPos));
      spawnPickupAt(pickups, deathPos);
    }
  }
}

function checkZombieDeath(): void {
  for (const zombie of [...ZombieEntities.getAll()]) {
    if (isZombieDead(zombie)) {
      killZombie(zombie, false);
    }
  }
}

// ─── Siege Engine Death Check ─────────────────────────────────────────────────

function checkSiegeDeath(): void {
  for (const siege of [...SiegeEntities.getAll()]) {
    if (isSiegeEngineDead(siege)) {
      const deathPos = { x: siege.collidable.pos.x, z: siege.collidable.pos.z };
      SiegeEntities.destroy(siege);
      explosions.push(createExplosion(deathPos));
      spawnPickupAt(pickups, deathPos);
      spawnPickupAt(pickups, { x: deathPos.x + 2, z: deathPos.z + 1 });
      spawnPickupAt(pickups, { x: deathPos.x - 2, z: deathPos.z - 1 });
      spawnPickupAt(pickups, { x: deathPos.x, z: deathPos.z + 2 });
      spawnPickupAt(pickups, { x: deathPos.x + 1, z: deathPos.z - 2 });
    }
  }
}

function checkSpiderDeath(): void {
  for (const spider of [...SpiderEntities.getAll()]) {
    if (!isSpiderReliquaryDead(spider)) continue;
    const deathPos = { x: spider.collidable.pos.x, z: spider.collidable.pos.z };
    SpiderEntities.destroy(spider);
    explosions.push(createExplosion(deathPos));
    explosions.push(createExplosion({ x: deathPos.x + 1.2, z: deathPos.z + 0.8 }));
    explosions.push(createExplosion({ x: deathPos.x - 1.1, z: deathPos.z - 0.9 }));
    spawnPickupAt(pickups, deathPos);
    spawnPickupAt(pickups, { x: deathPos.x + 2, z: deathPos.z });
    spawnPickupAt(pickups, { x: deathPos.x - 2, z: deathPos.z });
    spawnPickupAt(pickups, { x: deathPos.x, z: deathPos.z + 2 });
    spawnPickupAt(pickups, { x: deathPos.x, z: deathPos.z - 2 });
  }
}

// ─── Hive Chaingun System ────────────────────────────────────────────────────

function updateHiveSystem(delta: number): void {
  for (const hive of HiveEntities.getAll()) {
    if (!hive.alive) continue;
    const events = updateHiveChaingun(hive, playerBody.pos, playerBody.vel, delta);
    for (const ev of events) {
      projectiles.push(createProjectile(ev.firePos, ev.fireDir, ev.speed, ev.damage));
    }
  }
}

// ─── Slug System (AI + poison projectiles) ──────────────────────────────────

function updateSlugSystem(delta: number): void {
  for (const slug of BigSlugEntities.getAll()) {
    const event = updateSlugwormAI(slug, playerBody.pos, delta);
    if (event) {
      projectiles.push(createPoisonProjectile(event.firePos, event.fireDir, event.speed, event.damage));
    }
  }
  for (const slug of BabySlugEntities.getAll()) {
    updateSlugwormAI(slug, playerBody.pos, delta);
  }
}

// ─── Slug Death Check ───────────────────────────────────────────────────────

function checkSlugDeath(): void {
  for (const slug of [...BigSlugEntities.getAll()]) {
    if (isSlugDead(slug)) {
      const deathPos = { x: slug.collidable.pos.x, z: slug.collidable.pos.z };
      // Dramatic chainsaw goo explosion
      emitGoo({ x: deathPos.x, y: 0.5, z: deathPos.z }, 60, 1.0);
      spawnGooSplat(deathPos, 12, time);
      BigSlugEntities.destroy(slug);
      explosions.push(createExplosion(deathPos));
      spawnPickupAt(pickups, deathPos);
      spawnPickupAt(pickups, { x: deathPos.x + 1.5, z: deathPos.z });
      spawnPickupAt(pickups, { x: deathPos.x - 1.5, z: deathPos.z });
    }
  }
  for (const slug of [...BabySlugEntities.getAll()]) {
    if (isSlugDead(slug)) {
      const deathPos = { x: slug.collidable.pos.x, z: slug.collidable.pos.z };
      // Huge goo burst for baby — chainsaw splatter
      emitGoo({ x: deathPos.x, y: 0.4, z: deathPos.z }, 40, 0.8);
      spawnGooSplat(deathPos, 8, time);
      BabySlugEntities.destroy(slug);
      spawnPickupAt(pickups, deathPos);
    }
  }
}

// ─── Hive Death Check ────────────────────────────────────────────────────────

function checkHiveDeath(): void {
  // Check flock spinner deaths first
  for (const hive of HiveEntities.getAll()) {
    if (!hive.alive) continue;
    for (const spinner of [...hive.flock]) {
      if (isFlockSpinnerDead(spinner)) {
        const deathPos = { x: spinner.collidable.pos.x, z: spinner.collidable.pos.z };
        destroyFlockSpinner(hive, spinner);
        explosions.push(createExplosion(deathPos));
        spawnPickupAt(pickups, deathPos);
      }
    }
  }
  // Check boss death
  for (const hive of [...HiveEntities.getAll()]) {
    if (isHiveBossDead(hive)) {
      const deathPos = { x: hive.collidable.pos.x, z: hive.collidable.pos.z };
      HiveEntities.destroy(hive);
      explosions.push(createExplosion(deathPos));
      // Big reward
      spawnPickupAt(pickups, deathPos);
      spawnPickupAt(pickups, { x: deathPos.x + 2, z: deathPos.z });
      spawnPickupAt(pickups, { x: deathPos.x - 2, z: deathPos.z });
      spawnPickupAt(pickups, { x: deathPos.x, z: deathPos.z + 2 });
      spawnPickupAt(pickups, { x: deathPos.x, z: deathPos.z - 2 });
    }
  }
}

// ─── Timer ───────────────────────────────────────────────────────────────────

const timer = new THREE.Timer();

// ─── Game Loop ───────────────────────────────────────────────────────────────

function animate(): void {
  requestAnimationFrame(animate);
  timer.update();
  const delta = Math.min(timer.getDelta(), 0.05);
  time += delta;

  if (gameOver) {
    updateFallingVictims(delta);
    updateGibs(delta);
    const done = updateTopple(delta);
    if (done) gameOverOverlay.style.display = 'flex';
    updateHud(playerBody.rpm, time, delta);
    updateCamera(playerBody.pos, playerBody.vel, delta);
    renderer.render(scene, camera);
    return;
  }

  // 1. Entity updates (intent — player input, enemy AI, boss AI, turret aim)
  entityUpdateSystem(delta);
  for (const e of EnemyEntities.getAll()) updateEnemyAI(e, playerBody.pos, delta);
  for (const b of DreadnoughtEntities.getAll()) updateDreadnoughtAI(b, playerBody.pos, delta);
  for (const s of SiegeEntities.getAll()) updateSiegeEngineAI(s, playerBody.pos, delta);
  for (const h of HiveEntities.getAll()) updateHiveAI(h, playerBody.pos, delta);
  updateZombieSystem(delta);
  updateRobotSystem(delta);
  updateHiveSystem(delta);
  updateSlugSystem(delta);
  updateTurretSystem(delta);
  updateSiegeTurretSystem(delta);
  updateSpiderSystem(delta);

  // 2. Movement (friction, clamp, position for all registered movables)
  movementSystem(delta);

  // 2b. Sync siege engine sub-parts to core position (before collision)
  for (const s of SiegeEntities.getAll()) syncSiegeEngineParts(s);
  for (const spider of SpiderEntities.getAll()) syncSpiderReliquaryLegs(spider, delta);
  for (const h of HiveEntities.getAll()) syncFlockPositions(h);
  updateSpiderCorePassThroughHits();

  // 2c. Kill-fall trigger zones
  updateKillFallZones(delta);
  updateFallingVictims(delta);
  if (gameOver) {
    const done = updateTopple(delta);
    updateGibs(delta);
    if (done) gameOverOverlay.style.display = 'flex';
    updateHud(playerBody.rpm, time, delta);
    updateCamera(playerBody.pos, playerBody.vel, delta);
    renderer.render(scene, camera);
    return;
  }

  // 3. Collision resolution
  const { wallHits, circleHits } = runCollisions();

  // Wall hit sparks — continuous grinding, direction = tangential (along wall surface)
  for (const wh of wallHits) {
    const col = collidables[wh.collidableIndex];
    // Decompose velocity: remove normal component → tangential component
    const velDotN = col.vel.x * wh.normal.x + col.vel.z * wh.normal.z;
    const tanVx   = col.vel.x - velDotN * wh.normal.x;
    const tanVz   = col.vel.z - velDotN * wh.normal.z;
    const tanSpeed = Math.hypot(tanVx, tanVz);
    if (tanSpeed < 1.5) continue;
    const sNx = -tanVx / tanSpeed;  // opposite motion — sparks trail behind the grind
    const sNz = -tanVz / tanSpeed;
    const count = Math.floor(2 + tanSpeed * 0.5);
    emitSparks(
      { x: wh.contactPoint.x, y: 0.5, z: wh.contactPoint.z },
      { x: sNx, y: 0, z: sNz },
      count,
      Math.min(1, tanSpeed / 18),
    );
  }

  // Circle-contact sparks — continuous grinding whenever player overlaps any body
  for (let j = 1; j < collidables.length; j++) {
    const a = playerBody;
    const b = collidables[j];
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const minDist = a.radius + b.radius;
    if (dx * dx + dz * dz >= minDist * minDist) continue;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    const nx = dx / dist;
    const nz = dz / dist;
    // Relative tangential velocity (perpendicular to contact normal)
    const relVx    = a.vel.x - b.vel.x;
    const relVz    = a.vel.z - b.vel.z;
    const relDotN  = relVx * nx + relVz * nz;
    const tanSpeed = Math.hypot(relVx - relDotN * nx, relVz - relDotN * nz);
    if (tanSpeed < 1.5) continue;
    const pSpeed = Math.hypot(a.vel.x, a.vel.z);
    if (pSpeed < 0.5) continue;
    emitSparks(
      { x: a.pos.x + nx * a.radius, y: 0.5, z: a.pos.z + nz * a.radius },
      { x: -a.vel.x / pSpeed, y: 0, z: -a.vel.z / pSpeed },  // opposite motion — wake trail
      Math.floor(2 + tanSpeed * 0.3),
      Math.min(1, tanSpeed / 20),
    );
  }

  // 4. Collision pair dispatch (turret HP, obstacle HP, enemy recovery)
  collisionSystem(circleHits);

  // 5. Proximity pair dispatch (pickup collection)
  proximitySystem();

  // 5b. Level trigger spawns
  updateTriggerSpawns();

  // 6. RPM system (base decay) + player-specific hooks
  rpmSystem(delta);
  playerRpmHooks(delta, hasPlayerWallHit(wallHits), circleHits);

  // 7. Death checks
  checkEnemyDeath();
  checkBossDeath();
  checkSiegeDeath();
  checkSpiderDeath();
  checkRobotDeath();
  checkZombieDeath();
  checkHiveDeath();
  checkSlugDeath();

  if (playerBody.rpm <= 0) {
    startPlayerToppleDeath();
    gameOver = true;
    updateHud(0, time, delta);
    updateCamera(playerBody.pos, playerBody.vel, delta);
    renderer.render(scene, camera);
    return;
  }

  // 8. Visuals + render
  for (const obs of ObstacleEntities.getAll()) syncObstacle(obs);
  updatePickups(pickups, time, delta);
  updatePlayerVisuals(time, delta);
  for (const e of EnemyEntities.getAll()) updateEnemyVisuals(e, time, delta);
  for (const z of ZombieEntities.getAll()) updateZombieVisuals(z, playerBody.pos, delta, time);
  for (const b of DreadnoughtEntities.getAll()) updateDreadnoughtVisuals(b, time, delta);
  for (const s of SiegeEntities.getAll()) updateSiegeEngineVisuals(s, time, delta);
  for (const spider of SpiderEntities.getAll()) updateSpiderReliquaryVisuals(spider, time, delta);
  for (const r of RobotEntities.getAll()) updateRobotVisuals(r, playerBody.pos, time, delta);
  for (const h of HiveEntities.getAll()) updateHiveVisuals(h, playerBody.pos, time, delta);
  for (const s of BigSlugEntities.getAll()) updateSlugwormVisuals(s, time, delta);
  for (const s of BabySlugEntities.getAll()) updateSlugwormVisuals(s, time, delta);
  updateHud(playerBody.rpm, time, delta);
  updateCamera(playerBody.pos, playerBody.vel, delta);
  updateSparks(time);
  updateGooDecals(time);
  updateGibs(delta);
  updateRicochetBubbles(delta);
  updateTrails(playerBody.pos, playerBody.vel);
  updateLavaSurfaces(time);
  // updateSpaceBackground(time);
  for (const torch of fireTorches) updateFireTorch(torch, time);
  updateLavaEmbers(delta, time, {
    position: playerBody.pos,
    radius: playerBody.radius,
    rpm: playerBody.rpm,
    rpmCapacity: playerBody.rpmCapacity,
    spinSign: 1,
  });
  renderer.render(scene, camera);
}

animate();
