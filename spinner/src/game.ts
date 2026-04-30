import * as THREE from 'three';
import { renderer, scene, camera } from './renderer';
import { createArena, getArenaBounds, isPointInLava } from './arena';
import {
  RPM_HALF_POINT_RATIO, COLLISION_DAMAGE_RATIO,
  PICKUP_RPM_BOOST, HYPER_BOOST,
} from './constants';
import { spinnerConfig, resetSpinnerConfig } from './spinnerConfig';
import { runCollisions, collidables, walls, zones, isCollidableEnabled, type CircleHit, type Collidable, type Segment, type Vec2 } from './physics';
import { initHud, updateHud, setHudVisible, type ComboHudState } from './hud';
import { initCamera, resetCameraShake, triggerCameraShake, updateCamera } from './camera';
import { emitClashFlash, initClashFlashes, resetClashFlashes, updateClashFlashes } from './clashFlash';
import {
  defineEntityType,
  registerCollisionPair, registerProximityPair,
  entityUpdateSystem, movementSystem, collisionSystem, proximitySystem, rpmSystem,
  resetEntityRegistrations, deregisterEntity, getCollidableType, untagCollidable, setMovementMaxSpeed,
} from './systems';
import {
  playerBody, playerId, setupPlayer, resetPlayer,
  playerRpmHooks, updatePlayerVisuals, updateTopple, notifyHit as notifyPlayerHit,
  startPlayerPitFallDeath, startPlayerToppleDeath,
  setPlayerControlLocked, setPlayerInvulnerable, isPlayerInvulnerable,
  addPlayerCapacity,
} from './player';
import {
  createNormalPickup, createHyperPickup, updatePickups, spawnPickupAt, spawnGrowthPickupAt, ejectPickupAt,
  collectPickup, pickupRpmGain, type Pickup,
} from './pickup';
import { type LevelData, lvPos, lvZ } from './levelLoader';
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
  createEnemySpinner, updateEnemyAI, updateEnemyVisuals, setEnemyAwake,
  onEnemyCollision, getEnemyComboLockDuration, isEnemyDead, destroyEnemySpinner,
  ENEMY_SPINNER_TIER_1, ENEMY_SPINNER_TIER_2, ENEMY_SPINNER_TIER_3, type EnemySpinnerState,
} from './enemySpinner';
import {
  createZombieEnemy, updateZombieAI, updateZombieVisuals, setZombieAwake,
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
  setSpiderAwake,
  updateSpiderReliquaryVisuals, canDamageSpiderCore, getSpiderCoreDamageMultiplier,
  applyDamageToSpiderLeg, isSpiderReliquaryDead, destroySpiderReliquary,
  SPIDER_RELIQUARY_TIER_1, type SpiderReliquaryState,
} from './bossSpiderReliquary';
import {
  createOctoboss, updateOctobossAI, syncOctobossTentacles, updateOctobossVisuals,
  canDamageOctobossCore, getOctobossCoreDamageMultiplier, getOctobossTipDamage,
  isOctobossDead, destroyOctoboss, OCTOBOSS_TIER_1, type OctobossState,
} from './bossOctoboss';
import {
  createRobotEnemy, updateRobotAI, updateRobotVisuals, setRobotAwake,
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
import {
  createSlidingDoor, defaultSlidingDoorConfig, destroySlidingDoor,
  setSlidingDoorOpen, updateSlidingDoor, type SlidingDoorState,
} from './slidingDoor';
import type { LevelCircle, LevelEntity, LevelPolygon } from './levelLoader';
import { consumeProfilerTogglePressed, consumeSpectorCapturePressed, consumeSpecialPressed } from './input';
import { createProfiler } from './profiler';
import type { FrameCounts, FrameMode, RenderStats, SceneStats } from './profilerTypes';
import { createSpectorCaptureController } from './spectorCapture';
import { updateTopDownCulling } from './sceneCulling';


// ─── Level-driven state ──────────────────────────────────────────────────────

type LevelChoiceId = 'active' | 'level1' | 'level2' | 'level3' | 'level4' | 'level5';
const DEBUG_SKIP_MAIN_MENU = true;

const bundledLevels: Record<Exclude<LevelChoiceId, 'active'>, LevelData> = {
  level1: level1 as LevelData,
  level2: level2 as LevelData,
  level3: level3 as LevelData,
  level4: level4 as LevelData,
  level5: level5 as LevelData,
};

const bundledActiveLevel = levelActive as LevelData;
const levelChoices: Array<{ id: LevelChoiceId; label: string }> = [
  { id: 'active', label: 'Active Level (Editor)' },
  { id: 'level1', label: 'Level 1' },
  { id: 'level2', label: 'Level 2' },
  { id: 'level3', label: 'Level 3' },
  { id: 'level4', label: 'Level 4' },
  { id: 'level5', label: 'Level 5' },
];

function parseLevelChoice(value: string | null): LevelChoiceId {
  if (!value) return 'active';
  return levelChoices.some((choice) => choice.id === value) ? value as LevelChoiceId : 'active';
}

async function loadRuntimeActiveLevel(): Promise<LevelData> {
  try {
    const response = await fetch(`/api/active-level?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await response.text());
    return await response.json() as LevelData;
  } catch (error) {
    console.warn('Falling back to bundled active level:', error);
    return bundledActiveLevel;
  }
}

async function resolveLevel(choice: LevelChoiceId): Promise<LevelData> {
  if (choice === 'active') return loadRuntimeActiveLevel();
  return bundledLevels[choice];
}

let currentLevel: LevelData = bundledActiveLevel;


// ─── Scene Setup ─────────────────────────────────────────────────────────────

createArena(scene, currentLevel);
setupLevelLights(scene, currentLevel);
initHud();
setHudVisible(false);
initCamera();
initSparks(scene);
initTrails(scene);
initGooDecals(scene);
initLavaEmbers(scene);
initClashFlashes(scene);
// initSpaceBackground();

const profiler = createProfiler({
  enabled: import.meta.env.DEV && new URL(window.location.href).searchParams.get('profile') === '1',
  overlayEnabled: true,
  batchWindowMs: 500,
  collectorBaseUrl: '/api/perf-log',
});

const SCENE_CULL_PADDING = 2;

let spectorCaptureControllerPromise: Promise<Awaited<ReturnType<typeof createSpectorCaptureController>>> | null = null;

if (import.meta.env.DEV && new URL(window.location.href).searchParams.get('spector') === '1') {
  spectorCaptureControllerPromise = createSpectorCaptureController(renderer.domElement);
}

// ─── Entity Type Managers ─────────────────────────────────────────────────────

const TurretEntities      = defineEntityType({ create: createTurret,       destroy: destroyTurret       });
const EnemyEntities       = defineEntityType({ create: createEnemySpinner,  destroy: destroyEnemySpinner  });
const ZombieEntities      = defineEntityType({ create: createZombieEnemy,   destroy: destroyZombieEnemy   });
const ObstacleEntities    = defineEntityType({ create: createObstacle,      destroy: destroyObstacle      });
const DreadnoughtEntities = defineEntityType({ create: createDreadnought,   destroy: destroyDreadnought   });
const SiegeEntities       = defineEntityType({ create: createSiegeEngine,   destroy: destroySiegeEngine   });
const SpiderEntities      = defineEntityType({ create: createSpiderReliquary, destroy: destroySpiderReliquary });
const OctobossEntities    = defineEntityType({ create: createOctoboss,      destroy: destroyOctoboss      });
const RobotEntities       = defineEntityType({ create: createRobotEnemy,    destroy: destroyRobotEnemy    });
const HiveEntities        = defineEntityType({ create: createHiveBoss,      destroy: destroyHiveBoss      });
const BigSlugEntities     = defineEntityType({ create: createSlugworm,      destroy: destroySlugworm      });
const BabySlugEntities    = defineEntityType({ create: createSlugworm,      destroy: destroySlugworm      });
const SlidingDoorEntities = defineEntityType({ create: createSlidingDoor,   destroy: destroySlidingDoor   });

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
    unregisterEncounterMember(turret.id);
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
  if (enemy?.alive && !isPlayerInvulnerable()) {
    const comboLock = getEnemyComboLockDuration(enemy);
    if (comboLock > 0) {
      enemyComboLockTimer = Math.max(enemyComboLockTimer, comboLock);
      setPlayerControlLocked(true);
    }
  }
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

registerCollisionPair('player', 'octoboss_core', (_playerCol, coreCol, hit) => {
  const boss = OctobossEntities.getAll().find((entry) => entry.collidable === coreCol);
  if (!boss?.alive) return;

  const { point, normal } = computeContactInfo(_playerCol, coreCol);
  if (!canDamageOctobossCore(boss)) {
    emitSparks(point, normal, Math.floor(18 + hit.impactForce * 10), Math.min(1, hit.impactForce / 7));
    return;
  }

  const safePlayerRpm = Math.max(0.01, playerBody.rpm);
  const safeEnemyRpm = Math.max(0.01, coreCol.rpm);
  const rpmDamage = COLLISION_DAMAGE_RATIO * playerBody.rpmCapacity
    * hit.impactForce * (playerBody.mass / coreCol.mass)
    * (safePlayerRpm / safeEnemyRpm) * playerBody.heatFactor
    * getOctobossCoreDamageMultiplier(boss);
  boss.collidable.rpm = Math.max(0, boss.collidable.rpm - rpmDamage);
  emitSparks(point, normal, Math.floor(22 + hit.impactForce * 12), Math.min(1, hit.impactForce / 6));
});

registerCollisionPair('player', 'octoboss_tip', (_playerCol, tipCol, hit) => {
  for (const boss of OctobossEntities.getAll()) {
    if (!boss.alive) continue;
    const tentacle = boss.tentacles.find((entry) => entry.collidable === tipCol);
    if (!tentacle) continue;

    const { point, normal } = computeContactInfo(_playerCol, tipCol);
    emitSparks(point, normal, Math.floor(14 + hit.impactForce * 8), Math.min(1, 0.45 + hit.impactForce / 8));
    const dx = playerBody.pos.x - tipCol.pos.x;
    const dz = playerBody.pos.z - tipCol.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    playerBody.vel.x += (dx / len) * (3.2 + hit.impactForce * 0.85);
    playerBody.vel.z += (dz / len) * (3.2 + hit.impactForce * 0.85);
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
  if (!isPlayerInvulnerable()) {
    playerBody.rpm = Math.max(0, playerBody.rpm - playerDamage * playerDamageMult);
  }

  if ((hitWeak || playerDamage * playerDamageMult > 5) && !isPlayerInvulnerable()) {
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
    if (!isPlayerInvulnerable()) {
      playerBody.rpm = Math.max(0, playerBody.rpm - drain);
      notifyPlayerHit();
    }
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
  if (pickup.collected || isPlayerInvulnerable()) return;

  if (pickup.type === 'normal') {
    const halfPoint = spinnerConfig.rpmCapacity * RPM_HALF_POINT_RATIO;
    playerBody.rpm += pickupRpmGain(playerBody.rpm, halfPoint, PICKUP_RPM_BOOST);
  } else if (pickup.type === 'hyper') {
    playerBody.rpm += HYPER_BOOST;
  } else {
    addPlayerCapacity(spinnerConfig.growthPickupCapacityGain);
  }
  collectPickup(pickup);
});

// ─── Player ──────────────────────────────────────────────────────────────────

setupPlayer();

// ─── Game state ──────────────────────────────────────────────────────────────

const pickups:     Pickup[]     = [];
const projectiles: Projectile[] = [];
const explosions:  Explosion[]  = [];
const octobossParasiteOwners = new Map<number, number>();
const octobossDroneOwners = new Map<number, number>();

const OCTOBOSS_PARASITE_TIER = {
  ...ENEMY_SPINNER_TIER_1,
  rpmCapacity: 46,
  radius: 0.42,
  mass: 0.72,
  maxSpeed: 10.4,
  acceleration: 15.2,
  heatFactor: 0.62,
  chargeRange: 4.9,
  chargeBoost: 1.4,
  recoveryTime: 0.95,
  color: 0xc98448,
};

const OCTOBOSS_DRONE_TIER = {
  ...ROBOT_TIER_1,
  hp: 9,
  radius: 0.5,
  mass: 0.16,
  heatFactor: 0.42,
  maxSpeed: 6.7,
  acceleration: 14.5,
  attackRange: 11.0,
  preferredRange: 8.2,
  strafeTime: 3.0,
  prepareTime: 0.82,
  cooldownTime: 1.45,
  projectileDamage: 7,
  barrelTurnSpeed: 3.2,
  color: 0xd19b68,
};

const OCTOBOSS_PARASITE_CAP = [4, 4, 5];
const OCTOBOSS_DRONE_CHANCE = [0.28, 0.44, 0.58];
const fireTorches: FireTorch[]  = [];
const dynamicLevelLightRoots: THREE.Object3D[] = [];
const pendingTriggeredEntities = new Map<string, LevelEntity[]>();
const SPIDER_MOTION_DEBUG = false;
const PLAYER_WEB_SPEED_MULT = 0.16;
const PLAYER_WEB_VEL_DAMP = 0.42;
let playerWebTimer = 0;
let enemyComboLockTimer = 0;

type MotionBucket = 'move_x' | 'move_z';
type SpiderMotionState = 'chase' | 'orbit' | 'collapse' | 'hop_windup' | 'hop_air' | 'hop_recover';

interface MotionStats {
  samples: number;
  worldSpeed: number;
  screenSpeed: number;
  absMoveX: number;
  absMoveZ: number;
}

const spiderMotionDebugBuckets: Record<`${SpiderMotionState}:${MotionBucket}`, MotionStats> = {
  'chase:move_x':       { samples: 0, worldSpeed: 0, screenSpeed: 0, absMoveX: 0, absMoveZ: 0 },
  'chase:move_z':       { samples: 0, worldSpeed: 0, screenSpeed: 0, absMoveX: 0, absMoveZ: 0 },
  'orbit:move_x':       { samples: 0, worldSpeed: 0, screenSpeed: 0, absMoveX: 0, absMoveZ: 0 },
  'orbit:move_z':       { samples: 0, worldSpeed: 0, screenSpeed: 0, absMoveX: 0, absMoveZ: 0 },
  'collapse:move_x':    { samples: 0, worldSpeed: 0, screenSpeed: 0, absMoveX: 0, absMoveZ: 0 },
  'collapse:move_z':    { samples: 0, worldSpeed: 0, screenSpeed: 0, absMoveX: 0, absMoveZ: 0 },
  'hop_windup:move_x':  { samples: 0, worldSpeed: 0, screenSpeed: 0, absMoveX: 0, absMoveZ: 0 },
  'hop_windup:move_z':  { samples: 0, worldSpeed: 0, screenSpeed: 0, absMoveX: 0, absMoveZ: 0 },
  'hop_air:move_x':     { samples: 0, worldSpeed: 0, screenSpeed: 0, absMoveX: 0, absMoveZ: 0 },
  'hop_air:move_z':     { samples: 0, worldSpeed: 0, screenSpeed: 0, absMoveX: 0, absMoveZ: 0 },
  'hop_recover:move_x': { samples: 0, worldSpeed: 0, screenSpeed: 0, absMoveX: 0, absMoveZ: 0 },
  'hop_recover:move_z': { samples: 0, worldSpeed: 0, screenSpeed: 0, absMoveX: 0, absMoveZ: 0 },
};

const spiderMotionDebug = {
  hasPrevScreenPos: false,
  prevScreenX: 0,
  prevScreenY: 0,
  prevWorldX: 0,
  prevWorldZ: 0,
  sampleTimer: 0,
};

interface AreaZone {
  contains(point: { x: number; z: number }): boolean;
}

interface SpawnTriggerZone extends AreaZone {
  id: string;
  fired: boolean;
}

interface AwakenableEncounterEntity {
  awakenId: string;
  encounterId: string;
  alerted: boolean;
  isAlive: () => boolean;
  isAwake: () => boolean;
  setAwake: (awakened: boolean) => void;
  getPos: () => Vec2;
  getDetectionRadius: (alerted: boolean) => number;
}

interface EncounterState extends AreaZone {
  id: string;
  activated: boolean;
  cleared: boolean;
  liveEntityIds: Set<number>;
  doorIds: Set<number>;
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

interface CheckpointState {
  id: string;
  pos: Vec2;
  radius: number;
  pulseOffset: number;
  activated: boolean;
  current: boolean;
  group: THREE.Group;
  baseRing: THREE.Mesh;
  haloRing: THREE.Mesh;
  beacon: THREE.Mesh;
  core: THREE.Mesh;
}

const spawnTriggerZones: SpawnTriggerZone[] = [];
const killFallZones: AreaZone[] = [];
const encounters = new Map<string, EncounterState>();
const levelEntityEncounterIds = new Map<string, string>();
const runtimeEncounterEntityIds = new Map<number, string>();
const slidingDoorsById = new Map<number, SlidingDoorState>();
const closeTriggerDoorIds = new Map<string, Set<number>>();
const fallingVictims: FallingVictim[] = [];
const fallableActors: FallableActor[] = [];
const checkpoints: CheckpointState[] = [];
const awakenableEncounterEntities: AwakenableEncounterEntity[] = [];
const KILL_FALL_DELAY = 0.5;
const DEFAULT_CHECKPOINT_RADIUS = 1.6;
const RESPAWN_INVULNERABILITY_DURATION = 1.6;
let playerKillFallTimer = 0;
let playerSpawnPoint: Vec2 = { x: 0, z: 0 };
let activeCheckpoint: CheckpointState | null = null;
let respawnPending = false;
let respawnInvulnerabilityTimer = 0;

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

function readNumberProperty(props: Record<string, unknown> | undefined, key: string, fallback: number, min?: number): number {
  const raw = props?.[key];
  const parsed = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return min === undefined ? parsed : Math.max(min, parsed);
}

function readTriggerKind(props: Record<string, unknown> | undefined): 'awaken' | 'visibility' | 'kill_fall' {
  const triggerKind = readStringProperty(props, 'triggerKind');
  if (triggerKind === 'kill_fall') return 'kill_fall';
  if (triggerKind === 'visibility') return 'visibility';
  if (readStringProperty(props, 'triggerAction') === 'kill_fall') return 'kill_fall';
  return 'awaken';
}

function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();

    const { material } = mesh;
    if (Array.isArray(material)) {
      for (const entry of material) entry.dispose();
    } else {
      material?.dispose();
    }
  });
}

function createCheckpointMarker(pos: Vec2): CheckpointState {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);

  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.09, 12, 42),
    new THREE.MeshStandardMaterial({
      color: 0xc8863f,
      emissive: 0x6a2e07,
      emissiveIntensity: 0.7,
      metalness: 0.15,
      roughness: 0.35,
    }),
  );
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = 0.06;
  group.add(baseRing);

  const haloRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.18, 0.05, 10, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffc66f,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  haloRing.rotation.x = Math.PI / 2;
  haloRing.position.y = 0.1;
  group.add(haloRing);

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 1.35, 8),
    new THREE.MeshStandardMaterial({
      color: 0xf8d084,
      emissive: 0xc07a19,
      emissiveIntensity: 1.1,
      metalness: 0.05,
      roughness: 0.28,
    }),
  );
  beacon.position.y = 0.72;
  group.add(beacon);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xfff2bf,
      transparent: true,
      opacity: 0.92,
    }),
  );
  core.position.y = 1.42;
  group.add(core);

  scene.add(group);

  return {
    id: '',
    pos: cloneVec2(pos),
    radius: DEFAULT_CHECKPOINT_RADIUS,
    pulseOffset: Math.random() * Math.PI * 2,
    activated: false,
    current: false,
    group,
    baseRing,
    haloRing,
    beacon,
    core,
  };
}

function refreshCheckpointVisual(checkpoint: CheckpointState, now: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(now * 3.2 + checkpoint.pulseOffset);
  const reached = checkpoint.activated;
  const current = checkpoint.current;

  const ringMat = checkpoint.baseRing.material as THREE.MeshStandardMaterial;
  const haloMat = checkpoint.haloRing.material as THREE.MeshBasicMaterial;
  const beaconMat = checkpoint.beacon.material as THREE.MeshStandardMaterial;
  const coreMat = checkpoint.core.material as THREE.MeshBasicMaterial;

  const ringColor = current ? 0x6cf0ff : reached ? 0x72ffb1 : 0xc8863f;
  const emissiveColor = current ? 0x2aa4c5 : reached ? 0x159355 : 0x6a2e07;
  const haloColor = current ? 0x8cf7ff : reached ? 0x8cffc4 : 0xffc66f;
  const coreColor = current ? 0xe8ffff : reached ? 0xe9ffe7 : 0xfff2bf;

  ringMat.color.setHex(ringColor);
  ringMat.emissive.setHex(emissiveColor);
  ringMat.emissiveIntensity = current ? 1.35 + pulse * 0.4 : reached ? 0.9 + pulse * 0.2 : 0.6 + pulse * 0.14;

  haloMat.color.setHex(haloColor);
  haloMat.opacity = current ? 0.42 + pulse * 0.22 : reached ? 0.26 + pulse * 0.1 : 0.24 + pulse * 0.08;

  beaconMat.color.setHex(current ? 0xb9f7ff : reached ? 0xc4ffd7 : 0xf8d084);
  beaconMat.emissive.setHex(current ? 0x46d0ff : reached ? 0x2dbb77 : 0xc07a19);
  beaconMat.emissiveIntensity = current ? 1.6 + pulse * 0.45 : reached ? 1.0 + pulse * 0.18 : 1.0 + pulse * 0.12;

  coreMat.color.setHex(coreColor);
  coreMat.opacity = current ? 0.78 + pulse * 0.2 : reached ? 0.65 + pulse * 0.1 : 0.58 + pulse * 0.08;

  checkpoint.baseRing.rotation.z = now * 0.35 + checkpoint.pulseOffset * 0.12;
  checkpoint.haloRing.rotation.z = -now * 0.5 + checkpoint.pulseOffset * 0.18;
  checkpoint.haloRing.scale.setScalar(0.98 + pulse * 0.08);
  checkpoint.core.position.y = 1.36 + pulse * 0.14;
}

function updateCheckpointVisuals(now: number): void {
  for (const checkpoint of checkpoints) {
    refreshCheckpointVisual(checkpoint, now);
  }
}

function clearCheckpoints(): void {
  while (checkpoints.length > 0) {
    const checkpoint = checkpoints.pop()!;
    scene.remove(checkpoint.group);
    disposeObject3D(checkpoint.group);
  }
  activeCheckpoint = null;
}

function setCurrentCheckpoint(checkpoint: CheckpointState | null): void {
  activeCheckpoint = checkpoint;
  for (const entry of checkpoints) {
    entry.current = entry === checkpoint;
    if (entry === checkpoint) entry.activated = true;
  }
}

function activateCheckpoint(checkpoint: CheckpointState): void {
  if (activeCheckpoint === checkpoint) return;
  setCurrentCheckpoint(checkpoint);
  emitPlasma({ x: checkpoint.pos.x, y: 0.95, z: checkpoint.pos.z }, 18, 0.55);
  emitSparks(
    { x: checkpoint.pos.x, y: 0.15, z: checkpoint.pos.z },
    { x: 0, y: 1, z: 0 },
    24,
    0.8,
  );
}

function updateCheckpointActivation(): void {
  for (const checkpoint of checkpoints) {
    const dx = playerBody.pos.x - checkpoint.pos.x;
    const dz = playerBody.pos.z - checkpoint.pos.z;
    if (dx * dx + dz * dz <= checkpoint.radius * checkpoint.radius) {
      activateCheckpoint(checkpoint);
    }
  }
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
  const vertices = poly.vertices.map((vertex) => ({ x: vertex.x, z: lvZ(vertex.y) }));
  const holes = (poly.holes ?? []).map((hole) => hole.map((vertex) => ({ x: vertex.x, z: lvZ(vertex.y) })));
  return {
    contains(point) {
      if (!isPointInPolygon(point, vertices)) return false;
      return !holes.some((hole) => hole.length >= 3 && isPointInPolygon(point, hole));
    },
  };
}

function buildAreaZoneFromCircle(circle: LevelCircle): AreaZone | null {
  if (circle.radius <= 0) return null;
  const center = { x: circle.center.x, z: lvZ(circle.center.y) };
  const radiusSq = circle.radius * circle.radius;
  return {
    contains(point) {
      const dx = point.x - center.x;
      const dz = point.z - center.z;
      return dx * dx + dz * dz <= radiusSq;
    },
  };
}

function isEncounterTargetEntity(ent: LevelEntity): boolean {
  switch (ent.type) {
    case 'turret':
    case 'enemy_spinner':
    case 'enemy_spinner_tier_1':
    case 'enemy_spinner_tier_2':
    case 'enemy_spinner_tier_3':
    case 'zombie':
    case 'robot':
    case 'dreadnought':
    case 'siege_engine':
    case 'spider_reliquary':
    case 'octoboss':
    case 'hive_boss':
    case 'slug_big':
    case 'slug_baby':
      return true;
    default:
      return readBooleanProperty(ent.properties, 'encounterTarget');
  }
}

function getEncounterForPoint(point: Vec2): EncounterState | null {
  for (const encounter of encounters.values()) {
    if (encounter.contains(point)) return encounter;
  }
  return null;
}

function openEncounterDoors(encounter: EncounterState): void {
  for (const doorId of encounter.doorIds) {
    const door = slidingDoorsById.get(doorId);
    if (door) setSlidingDoorOpen(door, true);
  }
}

function closeEncounterDoors(encounter: EncounterState): void {
  for (const doorId of encounter.doorIds) {
    const door = slidingDoorsById.get(doorId);
    if (door) setSlidingDoorOpen(door, false);
  }
}

function clearEncounter(encounter: EncounterState): void {
  encounter.cleared = true;
  openEncounterDoors(encounter);
}

function activateEncounter(id: string): void {
  const encounter = encounters.get(id);
  if (!encounter || encounter.activated) return;
  encounter.activated = true;
  if (encounter.liveEntityIds.size === 0) {
    clearEncounter(encounter);
    return;
  }
  closeEncounterDoors(encounter);
}

function registerEncounterMember(levelEntity: LevelEntity, runtimeId: number): void {
  const encounterId = levelEntityEncounterIds.get(levelEntity.id);
  if (!encounterId) return;
  const encounter = encounters.get(encounterId);
  if (!encounter) return;

  encounter.liveEntityIds.add(runtimeId);
  runtimeEncounterEntityIds.set(runtimeId, encounterId);
}

function unregisterEncounterMember(runtimeId: number): void {
  const encounterId = runtimeEncounterEntityIds.get(runtimeId);
  if (!encounterId) return;
  runtimeEncounterEntityIds.delete(runtimeId);

  const encounter = encounters.get(encounterId);
  if (!encounter) return;
  encounter.liveEntityIds.delete(runtimeId);

  if (encounter.activated && !encounter.cleared && encounter.liveEntityIds.size === 0) {
    clearEncounter(encounter);
  }
}

function registerEncounterDoor(door: SlidingDoorState): void {
  slidingDoorsById.set(door.id, door);
  if (!door.encounterId) return;

  const encounter = encounters.get(door.encounterId);
  if (!encounter) return;
  encounter.doorIds.add(door.id);

  if (encounter.cleared) {
    setSlidingDoorOpen(door, true);
  } else if (encounter.activated && encounter.liveEntityIds.size > 0) {
    setSlidingDoorOpen(door, false);
  }
}

function registerCloseTriggerDoor(door: SlidingDoorState): void {
  if (!door.closeTriggerId) return;
  const existing = closeTriggerDoorIds.get(door.closeTriggerId);
  if (existing) existing.add(door.id);
  else closeTriggerDoorIds.set(door.closeTriggerId, new Set([door.id]));
}

function unregisterEncounterDoor(door: SlidingDoorState): void {
  slidingDoorsById.delete(door.id);
  if (!door.encounterId) return;
  const encounter = encounters.get(door.encounterId);
  encounter?.doorIds.delete(door.id);
}

function unregisterCloseTriggerDoor(door: SlidingDoorState): void {
  if (!door.closeTriggerId) return;
  const ids = closeTriggerDoorIds.get(door.closeTriggerId);
  if (!ids) return;
  ids.delete(door.id);
  if (ids.size === 0) closeTriggerDoorIds.delete(door.closeTriggerId);
}

function activateCloseTrigger(triggerId: string): void {
  const doorIds = closeTriggerDoorIds.get(triggerId);
  if (!doorIds) return;
  for (const doorId of doorIds) {
    const door = slidingDoorsById.get(doorId);
    if (door) setSlidingDoorOpen(door, false);
  }
}

function shouldPreloadTriggeredEntity(ent: LevelEntity): boolean {
  switch (ent.type) {
    case 'enemy_spinner':
    case 'enemy_spinner_tier_1':
    case 'enemy_spinner_tier_2':
    case 'enemy_spinner_tier_3':
    case 'zombie':
    case 'robot':
    case 'spider_reliquary':
      return true;
    default:
      return false;
  }
}

function registerAwakenableEncounterEntity(
  ent: LevelEntity,
  awakenId: string,
  entry: Omit<AwakenableEncounterEntity, 'awakenId' | 'encounterId' | 'alerted'>,
): void {
  awakenableEncounterEntities.push({
    awakenId,
    encounterId: levelEntityEncounterIds.get(ent.id) ?? awakenId,
    alerted: false,
    ...entry,
  });
}

function awakenEncounterEntities(triggerId: string): void {
  for (const entry of awakenableEncounterEntities) {
    if (entry.awakenId !== triggerId) continue;
    if (!entry.isAlive()) continue;
    entry.alerted = true;
    entry.setAwake(true);
    activateEncounter(entry.encounterId);
  }
}

function updateAwakenableEncounterEntities(): void {
  for (const entry of awakenableEncounterEntities) {
    if (!entry.isAlive() || entry.isAwake()) continue;

    const pos = entry.getPos();
    const radius = entry.getDetectionRadius(entry.alerted);
    const dx = playerBody.pos.x - pos.x;
    const dz = playerBody.pos.z - pos.z;
    if (dx * dx + dz * dz > radius * radius) continue;

    entry.alerted = true;
    entry.setAwake(true);
    activateEncounter(entry.encounterId);
  }
}

function resetAwakenableEncounterEntitiesForRespawn(): void {
  for (const entry of awakenableEncounterEntities) {
    if (!entry.isAlive()) continue;
    entry.setAwake(false);
    const encounter = encounters.get(entry.encounterId);
    entry.alerted = Boolean(encounter?.activated && !encounter.cleared);
  }
}

function rebuildTriggerZones(level: LevelData): void {
  spawnTriggerZones.length = 0;
  killFallZones.length = 0;
  encounters.clear();
  levelEntityEncounterIds.clear();

  const encounterZones = new Map<string, AreaZone[]>();

  function recordEncounterZone(triggerId: string, zone: AreaZone): void {
    const zonesForEncounter = encounterZones.get(triggerId);
    if (zonesForEncounter) zonesForEncounter.push(zone);
    else encounterZones.set(triggerId, [zone]);
  }

  for (const poly of level.polygons ?? []) {
    if (poly.layer !== 'trigger') continue;
    const zone = buildAreaZoneFromPolygon(poly);
    if (!zone) continue;

    const triggerId = readStringProperty(poly.properties, 'triggerId');
    const triggerKind = readTriggerKind(poly.properties);
    if (triggerId && triggerKind !== 'kill_fall') {
      spawnTriggerZones.push({ id: triggerId, fired: false, contains: zone.contains });
      recordEncounterZone(triggerId, zone);
    }
    if (triggerKind === 'kill_fall') {
      killFallZones.push(zone);
    }
  }

  for (const circle of level.circles ?? []) {
    if (circle.layer !== 'trigger') continue;
    const zone = buildAreaZoneFromCircle(circle);
    if (!zone) continue;

    const triggerId = readStringProperty(circle.properties, 'triggerId');
    const triggerKind = readTriggerKind(circle.properties);
    if (triggerId && triggerKind !== 'kill_fall') {
      spawnTriggerZones.push({ id: triggerId, fired: false, contains: zone.contains });
      recordEncounterZone(triggerId, zone);
    }
    if (triggerKind === 'kill_fall') {
      killFallZones.push(zone);
    }
  }

  for (const [id, zonesForEncounter] of encounterZones) {
    encounters.set(id, {
      id,
      activated: false,
      cleared: false,
      liveEntityIds: new Set<number>(),
      doorIds: new Set<number>(),
      contains(point) {
        return zonesForEncounter.some((zone) => zone.contains(point));
      },
    });
  }

  for (const entity of level.entities) {
    if (!isEncounterTargetEntity(entity)) continue;

    const explicitEncounterId = readStringProperty(entity.properties, 'encounterId');
    if (explicitEncounterId && encounters.has(explicitEncounterId)) {
      levelEntityEncounterIds.set(entity.id, explicitEncounterId);
      continue;
    }

    const spawnTrigger = readStringProperty(entity.properties, 'spawnTrigger');
    if (spawnTrigger && encounters.has(spawnTrigger)) {
      levelEntityEncounterIds.set(entity.id, spawnTrigger);
      continue;
    }

    const authoredPos = lvPos(entity.position);
    const encounter = getEncounterForPoint(authoredPos);
    if (encounter) levelEntityEncounterIds.set(entity.id, encounter.id);
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
  unregisterEncounterMember(enemy.id);
  deregisterEntity(enemy.id);
  removeCollidableFromGameplay(enemy.collidable);
  return [enemy.topResult.tiltGroup];
}

function deactivateZombieForFall(zombie: ZombieState): THREE.Object3D[] {
  zombie.alive = false;
  zombie.collidable.vel.x = 0;
  zombie.collidable.vel.z = 0;
  unregisterEncounterMember(zombie.id);
  deregisterEntity(zombie.id);
  removeCollidableFromGameplay(zombie.collidable);
  return [zombie.group];
}

function deactivateRobotForFall(robot: RobotEnemyState): THREE.Object3D[] {
  robot.alive = false;
  robot.collidable.vel.x = 0;
  robot.collidable.vel.z = 0;
  unregisterEncounterMember(robot.id);
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
  unregisterEncounterMember(slug.id);
  deregisterEntity(slug.id);
  removeCollidableFromGameplay(slug.collidable);
  return [slug.group];
}

function deactivateDreadnoughtForFall(boss: DreadnoughtState): THREE.Object3D[] {
  boss.alive = false;
  boss.collidable.vel.x = 0;
  boss.collidable.vel.z = 0;
  unregisterEncounterMember(boss.id);
  deregisterEntity(boss.id);
  removeCollidableFromGameplay(boss.collidable);
  removeBossDrainZones(boss);
  return [boss.topResult.tiltGroup, boss.group];
}

function deactivateSiegeForFall(boss: SiegeEngineState): THREE.Object3D[] {
  boss.alive = false;
  boss.collidable.vel.x = 0;
  boss.collidable.vel.z = 0;
  unregisterEncounterMember(boss.id);
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
  unregisterEncounterMember(boss.id);
  deregisterEntity(boss.id);
  removeCollidableFromGameplay(boss.collidable);
  for (const leg of boss.legs) {
    if (leg.alive) removeCollidableFromGameplay(leg.collidable);
  }
  return [boss.bodyGroup, boss.hpGroup, ...boss.legs.filter((leg) => leg.alive).map((leg) => leg.group)];
}

function deactivateOctobossForFall(boss: OctobossState): THREE.Object3D[] {
  boss.alive = false;
  boss.collidable.vel.x = 0;
  boss.collidable.vel.z = 0;
  unregisterEncounterMember(boss.id);
  deregisterEntity(boss.id);
  removeCollidableFromGameplay(boss.collidable);
  for (const tentacle of boss.tentacles) {
    removeCollidableFromGameplay(tentacle.collidable);
  }
  return [boss.bodyGroup, boss.hpGroup, ...boss.tentacles.map((tentacle) => tentacle.group)];
}

function deactivateHiveForFall(boss: HiveBossState): THREE.Object3D[] {
  boss.alive = false;
  boss.collidable.vel.x = 0;
  boss.collidable.vel.z = 0;
  unregisterEncounterMember(boss.id);
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
  beginPlayerRespawnSequence('pit');
}

function updateKillFallZones(delta: number): void {
  if (killFallZones.length === 0) return;

  if (!gameOver && !respawnPending) {
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
  const spawnTrigger = readStringProperty(ent.properties, 'spawnTrigger');
  const preloadTriggered = Boolean(spawnTrigger && shouldPreloadTriggeredEntity(ent));
  const spawnEnemySpinnerEntity = (config: typeof ENEMY_SPINNER_TIER_1): void => {
    const enemy = EnemyEntities.spawn(pos, config);
    registerEncounterMember(ent, enemy.id);
    if (preloadTriggered && spawnTrigger) {
      setEnemyAwake(enemy, false);
      registerAwakenableEncounterEntity(ent, spawnTrigger, {
        isAlive: () => enemy.alive,
        isAwake: () => enemy.awakened,
        setAwake: (awakened) => setEnemyAwake(enemy, awakened),
        getPos: () => enemy.collidable.pos,
        getDetectionRadius: (alerted) => alerted
          ? Math.max(enemy.config.orbitRange + 4, enemy.config.chargeRange * 2.4)
          : Math.max(enemy.config.orbitRange + 1, enemy.config.chargeRange * 1.5),
      });
    }
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
  };

  switch (ent.type) {
    case 'pickup':
      pickups.push(createNormalPickup(pos));
      break;
    case 'pickup_hyper':
      pickups.push(createHyperPickup(pos));
      break;
    case 'checkpoint': {
      const checkpoint = createCheckpointMarker(pos);
      checkpoint.id = ent.id;
      checkpoint.radius = readNumberProperty(ent.properties, 'radius', DEFAULT_CHECKPOINT_RADIUS, 0.5);
      checkpoints.push(checkpoint);
      if (readBooleanProperty(ent.properties, 'startActive')) {
        setCurrentCheckpoint(checkpoint);
      }
      break;
    }
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
      registerEncounterMember(ent, robot.id);
      if (preloadTriggered && spawnTrigger) {
        setRobotAwake(robot, false);
        registerAwakenableEncounterEntity(ent, spawnTrigger, {
          isAlive: () => robot.alive,
          isAwake: () => robot.awakened,
          setAwake: (awakened) => setRobotAwake(robot, awakened),
          getPos: () => robot.collidable.pos,
          getDetectionRadius: (alerted) => alerted
            ? Math.max(robot.config.attackRange * 1.5, robot.config.preferredRange + 6)
            : Math.max(robot.config.attackRange, robot.config.preferredRange + 2),
        });
      }
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
      registerEncounterMember(ent, siege.id);
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
      registerEncounterMember(ent, spider.id);
      if (preloadTriggered && spawnTrigger) {
        setSpiderAwake(spider, false);
        registerAwakenableEncounterEntity(ent, spawnTrigger, {
          isAlive: () => spider.alive,
          isAwake: () => spider.awakened,
          setAwake: (awakened) => setSpiderAwake(spider, awakened),
          getPos: () => spider.collidable.pos,
          getDetectionRadius: (alerted) => alerted
            ? Math.max(spider.config.legSlamTriggerRange + 4, spider.config.pulseRadius[0] + 3)
            : Math.max(spider.config.legSlamTriggerRange + 1, spider.config.pulseRadius[0]),
        });
      }
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
    case 'octoboss': {
      const octoboss = OctobossEntities.spawn(pos, OCTOBOSS_TIER_1);
      registerEncounterMember(ent, octoboss.id);
      if (isEntityFallable(ent)) {
        registerFallableActor(octoboss.collidable, () => {
          const roots = deactivateOctobossForFall(octoboss);
          enqueueFallingVictim(createFallingVictim(
            roots,
            octoboss.bodyGroup,
            () => OctobossEntities.destroy(octoboss),
          ));
        });
      }
      break;
    }
    case 'turret': {
      const turret = TurretEntities.spawn(pos, TURRET_TIER_1);
      registerEncounterMember(ent, turret.id);
      break;
    }
    case 'enemy_spinner':
    case 'enemy_spinner_tier_2': {
      spawnEnemySpinnerEntity(ENEMY_SPINNER_TIER_2);
      break;
    }
    case 'enemy_spinner_tier_1': {
      spawnEnemySpinnerEntity(ENEMY_SPINNER_TIER_1);
      break;
    }
    case 'enemy_spinner_tier_3': {
      spawnEnemySpinnerEntity(ENEMY_SPINNER_TIER_3);
      break;
    }
    case 'zombie': {
      const zombie = ZombieEntities.spawn(pos, ZOMBIE_TIER_1);
      registerEncounterMember(ent, zombie.id);
      if (preloadTriggered && spawnTrigger) {
        setZombieAwake(zombie, false);
        registerAwakenableEncounterEntity(ent, spawnTrigger, {
          isAlive: () => zombie.alive,
          isAwake: () => zombie.awakened,
          setAwake: (awakened) => setZombieAwake(zombie, awakened),
          getPos: () => zombie.collidable.pos,
          getDetectionRadius: (alerted) => alerted
            ? Math.max(zombie.config.attackRange * 5, 8)
            : Math.max(zombie.config.attackRange * 3, 4.5),
        });
      }
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
      registerEncounterMember(ent, dreadnought.id);
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
      registerEncounterMember(ent, hive.id);
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
      registerEncounterMember(ent, slug.id);
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
      registerEncounterMember(ent, slug.id);
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
    case 'sliding_door': {
      const encounterId = readStringProperty(ent.properties, 'encounterId');
      const closeTriggerId = readStringProperty(ent.properties, 'closeTriggerId');
      const rotationDeg = ent.rotation ?? 0;
      const defaults = defaultSlidingDoorConfig(rotationDeg, encounterId, closeTriggerId);
      const width = readNumberProperty(ent.properties, 'width', defaults.width, 1.5);
      const defaultTravel = Math.max(defaults.slideDistance, width * 0.4);
      const door = SlidingDoorEntities.spawn(pos, {
        rotationDeg,
        width,
        height: readNumberProperty(ent.properties, 'height', defaults.height, 0.8),
        thickness: readNumberProperty(ent.properties, 'thickness', defaults.thickness, 0.12),
        slideDistance: readNumberProperty(ent.properties, 'travel', defaultTravel, 0),
        openSpeed: readNumberProperty(ent.properties, 'openSpeed', defaults.openSpeed, 0.1),
        startOpen: ent.properties?.startOpen === undefined
          ? defaults.startOpen
          : readBooleanProperty(ent.properties, 'startOpen'),
        encounterId,
        closeTriggerId,
      });
      registerEncounterDoor(door);
      registerCloseTriggerDoor(door);
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
  runtimeEncounterEntityIds.clear();
  slidingDoorsById.clear();
  closeTriggerDoorIds.clear();
  fallableActors.length = 0;
  awakenableEncounterEntities.length = 0;
  clearCheckpoints();
  playerKillFallTimer = 0;
  playerSpawnPoint = { x: 0, z: 0 };
  activeCheckpoint = null;
  rebuildTriggerZones(level);

  for (const ent of level.entities) {
    const pos = lvPos(ent.position);
    if (ent.type === 'player_spawn' || ent.type === 'spawn') {
      playerSpawnPoint = cloneVec2(pos);
      playerBody.pos.x = pos.x;
      playerBody.pos.z = pos.z;
      continue;
    }

    const spawnTrigger = readStringProperty(ent.properties, 'spawnTrigger');
    if (spawnTrigger && !shouldPreloadTriggeredEntity(ent)) {
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
    activateCloseTrigger(zone.id);
    spawnTriggeredEntities(zone.id);
    awakenEncounterEntities(zone.id);
    activateEncounter(zone.id);
  }
}

const initialUrl = new URL(window.location.href);
let selectedLevelId: LevelChoiceId = DEBUG_SKIP_MAIN_MENU
  ? 'active'
  : parseLevelChoice(initialUrl.searchParams.get('level'));
const shouldAutostart = DEBUG_SKIP_MAIN_MENU || initialUrl.searchParams.get('autostart') === '1';

function replaceGameUrl(clearAutostart: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.set('level', selectedLevelId);
  if (clearAutostart) url.searchParams.delete('autostart');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function guessSiblingAppUrl(targetPort: string): string {
  const url = new URL(window.location.href);
  if (url.port) {
    url.port = targetPort;
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function getEditorUrl(): string {
  const configured = import.meta.env.VITE_EDITOR_URL?.trim();
  return configured || guessSiblingAppUrl('5174');
}

// ─── Overlays ────────────────────────────────────────────────────────────────

const menuOverlay = document.createElement('div');
menuOverlay.className = 'app-overlay menu-overlay';
menuOverlay.innerHTML = `
  <div class="overlay-card">
    <div class="overlay-kicker">Spinner</div>
    <h1>Choose Your Arena</h1>
    <p class="overlay-copy">Jump into a bundled level or load the editor's active map, then tear through it at full RPM.</p>
    <label class="overlay-field">
      <span>Level</span>
      <select class="overlay-select" id="menu-level-select">
        ${levelChoices.map((choice) => `<option value="${choice.id}">${choice.label}</option>`).join('')}
      </select>
    </label>
    <div class="overlay-actions">
      <button type="button" class="overlay-btn overlay-btn-primary" id="menu-start-btn">Start Run</button>
      <button type="button" class="overlay-btn" id="menu-editor-btn">Open Level Editor</button>
    </div>
    <p class="overlay-meta" id="menu-status">WASD to move, Shift to sprint, X for combo, M to return to the menu.</p>
  </div>
`;
document.body.appendChild(menuOverlay);

const levelSelectEl = menuOverlay.querySelector<HTMLSelectElement>('#menu-level-select')!;
const menuStartBtn = menuOverlay.querySelector<HTMLButtonElement>('#menu-start-btn')!;
const menuEditorBtn = menuOverlay.querySelector<HTMLButtonElement>('#menu-editor-btn')!;
const menuStatusEl = menuOverlay.querySelector<HTMLParagraphElement>('#menu-status')!;

const gameOverOverlay = document.createElement('div');
gameOverOverlay.className = 'app-overlay gameover-overlay';
gameOverOverlay.innerHTML = `
  <div class="overlay-card overlay-card-compact">
    <div class="overlay-kicker">Run Ended</div>
    <h2>Game Over</h2>
    <p class="overlay-copy">Press R to respawn at the active checkpoint, or head back to the menu to switch maps.</p>
    <div class="overlay-actions">
      <button type="button" class="overlay-btn overlay-btn-primary" id="gameover-restart-btn">Respawn</button>
      <button type="button" class="overlay-btn" id="gameover-menu-btn">Main Menu</button>
    </div>
  </div>
`;
document.body.appendChild(gameOverOverlay);

const gameOverRestartBtn = gameOverOverlay.querySelector<HTMLButtonElement>('#gameover-restart-btn')!;
const gameOverMenuBtn = gameOverOverlay.querySelector<HTMLButtonElement>('#gameover-menu-btn')!;

// ─── Shared State ────────────────────────────────────────────────────────────

let time = 0;
let gameOver = false;
let menuVisible = true;
let startInFlight = false;

function setMenuVisible(visible: boolean): void {
  menuVisible = visible;
  menuOverlay.style.display = visible ? 'flex' : 'none';
  gameOverOverlay.style.display = !visible && gameOver ? 'flex' : 'none';
  setHudVisible(!visible);
}

function setMenuBusy(busy: boolean, label?: string): void {
  startInFlight = busy;
  levelSelectEl.disabled = busy;
  menuStartBtn.disabled = busy;
  menuEditorBtn.disabled = busy;
  if (label) menuStatusEl.textContent = label;
}

function countAlive<T extends { alive: boolean }>(entries: readonly T[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.alive) count += 1;
  }
  return count;
}

function countUncollectedPickups(): number {
  let count = 0;
  for (const pickup of pickups) {
    if (!pickup.collected) count += 1;
  }
  return count;
}

function countEnabledCollidables(): number {
  let count = 0;
  for (const collidable of collidables) {
    if (collidable.enabled === false) continue;
    count += 1;
  }
  return count;
}

function countTotalCollidables(): number {
  return collidables.length;
}

function getProfilerCounts(): FrameCounts {
  return {
    projectiles: countAlive(projectiles),
    pickups: countUncollectedPickups(),
    explosions: countAlive(explosions),
    enemies:
      countAlive(TurretEntities.getAll()) +
      countAlive(EnemyEntities.getAll()) +
      countAlive(ZombieEntities.getAll()) +
      countAlive(RobotEntities.getAll()) +
      countAlive(BigSlugEntities.getAll()) +
      countAlive(BabySlugEntities.getAll()),
    bosses:
      countAlive(DreadnoughtEntities.getAll()) +
      countAlive(SiegeEntities.getAll()) +
      countAlive(SpiderEntities.getAll()) +
      countAlive(OctobossEntities.getAll()) +
      countAlive(HiveEntities.getAll()),
    collidables: countEnabledCollidables(),
    collidablesTotal: countTotalCollidables(),
    torches: fireTorches.length,
  };
}

function getProfilerRenderStats(): RenderStats {
  return {
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    lines: renderer.info.render.lines,
  };
}

function getProfilerSceneStats(): SceneStats {
  let totalObjects = 0;
  let visibleMeshes = 0;
  let totalMeshes = 0;
  let pointLights = 0;
  let shadowCasters = 0;

  scene.traverse((object) => {
    totalObjects += 1;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      totalMeshes += 1;
      if (mesh.visible) visibleMeshes += 1;
      if (mesh.castShadow) shadowCasters += 1;
    }
    if ((object as THREE.PointLight).isPointLight) pointLights += 1;
  });

  return {
    totalObjects,
    visibleMeshes,
    totalMeshes,
    pointLights,
    shadowCasters,
  };
}

function getProfilerFrameMode(): FrameMode {
  if (menuVisible) return 'menu';
  if (gameOver) return 'gameOver';
  if (respawnPending) return 'respawn';
  return 'gameplay';
}

function finishProfilerFrame(): void {
  profiler?.finishFrame(getProfilerRenderStats(), getProfilerCounts(), getProfilerSceneStats());
}

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
  OctobossEntities.destroyAll();
  RobotEntities.destroyAll();
  HiveEntities.destroyAll();
  BigSlugEntities.destroyAll();
  BabySlugEntities.destroyAll();
  for (const door of SlidingDoorEntities.getAll()) {
    unregisterEncounterDoor(door);
    unregisterCloseTriggerDoor(door);
  }
  SlidingDoorEntities.destroyAll();

  // Clear ECS registrations and reset player
  resetEntityRegistrations();
  resetSpinnerConfig();
  resetPlayer();
  setupPlayer();
  resetComboState();
  setPlayerControlLocked(false);
  respawnPending = false;
  respawnInvulnerabilityTimer = 0;
  syncPlayerInvulnerability();

  gameOver = false;
  gameOverOverlay.style.display = 'none';
  octobossParasiteOwners.clear();
  octobossDroneOwners.clear();
  runtimeEncounterEntityIds.clear();
  slidingDoorsById.clear();
  closeTriggerDoorIds.clear();
  encounters.clear();
  levelEntityEncounterIds.clear();

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
  resetCameraShake();
  resetClashFlashes();
  fallingVictims.length = 0;
  fallableActors.length = 0;
  playerKillFallTimer = 0;
  playerWebTimer = 0;
  enemyComboLockTimer = 0;
  clearDynamicLevelLights();
  clearCheckpoints();
  clearLevelLights(scene);
  setupLevelLights(scene, currentLevel);
  spawnAll(currentLevel);
  updateCheckpointVisuals(time);
}

async function startSelectedLevel(): Promise<void> {
  if (startInFlight) return;

  setMenuBusy(true, selectedLevelId === 'active'
    ? 'Loading the editor level...'
    : 'Loading the arena...');

  try {
    currentLevel = await resolveLevel(selectedLevelId);
    createArena(scene, currentLevel);
    resetGame();
    gameOver = false;
    replaceGameUrl(true);
    setMenuVisible(false);
  } catch (error) {
    console.error('Failed to start level:', error);
    setMenuBusy(false, 'Could not load that level. Check the console for details.');
    return;
  }

  setMenuBusy(false, 'WASD to move, Shift to sprint, X for combo, M to return to the menu.');
}

function returnToMenu(): void {
  resetGame();
  replaceGameUrl(true);
  setMenuVisible(true);
}

levelSelectEl.value = selectedLevelId;
levelSelectEl.addEventListener('change', () => {
  selectedLevelId = parseLevelChoice(levelSelectEl.value);
  replaceGameUrl(true);
  menuStatusEl.textContent = selectedLevelId === 'active'
    ? 'Starts from the editor\'s synced active level when available.'
    : 'Loads a bundled combat arena.';
});

menuStartBtn.addEventListener('click', () => {
  void startSelectedLevel();
});

menuEditorBtn.addEventListener('click', () => {
  window.location.assign(getEditorUrl());
});

gameOverRestartBtn.addEventListener('click', () => {
  if (!gameOver) return;
  finishPlayerRespawn();
});

gameOverMenuBtn.addEventListener('click', () => {
  returnToMenu();
});

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r' && gameOver) finishPlayerRespawn();
  if (e.key.toLowerCase() === 'm' && !menuVisible) returnToMenu();
});

type ComboPhase = 'idle' | 'active' | 'returning' | 'recovering';

interface ComboTarget {
  id: string;
  collidable: Collidable;
  getPos: () => Vec2;
  isValid: () => boolean;
  applyDamage: (damage: number) => void;
}

interface ComboSegment {
  kind: 'strike' | 'return';
  from: Vec2;
  to: Vec2;
  duration: number;
  elapsed: number;
  target?: ComboTarget;
  arc?: {
    center: Vec2;
    radius: number;
    startAngle: number;
    sweepDir: 1 | -1;
    control?: Vec2;
  };
}

interface ComboState {
  phase: ComboPhase;
  cooldownTimer: number;
  recoveryTimer: number;
  pauseTimer: number;
  strikeIndex: number;
  originPos: Vec2;
  slotTargets: ComboTarget[];
  hitCounts: Map<Collidable, number>;
  segment: ComboSegment | null;
}

const comboState: ComboState = {
  phase: 'idle',
  cooldownTimer: 0,
  recoveryTimer: 0,
  pauseTimer: 0,
  strikeIndex: 0,
  originPos: { x: 0, z: 0 },
  slotTargets: [],
  hitCounts: new Map(),
  segment: null,
};

function cloneVec2(vec: Vec2): Vec2 {
  return { x: vec.x, z: vec.z };
}

function resetComboState(): void {
  comboState.phase = 'idle';
  comboState.cooldownTimer = 0;
  comboState.recoveryTimer = 0;
  comboState.pauseTimer = 0;
  comboState.strikeIndex = 0;
  comboState.originPos = cloneVec2(playerBody.pos);
  comboState.slotTargets = [];
  comboState.hitCounts.clear();
  comboState.segment = null;
}

function isComboInvulnerable(): boolean {
  return comboState.phase === 'active' || comboState.phase === 'returning';
}

function syncPlayerInvulnerability(): void {
  setPlayerInvulnerable(respawnInvulnerabilityTimer > 0 || isComboInvulnerable());
}

function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function pointSegmentDistanceSq(point: Vec2, seg: Segment): number {
  const dx = seg.p2.x - seg.p1.x;
  const dz = seg.p2.z - seg.p1.z;
  const segLenSq = dx * dx + dz * dz;
  if (segLenSq === 0) return distanceSq(point, seg.p1);

  const t = Math.max(0, Math.min(1,
    ((point.x - seg.p1.x) * dx + (point.z - seg.p1.z) * dz) / segLenSq
  ));
  const closest = {
    x: seg.p1.x + t * dx,
    z: seg.p1.z + t * dz,
  };
  return distanceSq(point, closest);
}

function isPointSafeForPlayer(point: Vec2): boolean {
  if (isPointInLava(point)) return false;
  if (killFallZones.some((zone) => zone.contains(point))) return false;

  const minWallDistSq = Math.pow(playerBody.radius * 0.92, 2);
  for (const wall of walls) {
    if (pointSegmentDistanceSq(point, wall) < minWallDistSq) return false;
  }

  return true;
}

function getSafeComboReturnPoint(origin: Vec2, fallback: Vec2): Vec2 {
  if (isPointSafeForPlayer(origin)) return cloneVec2(origin);

  const sampleRadius = playerBody.radius * 1.6;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const candidate = {
      x: origin.x + Math.cos(angle) * sampleRadius,
      z: origin.z + Math.sin(angle) * sampleRadius,
    };
    if (isPointSafeForPlayer(candidate)) return candidate;
  }

  return cloneVec2(fallback);
}

function comboRepeatFalloff(hitCount: number): number {
  const falloff = spinnerConfig.comboRepeatFalloff;
  return falloff[Math.min(hitCount, falloff.length - 1)];
}

function makeComboTargetId(prefix: string, collidable: Collidable): string {
  return `${prefix}-${collidables.indexOf(collidable)}`;
}

function buildComboTargets(): ComboTarget[] {
  const targets: ComboTarget[] = [];

  for (const turret of TurretEntities.getAll()) {
    if (!turret.alive) continue;
    targets.push({
      id: makeComboTargetId('turret', turret.collidable),
      collidable: turret.collidable,
      getPos: () => cloneVec2(turret.collidable.pos),
      isValid: () => turret.alive,
      applyDamage: (damage) => {
        if (!turret.alive) return;
        if (applyDamageToTurret(turret, damage)) {
          const deathPos = cloneVec2(turret.collidable.pos);
          unregisterEncounterMember(turret.id);
          TurretEntities.destroy(turret);
          explosions.push(createExplosion(deathPos));
        }
      },
    });
  }

  for (const enemy of EnemyEntities.getAll()) {
    if (!enemy.alive || !isCollidableEnabled(enemy.collidable)) continue;
    targets.push({
      id: makeComboTargetId('enemy', enemy.collidable),
      collidable: enemy.collidable,
      getPos: () => cloneVec2(enemy.collidable.pos),
      isValid: () => enemy.alive && isCollidableEnabled(enemy.collidable),
      applyDamage: (damage) => {
        if (!enemy.alive) return;
        enemy.collidable.rpm = Math.max(0, enemy.collidable.rpm - damage);
        onEnemyCollision(enemy);
      },
    });
  }

  for (const zombie of ZombieEntities.getAll()) {
    if (!zombie.alive || !isCollidableEnabled(zombie.collidable)) continue;
    targets.push({
      id: makeComboTargetId('zombie', zombie.collidable),
      collidable: zombie.collidable,
      getPos: () => cloneVec2(zombie.collidable.pos),
      isValid: () => zombie.alive && isCollidableEnabled(zombie.collidable),
      applyDamage: (damage) => {
        if (!zombie.alive) return;
        applyDamageToZombie(zombie, damage);
      },
    });
  }

  for (const boss of DreadnoughtEntities.getAll()) {
    if (!boss.alive) continue;
    targets.push({
      id: makeComboTargetId('boss', boss.collidable),
      collidable: boss.collidable,
      getPos: () => cloneVec2(boss.collidable.pos),
      isValid: () => boss.alive,
      applyDamage: (damage) => {
        if (!boss.alive) return;
        const { bossDamageMult } = checkWeakPoint(boss, playerBody.pos);
        boss.collidable.rpm = Math.max(0, boss.collidable.rpm - damage * bossDamageMult);
      },
    });
  }

  for (const siege of SiegeEntities.getAll()) {
    if (!siege.alive) continue;

    if (!isShieldAlive(siege)) {
      targets.push({
        id: makeComboTargetId('siege-core', siege.collidable),
        collidable: siege.collidable,
        getPos: () => cloneVec2(siege.collidable.pos),
        isValid: () => siege.alive && !isShieldAlive(siege),
        applyDamage: (damage) => {
          if (!siege.alive || isShieldAlive(siege)) return;
          siege.collidable.rpm = Math.max(0, siege.collidable.rpm - damage);
        },
      });
    }

    for (const part of siege.parts) {
      if (!part.alive) continue;
      targets.push({
        id: makeComboTargetId(`siege-part-${part.type}`, part.collidable),
        collidable: part.collidable,
        getPos: () => cloneVec2(part.collidable.pos),
        isValid: () => siege.alive && part.alive,
        applyDamage: (damage) => {
          if (!siege.alive || !part.alive) return;
          if (applyDamageToSiegePart(siege, part, damage)) {
            explosions.push(createExplosion(cloneVec2(part.collidable.pos)));
          }
        },
      });
    }
  }

  for (const spider of SpiderEntities.getAll()) {
    if (!spider.alive) continue;

    if (isCollidableEnabled(spider.collidable) && canDamageSpiderCore(spider)) {
      targets.push({
        id: makeComboTargetId('spider-core', spider.collidable),
        collidable: spider.collidable,
        getPos: () => cloneVec2(spider.collidable.pos),
        isValid: () => spider.alive && isCollidableEnabled(spider.collidable) && canDamageSpiderCore(spider),
        applyDamage: (damage) => {
          if (!spider.alive || !canDamageSpiderCore(spider)) return;
          spider.collidable.rpm = Math.max(
            0,
            spider.collidable.rpm - damage * getSpiderCoreDamageMultiplier(spider),
          );
        },
      });
    }

    for (const leg of spider.legs) {
      if (!leg.alive || !isCollidableEnabled(leg.collidable)) continue;
      targets.push({
        id: makeComboTargetId('spider-leg', leg.collidable),
        collidable: leg.collidable,
        getPos: () => cloneVec2(leg.collidable.pos),
        isValid: () => spider.alive && leg.alive && isCollidableEnabled(leg.collidable),
        applyDamage: (damage) => {
          if (!spider.alive || !leg.alive) return;
          if (applyDamageToSpiderLeg(spider, leg, damage)) {
            explosions.push(createExplosion(cloneVec2(leg.collidable.pos)));
          }
        },
      });
    }
  }

  for (const boss of OctobossEntities.getAll()) {
    if (!boss.alive || !canDamageOctobossCore(boss)) continue;
    targets.push({
      id: makeComboTargetId('octoboss-core', boss.collidable),
      collidable: boss.collidable,
      getPos: () => cloneVec2(boss.collidable.pos),
      isValid: () => boss.alive && canDamageOctobossCore(boss),
      applyDamage: (damage) => {
        if (!boss.alive || !canDamageOctobossCore(boss)) return;
        boss.collidable.rpm = Math.max(
          0,
          boss.collidable.rpm - damage * getOctobossCoreDamageMultiplier(boss),
        );
      },
    });
  }

  for (const robot of RobotEntities.getAll()) {
    if (!robot.alive || !isCollidableEnabled(robot.collidable)) continue;
    targets.push({
      id: makeComboTargetId('robot', robot.collidable),
      collidable: robot.collidable,
      getPos: () => cloneVec2(robot.collidable.pos),
      isValid: () => robot.alive && isCollidableEnabled(robot.collidable),
      applyDamage: (damage) => {
        if (!robot.alive) return;
        applyDamageToRobot(robot, damage);
      },
    });
  }

  for (const hive of HiveEntities.getAll()) {
    if (!hive.alive) continue;

    targets.push({
      id: makeComboTargetId('hive-core', hive.collidable),
      collidable: hive.collidable,
      getPos: () => cloneVec2(hive.collidable.pos),
      isValid: () => hive.alive,
      applyDamage: (damage) => {
        if (!hive.alive) return;
        const aliveCount = hive.flock.filter((spinner) => spinner.alive).length;
        const shieldMult = aliveCount >= 3 ? 0.1 : aliveCount >= 1 ? 0.4 : 1.0;
        applyDamageToHiveCore(hive, damage * shieldMult);
      },
    });

    for (const spinner of hive.flock) {
      if (!spinner.alive) continue;
      targets.push({
        id: makeComboTargetId('hive-flock', spinner.collidable),
        collidable: spinner.collidable,
        getPos: () => cloneVec2(spinner.collidable.pos),
        isValid: () => hive.alive && spinner.alive,
        applyDamage: (damage) => {
          if (!hive.alive || !spinner.alive) return;
          spinner.collidable.rpm = Math.max(0, spinner.collidable.rpm - damage);
          onFlockCollision(spinner);
        },
      });
    }
  }

  for (const slug of BigSlugEntities.getAll()) {
    if (!slug.alive) continue;
    targets.push({
      id: makeComboTargetId('slug-big', slug.collidable),
      collidable: slug.collidable,
      getPos: () => cloneVec2(slug.collidable.pos),
      isValid: () => slug.alive,
      applyDamage: (damage) => {
        if (!slug.alive) return;
        applyDamageToSlug(slug, damage);
      },
    });
  }

  for (const slug of BabySlugEntities.getAll()) {
    if (!slug.alive) continue;
    targets.push({
      id: makeComboTargetId('slug-baby', slug.collidable),
      collidable: slug.collidable,
      getPos: () => cloneVec2(slug.collidable.pos),
      isValid: () => slug.alive,
      applyDamage: (damage) => {
        if (!slug.alive) return;
        applyDamageToSlug(slug, damage);
      },
    });
  }

  return targets;
}

function getNearestComboTargets(from: Vec2): ComboTarget[] {
  return buildComboTargets()
    .sort((a, b) => distanceSq(from, a.getPos()) - distanceSq(from, b.getPos()));
}

function resolveComboStrikeTarget(): ComboTarget | null {
  const preferred = comboState.slotTargets[comboState.strikeIndex];
  if (preferred?.isValid()) return preferred;

  const nearest = getNearestComboTargets(playerBody.pos);
  return nearest[0] ?? null;
}

function countQueuedComboHits(target: ComboTarget): number {
  return comboState.slotTargets.filter((entry) => entry.collidable === target.collidable).length;
}

function computeComboStrikeDestination(from: Vec2, target: ComboTarget): Vec2 {
  const targetPos = target.getPos();
  const repeatHitCount = comboState.hitCounts.get(target.collidable) ?? 0;
  let dx = comboState.originPos.x - targetPos.x;
  let dz = comboState.originPos.z - targetPos.z;
  let dist = Math.hypot(dx, dz);

  if (dist < 0.001) {
    dx = from.x - targetPos.x;
    dz = from.z - targetPos.z;
    dist = Math.hypot(dx, dz);
  }

  if (dist < 0.001) {
    dx = 1;
    dz = 0;
    dist = 1;
  }

  let dirX = dx / dist;
  let dirZ = dz / dist;
  const repeatAngleOffsets = [0, 1.05, -1.05];
  const angleOffset = repeatAngleOffsets[Math.min(repeatHitCount, repeatAngleOffsets.length - 1)];
  if (angleOffset !== 0) {
    const cos = Math.cos(angleOffset);
    const sin = Math.sin(angleOffset);
    const rotatedX = dirX * cos - dirZ * sin;
    const rotatedZ = dirX * sin + dirZ * cos;
    dirX = rotatedX;
    dirZ = rotatedZ;
  }

  const offset = playerBody.radius + target.collidable.radius + 0.35;
  return {
    x: targetPos.x + dirX * offset,
    z: targetPos.z + dirZ * offset,
  };
}

function createComboStrikeArc(from: Vec2, to: Vec2, strikeIndex: number, target: ComboTarget): ComboSegment['arc'] | undefined {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.25) return undefined;
  const petalProgress = spinnerConfig.comboHitCount <= 1
    ? 1
    : strikeIndex / (spinnerConfig.comboHitCount - 1);

  if (countQueuedComboHits(target) > 1) {
    const targetPos = target.getPos();
    let startDirX = from.x - targetPos.x;
    let startDirZ = from.z - targetPos.z;
    let endDirX = to.x - targetPos.x;
    let endDirZ = to.z - targetPos.z;
    const startLen = Math.hypot(startDirX, startDirZ) || 1;
    const endLen = Math.hypot(endDirX, endDirZ) || 1;
    startDirX /= startLen;
    startDirZ /= startLen;
    endDirX /= endLen;
    endDirZ /= endLen;

    let midDirX = startDirX + endDirX;
    let midDirZ = startDirZ + endDirZ;
    let midLen = Math.hypot(midDirX, midDirZ);
    if (midLen < 0.001) {
      midDirX = strikeIndex % 2 === 0 ? -endDirZ : endDirZ;
      midDirZ = strikeIndex % 2 === 0 ? endDirX : -endDirX;
      midLen = Math.hypot(midDirX, midDirZ) || 1;
    }
    midDirX /= midLen;
    midDirZ /= midLen;

    const ringRadius = playerBody.radius + target.collidable.radius + 0.35;
    const controlRadius = ringRadius * (2.4 + petalProgress * 2.2);
    return {
      center: targetPos,
      radius: ringRadius,
      startAngle: 0,
      sweepDir: strikeIndex % 2 === 0 ? 1 : -1,
      control: {
        x: targetPos.x + midDirX * controlRadius,
        z: targetPos.z + midDirZ * controlRadius,
      },
    };
  }

  const invDist = 1 / dist;
  const dirX = dx * invDist;
  const dirZ = dz * invDist;
  const perpX = strikeIndex % 2 === 0 ? -dirZ : dirZ;
  const perpZ = strikeIndex % 2 === 0 ? dirX : -dirX;
  const midpoint = {
    x: (from.x + to.x) * 0.5,
    z: (from.z + to.z) * 0.5,
  };
  const controlOffset = Math.max(2.2, dist * (0.75 + petalProgress * 0.45));

  return {
    center: midpoint,
    radius: dist * 0.5,
    startAngle: Math.atan2(from.z - midpoint.z, from.x - midpoint.x),
    sweepDir: strikeIndex % 2 === 0 ? 1 : -1,
    control: {
      x: midpoint.x + perpX * controlOffset,
      z: midpoint.z + perpZ * controlOffset,
    },
  };
}

function sampleComboSegmentPosition(segment: ComboSegment, t: number): Vec2 {
  if (segment.kind === 'strike' && segment.arc) {
    if (segment.arc.control) {
      const oneMinusT = 1 - t;
      return {
        x: oneMinusT * oneMinusT * segment.from.x
          + 2 * oneMinusT * t * segment.arc.control.x
          + t * t * segment.to.x,
        z: oneMinusT * oneMinusT * segment.from.z
          + 2 * oneMinusT * t * segment.arc.control.z
          + t * t * segment.to.z,
      };
    }
    const angle = segment.arc.startAngle + segment.arc.sweepDir * Math.PI * t;
    return {
      x: segment.arc.center.x + Math.cos(angle) * segment.arc.radius,
      z: segment.arc.center.z + Math.sin(angle) * segment.arc.radius,
    };
  }

  return lerpVec2(segment.from, segment.to, t);
}

function computeComboRpmDamage(hitCount: number): number {
  const rpmFrac = Math.max(0, Math.min(1, playerBody.rpm / playerBody.rpmCapacity));
  return playerBody.rpmCapacity
    * 0.028
    * spinnerConfig.comboDamageMultiplier
    * (0.6 + rpmFrac * 0.5)
    * comboRepeatFalloff(hitCount);
}

function computeComboHpDamage(hitCount: number): number {
  const rpmFrac = Math.max(0, Math.min(1, playerBody.rpm / playerBody.rpmCapacity));
  return playerBody.rpmCapacity
    * 0.02
    * spinnerConfig.comboDamageMultiplier
    * (0.65 + rpmFrac * 0.55)
    * comboRepeatFalloff(hitCount);
}

function applyComboHit(target: ComboTarget): void {
  const hitCount = comboState.hitCounts.get(target.collidable) ?? 0;
  const type = target.id;
  const isHpTarget = type.startsWith('turret')
    || type.startsWith('zombie')
    || type.startsWith('siege-part')
    || type.startsWith('spider-leg')
    || type.startsWith('robot')
    || type.startsWith('hive-core')
    || type.startsWith('slug');
  const damage = isHpTarget ? computeComboHpDamage(hitCount) : computeComboRpmDamage(hitCount);

  comboState.hitCounts.set(target.collidable, hitCount + 1);
  target.applyDamage(damage);

  const hitPos = target.getPos();
  const dirX = hitPos.x - playerBody.pos.x;
  const dirZ = hitPos.z - playerBody.pos.z;
  const len = Math.hypot(dirX, dirZ) || 1;

  emitSparks(
    { x: hitPos.x, y: 0.5, z: hitPos.z },
    { x: dirX / len, y: 0, z: dirZ / len },
    28,
    1.0,
  );
  emitPlasma({ x: hitPos.x, y: 0.55, z: hitPos.z }, 12, 0.55);
}

function beginComboReturn(): void {
  comboState.phase = 'returning';
  comboState.segment = {
    kind: 'return',
    from: cloneVec2(playerBody.pos),
    to: getSafeComboReturnPoint(comboState.originPos, playerBody.pos),
    duration: spinnerConfig.comboReturnDuration / Math.max(spinnerConfig.comboSpeedScale, 0.001),
    elapsed: 0,
  };
}

function beginNextComboStrike(): void {
  const target = resolveComboStrikeTarget();
  if (!target) {
    beginComboReturn();
    return;
  }

  const from = cloneVec2(playerBody.pos);
  const to = computeComboStrikeDestination(from, target);
  comboState.phase = 'active';
  comboState.segment = {
    kind: 'strike',
    from,
    to,
    duration: spinnerConfig.comboStrikeDuration / Math.max(spinnerConfig.comboSpeedScale, 0.001),
    elapsed: 0,
    target,
    arc: createComboStrikeArc(from, to, comboState.strikeIndex, target),
  };
}

function isComboBusy(): boolean {
  return comboState.phase !== 'idle';
}

function shouldSnapComboCamera(): boolean {
  return comboState.phase === 'active' || comboState.phase === 'returning';
}

function getComboMinRpm(): number {
  return spinnerConfig.rpmCapacity * spinnerConfig.comboMinRpmRatio;
}

function canStartPlayerCombo(): boolean {
  return !isComboBusy()
    && comboState.cooldownTimer <= 0
    && playerBody.rpm >= getComboMinRpm()
    && getNearestComboTargets(playerBody.pos).length > 0;
}

function tryStartPlayerCombo(): void {
  if (!consumeSpecialPressed()) return;
  if (!canStartPlayerCombo()) return;

  const nearest = getNearestComboTargets(playerBody.pos);
  const slotTargets: ComboTarget[] = [];
  for (let i = 0; i < spinnerConfig.comboHitCount; i++) {
    slotTargets.push(nearest[i % nearest.length]);
  }

  comboState.phase = 'active';
  comboState.cooldownTimer = spinnerConfig.comboCooldown;
  comboState.recoveryTimer = 0;
  comboState.pauseTimer = 0;
  comboState.strikeIndex = 0;
  comboState.originPos = cloneVec2(playerBody.pos);
  comboState.slotTargets = slotTargets;
  comboState.hitCounts.clear();
  comboState.segment = null;

  playerBody.rpm = Math.max(0, playerBody.rpm - spinnerConfig.rpmCapacity * spinnerConfig.comboCostRatio);
  setPlayerControlLocked(true);
  syncPlayerInvulnerability();
  playerBody.vel.x = 0;
  playerBody.vel.z = 0;

  beginNextComboStrike();
}

function updatePlayerCombo(delta: number): void {
  if (comboState.cooldownTimer > 0) {
    comboState.cooldownTimer = Math.max(0, comboState.cooldownTimer - delta);
  }

  if (comboState.phase === 'idle') return;

  if (comboState.phase === 'recovering') {
    comboState.recoveryTimer = Math.max(0, comboState.recoveryTimer - delta);
    playerBody.vel.x = 0;
    playerBody.vel.z = 0;
    if (comboState.recoveryTimer <= 0) {
      comboState.phase = 'idle';
      comboState.slotTargets = [];
      comboState.segment = null;
      setPlayerControlLocked(false);
      syncPlayerInvulnerability();
    }
    return;
  }

  if (comboState.pauseTimer > 0) {
    comboState.pauseTimer = Math.max(0, comboState.pauseTimer - delta);
    playerBody.vel.x = 0;
    playerBody.vel.z = 0;
    return;
  }

  if (!comboState.segment) {
    if (comboState.strikeIndex >= spinnerConfig.comboHitCount) beginComboReturn();
    else beginNextComboStrike();
  }
  if (!comboState.segment) return;

  const segment = comboState.segment;
  segment.elapsed = Math.min(segment.duration, segment.elapsed + delta);
  const t = segment.duration > 0 ? segment.elapsed / segment.duration : 1;
  const nextPos = sampleComboSegmentPosition(segment, t);
  playerBody.pos.x = nextPos.x;
  playerBody.pos.z = nextPos.z;
  playerBody.vel.x = 0;
  playerBody.vel.z = 0;

  if (segment.elapsed < segment.duration) return;

  if (segment.kind === 'strike') {
    const didHit = Boolean(segment.target?.isValid());
    if (didHit) applyComboHit(segment.target!);
    comboState.strikeIndex += 1;
    comboState.segment = null;
    comboState.pauseTimer = didHit ? spinnerConfig.comboHitPause : 0;
    return;
  }

  comboState.phase = 'recovering';
  comboState.recoveryTimer = spinnerConfig.comboRecovery;
  comboState.segment = null;
  syncPlayerInvulnerability();
}

function getComboHudState(): ComboHudState {
  const cooldownFraction = comboState.cooldownTimer > 0
    ? 1 - comboState.cooldownTimer / spinnerConfig.comboCooldown
    : 1;
  const ready = comboState.cooldownTimer <= 0;
  const blockedByRpm = ready && playerBody.rpm < getComboMinRpm();

  return {
    cooldownFraction: Math.max(0, Math.min(1, cooldownFraction)),
    active: comboState.phase === 'active' || comboState.phase === 'returning',
    ready,
    blockedByRpm,
  };
}

function getRespawnPoint(): Vec2 {
  return cloneVec2(activeCheckpoint?.pos ?? playerSpawnPoint);
}

function beginPlayerRespawnSequence(mode: 'topple' | 'pit'): void {
  if (gameOver || respawnPending) return;

  respawnPending = true;
  respawnInvulnerabilityTimer = 0;
  resetComboState();
  setPlayerControlLocked(true);
  syncPlayerInvulnerability();
  playerBody.vel.x = 0;
  playerBody.vel.z = 0;
  playerWebTimer = 0;
  enemyComboLockTimer = 0;
  playerKillFallTimer = 0;

  if (mode === 'pit') {
    playerBody.rpm = 0;
    startPlayerPitFallDeath();
  } else {
    startPlayerToppleDeath();
  }
}

function completePlayerDeathSequence(): void {
  respawnPending = false;
  gameOver = true;
  gameOverOverlay.style.display = 'flex';
}

function finishPlayerRespawn(): void {
  resetPlayer(getRespawnPoint());
  resetAwakenableEncounterEntitiesForRespawn();
  resetComboState();
  setPlayerControlLocked(false);
  respawnPending = false;
  gameOver = false;
  gameOverOverlay.style.display = 'none';
  respawnInvulnerabilityTimer = RESPAWN_INVULNERABILITY_DURATION;
  playerWebTimer = 0;
  enemyComboLockTimer = 0;
  playerKillFallTimer = 0;
  syncPlayerInvulnerability();
}

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

  const { rpmDamage, hitFlash } = updateProjectiles(
    projectiles,
    playerBody.pos,
    playerBody.radius,
    delta,
    isPlayerInvulnerable(),
  );
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
  playerWebTimer = Math.max(0, playerWebTimer - delta);
  for (const spider of SpiderEntities.getAll()) {
    if (!spider.alive) continue;
    const events = updateSpiderReliquaryAI(spider, playerBody.pos, playerBody.radius, playerWebTimer > 0, delta);
    for (const event of events) {
      emitSparks(
        event.point,
        { x: 0, y: 1, z: 0 },
        event.kind === 'pulse' ? 18 : event.kind === 'leg_slam' ? 30 : 22,
        event.kind === 'pulse' ? 0.7 : event.kind === 'leg_slam' ? 1.0 : 0.85,
      );
      if (!event.hitPlayer || isPlayerInvulnerable()) continue;

      playerBody.rpm = Math.max(0, playerBody.rpm - event.damage);
      notifyPlayerHit();
      if (event.kind === 'leg_slam' && event.knockback) {
        const dx = playerBody.pos.x - spider.collidable.pos.x;
        const dz = playerBody.pos.z - spider.collidable.pos.z;
        const len = Math.hypot(dx, dz) || 1;
        playerBody.vel.x += (dx / len) * event.knockback;
        playerBody.vel.z += (dz / len) * event.knockback;
      } else if (event.kind === 'web') {
        playerWebTimer = Math.max(playerWebTimer, event.webDuration ?? 0.8);
        playerBody.vel.x *= 0.18;
        playerBody.vel.z *= 0.18;
        emitPlasma(event.point, 18, 0.55);
      } else if (event.kind === 'acid') {
        emitGoo(event.point, 14, 0.75);
      }
    }
  }
}

function updateOctobossSystem(delta: number): void {
  for (const boss of OctobossEntities.getAll()) {
    if (!boss.alive) continue;
    updateOctobossAI(boss, playerBody.pos, playerBody.vel, delta);
  }
}

function getOctobossSummonPhase(boss: OctobossState): number {
  const frac = boss.collidable.rpm / boss.config.coreRpmCapacity;
  if (frac > 0.66) return 0;
  if (frac > 0.33) return 1;
  return 2;
}

function countActiveOctobossParasites(bossId: number): number {
  let count = 0;
  for (const enemy of EnemyEntities.getAll()) {
    if (!enemy.alive) continue;
    if (octobossParasiteOwners.get(enemy.id) === bossId) count += 1;
  }
  return count;
}

function countActiveOctobossDrones(bossId: number): number {
  let count = 0;
  for (const robot of RobotEntities.getAll()) {
    if (!robot.alive) continue;
    if (octobossDroneOwners.get(robot.id) === bossId) count += 1;
  }
  return count;
}

function sampleOctobossSummonPoint(
  boss: OctobossState,
  minRadius: number,
  maxRadius: number,
): Vec2 | null {
  const bounds = getArenaBounds();
  for (let attempt = 0; attempt < 18; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    const point = {
      x: boss.collidable.pos.x + Math.cos(angle) * radius,
      z: boss.collidable.pos.z + Math.sin(angle) * radius,
    };
    if (point.x < bounds.minX + 1.5 || point.x > bounds.maxX - 1.5) continue;
    if (point.z < bounds.minZ + 1.5 || point.z > bounds.maxZ - 1.5) continue;
    if (isPointInLava(point)) continue;
    if (distanceSq(point, playerBody.pos) < 10) continue;
    return point;
  }
  return null;
}

function spawnOctobossRetractPickups(boss: OctobossState): void {
  const phase = getOctobossSummonPhase(boss);
  const count = phase >= 2 ? 5 : 4;
  const baseAngle = Math.atan2(playerBody.pos.x - boss.collidable.pos.x, playerBody.pos.z - boss.collidable.pos.z);
  const eyePos = {
    x: boss.collidable.pos.x + Math.sin(boss.facingAngle) * boss.config.coreRadius * 0.82,
    z: boss.collidable.pos.z + Math.cos(boss.facingAngle) * boss.config.coreRadius * 0.82,
  };

  emitPlasma({ x: eyePos.x, y: 2.4, z: eyePos.z }, 8 + count * 2, 0.42);

  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (i - (count - 1) * 0.5) * 0.34 + (Math.random() - 0.5) * 0.22;
    const speed = 4.8 + Math.random() * 2.4 + phase * 0.45;
    ejectPickupAt(pickups, eyePos, {
      x: Math.sin(angle) * speed,
      z: Math.cos(angle) * speed,
    });
  }
}

function spawnOctobossChaseWave(boss: OctobossState): void {
  const phase = getOctobossSummonPhase(boss);
  const targetParasites = OCTOBOSS_PARASITE_CAP[phase];
  const activeParasites = countActiveOctobossParasites(boss.id);
  for (let i = activeParasites; i < targetParasites; i++) {
    const spawnPos = sampleOctobossSummonPoint(boss, 4.4, 8.4);
    if (!spawnPos) break;
    const parasite = EnemyEntities.spawn(spawnPos, OCTOBOSS_PARASITE_TIER);
    octobossParasiteOwners.set(parasite.id, boss.id);
    parasite.collidable.vel.x = (spawnPos.x - boss.collidable.pos.x) * 0.45;
    parasite.collidable.vel.z = (spawnPos.z - boss.collidable.pos.z) * 0.45;
  }

  if (countActiveOctobossDrones(boss.id) > 0) return;
  if (Math.random() >= OCTOBOSS_DRONE_CHANCE[phase]) return;

  const dronePos = sampleOctobossSummonPoint(boss, 5.8, 9.6);
  if (!dronePos) return;

  const drone = RobotEntities.spawn(dronePos, OCTOBOSS_DRONE_TIER);
  octobossDroneOwners.set(drone.id, boss.id);
}

function updateOctobossDrillContacts(delta: number): void {
  if (isPlayerInvulnerable()) return;

  for (const boss of OctobossEntities.getAll()) {
    if (!boss.alive) continue;
    for (const tentacle of boss.tentacles) {
      const tip = tentacle.collidable;
      const dx = playerBody.pos.x - tip.pos.x;
      const dz = playerBody.pos.z - tip.pos.z;
      const radius = playerBody.radius + tip.radius;
      const distSq = dx * dx + dz * dz;
      if (distSq >= radius * radius) continue;

      const dist = Math.sqrt(distSq) || 0.0001;
      const nx = dx / dist;
      const nz = dz / dist;
      const contactPoint = {
        x: playerBody.pos.x - nx * playerBody.radius * 0.45,
        y: 0.52,
        z: playerBody.pos.z - nz * playerBody.radius * 0.45,
      };

      playerBody.vel.x *= 0.78;
      playerBody.vel.z *= 0.78;
      playerBody.vel.x -= nx * 8.5 * delta;
      playerBody.vel.z -= nz * 8.5 * delta;
      playerBody.vel.x += -nz * tentacle.side * 2.8 * delta;
      playerBody.vel.z += nx * tentacle.side * 2.8 * delta;

      emitSparks(contactPoint, { x: -nx, y: 0, z: -nz }, 10, 0.85);
      emitPlasma(contactPoint, 4, 0.18);

      if (tentacle.hitCooldown > 0) continue;

      playerBody.rpm = Math.max(0, playerBody.rpm - getOctobossTipDamage(boss) * 0.32);
      notifyPlayerHit();
      tentacle.hitCooldown = 0.1;
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

function sampleSpiderMotionDebug(delta: number): void {
  if (!SPIDER_MOTION_DEBUG || delta <= 0) return;

  const spider = SpiderEntities.getAll().find((entry) => entry.alive);
  if (!spider) {
    spiderMotionDebug.hasPrevScreenPos = false;
    return;
  }

  const worldDx = spider.collidable.pos.x - spiderMotionDebug.prevWorldX;
  const worldDz = spider.collidable.pos.z - spiderMotionDebug.prevWorldZ;
  const absMoveX = Math.abs(worldDx) / delta;
  const absMoveZ = Math.abs(worldDz) / delta;
  let bucket: MotionBucket | null = null;
  if (absMoveX > absMoveZ * 1.35) bucket = 'move_x';
  else if (absMoveZ > absMoveX * 1.35) bucket = 'move_z';

  const dxToPlayer = playerBody.pos.x - spider.collidable.pos.x;
  const dzToPlayer = playerBody.pos.z - spider.collidable.pos.z;
  const distToPlayer = Math.hypot(dxToPlayer, dzToPlayer);
  const aliveLegs = spider.legs.filter((entry) => entry.alive).length;
  const phase = aliveLegs >= 4 ? 0 : aliveLegs >= 2 ? 1 : 2;
  const desiredRange = phase === 0 ? 7.2 : phase === 1 ? 6.2 : 5.0;

  let state: SpiderMotionState = 'orbit';
  if (spider.oneLegHopAir > 0) state = 'hop_air';
  else if (spider.oneLegHopWindup > 0) state = 'hop_windup';
  else if (spider.oneLegHopRecover > 0) state = 'hop_recover';
  else if (spider.collapseTimer > 0) state = 'collapse';
  else if (distToPlayer > desiredRange) state = 'chase';

  const projected = new THREE.Vector3(spider.collidable.pos.x, 0, spider.collidable.pos.z).project(camera);
  const viewport = renderer.getSize(new THREE.Vector2());
  const screenX = (projected.x * 0.5 + 0.5) * viewport.x;
  const screenY = (-projected.y * 0.5 + 0.5) * viewport.y;

  if (bucket && spiderMotionDebug.hasPrevScreenPos) {
    const screenDx = screenX - spiderMotionDebug.prevScreenX;
    const screenDy = screenY - spiderMotionDebug.prevScreenY;
    const stats = spiderMotionDebugBuckets[`${state}:${bucket}`];
    stats.samples += 1;
    stats.worldSpeed += Math.hypot(worldDx, worldDz) / delta;
    stats.screenSpeed += Math.hypot(screenDx, screenDy) / delta;
    stats.absMoveX += absMoveX;
    stats.absMoveZ += absMoveZ;
  }

  spiderMotionDebug.prevScreenX = screenX;
  spiderMotionDebug.prevScreenY = screenY;
  spiderMotionDebug.prevWorldX = spider.collidable.pos.x;
  spiderMotionDebug.prevWorldZ = spider.collidable.pos.z;
  spiderMotionDebug.hasPrevScreenPos = true;
  spiderMotionDebug.sampleTimer += delta;

  if (spiderMotionDebug.sampleTimer < 1.0) return;

  const labels = Object.keys(spiderMotionDebugBuckets) as Array<keyof typeof spiderMotionDebugBuckets>;
  const parts: string[] = [];
  for (const label of labels) {
    const stats = spiderMotionDebugBuckets[label];
    if (stats.samples === 0) continue;
    parts.push(
      `${label}: n=${stats.samples}, world=${(stats.worldSpeed / stats.samples).toFixed(2)}, `
      + `|dx|=${(stats.absMoveX / stats.samples).toFixed(2)}, |dz|=${(stats.absMoveZ / stats.samples).toFixed(2)}, `
      + `screen=${(stats.screenSpeed / stats.samples).toFixed(1)}px/s`,
    );
  }
  console.log(`[spider-motion] ${parts.length > 0 ? parts.join(' | ') : 'no directional samples'}`);
  spiderMotionDebug.sampleTimer = 0;
  for (const label of labels) {
    const stats = spiderMotionDebugBuckets[label];
    stats.samples = 0;
    stats.worldSpeed = 0;
    stats.screenSpeed = 0;
    stats.absMoveX = 0;
    stats.absMoveZ = 0;
  }
}

function applyPlayerCollisionCameraShake(circleHits: CircleHit[]): void {
  for (const hit of circleHits) {
    const playerIsA = hit.i === 0;
    const playerIsB = hit.j === 0;
    if (!playerIsA && !playerIsB) continue;

    const intensity = Math.min(0.8, Math.max(0, hit.impactForce - 0.35) * 0.2);
    if (intensity > 0) triggerCameraShake(intensity);
  }
}

function applyPlayerClashFlashes(circleHits: CircleHit[]): void {
  for (const hit of circleHits) {
    const playerIsA = hit.i === 0;
    const playerIsB = hit.j === 0;
    if (!playerIsA && !playerIsB) continue;

    const other = collidables[playerIsA ? hit.j : hit.i];
    const otherType = getCollidableType(other);
    if (!otherType || otherType === 'zombie') continue;

    const intensity = Math.min(1, Math.max(0, hit.impactForce - 0.4) * 0.24);
    if (intensity <= 0) continue;

    const { point } = computeContactInfo(playerBody, other);
    emitClashFlash(point, intensity);
  }
}

// ─── Enemy Death Check ───────────────────────────────────────────────────────

function checkEnemyDeath(): void {
  for (const enemy of [...EnemyEntities.getAll()]) {
    if (isEnemyDead(enemy)) {
      const deathPos = { x: enemy.collidable.pos.x, z: enemy.collidable.pos.z };
      octobossParasiteOwners.delete(enemy.id);
      unregisterEncounterMember(enemy.id);
      EnemyEntities.destroy(enemy);
      explosions.push(createExplosion(deathPos));
      spawnPickupAt(pickups, deathPos);
      spawnGrowthPickupAt(pickups, { x: deathPos.x + 0.75, z: deathPos.z });
    }
  }
}

// ─── Boss Death Check ────────────────────────────────────────────────────────

function checkBossDeath(): void {
  for (const boss of [...DreadnoughtEntities.getAll()]) {
    if (isDreadnoughtDead(boss)) {
      const deathPos = { x: boss.collidable.pos.x, z: boss.collidable.pos.z };
      unregisterEncounterMember(boss.id);
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
  unregisterEncounterMember(zombie.id);
  ZombieEntities.destroy(zombie);

  if (gib) {
    emitBlood({ x: deathPos.x, y: 0.95, z: deathPos.z }, 72, 1.0);
    spawnBloodSplat(deathPos, 22, time);
    // spawnBloodSplat({ x: deathPos.x + 0.7, z: deathPos.z + 0.25 }, 120, time + 0.08);
    // spawnBloodSplat({ x: deathPos.x - 0.6, z: deathPos.z - 0.3 }, 60, time + 0.16);
    spawnZombieGibs(deathPos, 16);
  } else {
    emitBlood({ x: deathPos.x, y: 0.75, z: deathPos.z }, 26, 0.82);
    spawnBloodSplat(deathPos, 18, time);
  }

  spawnPickupAt(pickups, deathPos);
}

function updateZombieSystem(delta: number): void {
  for (const zombie of ZombieEntities.getAll()) {
    const attacked = updateZombieAI(zombie, playerBody.pos, delta);
    if (!attacked || isPlayerInvulnerable()) continue;

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
      octobossDroneOwners.delete(robot.id);
      unregisterEncounterMember(robot.id);
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
      unregisterEncounterMember(siege.id);
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
    unregisterEncounterMember(spider.id);
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

function checkOctobossDeath(): void {
  for (const boss of [...OctobossEntities.getAll()]) {
    if (!isOctobossDead(boss)) continue;
    const deathPos = { x: boss.collidable.pos.x, z: boss.collidable.pos.z };
    for (const [enemyId, ownerId] of octobossParasiteOwners) {
      if (ownerId === boss.id) octobossParasiteOwners.delete(enemyId);
    }
    for (const [robotId, ownerId] of octobossDroneOwners) {
      if (ownerId === boss.id) octobossDroneOwners.delete(robotId);
    }
    unregisterEncounterMember(boss.id);
    OctobossEntities.destroy(boss);
    explosions.push(createExplosion(deathPos));
    explosions.push(createExplosion({ x: deathPos.x + 1.1, z: deathPos.z + 0.9 }));
    explosions.push(createExplosion({ x: deathPos.x - 1.0, z: deathPos.z - 0.85 }));
    explosions.push(createExplosion({ x: deathPos.x + 0.35, z: deathPos.z - 1.35 }));
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
      unregisterEncounterMember(slug.id);
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
      unregisterEncounterMember(slug.id);
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
      unregisterEncounterMember(hive.id);
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

resetGame();
setMenuVisible(!DEBUG_SKIP_MAIN_MENU);
if (shouldAutostart) {
  void startSelectedLevel();
}

const timer = new THREE.Timer();

// ─── Game Loop ───────────────────────────────────────────────────────────────

function animate(): void {
  requestAnimationFrame(animate);
  timer.update();
  const delta = Math.min(timer.getDelta(), 0.05);
  time += delta;
  if (consumeProfilerTogglePressed()) profiler?.toggleOverlay();
  if (consumeSpectorCapturePressed() && spectorCaptureControllerPromise) {
    void spectorCaptureControllerPromise.then((controller) => controller?.captureFrame());
  }
  profiler?.startFrame(delta * 1000, getProfilerFrameMode());

  if (respawnInvulnerabilityTimer > 0) {
    respawnInvulnerabilityTimer = Math.max(0, respawnInvulnerabilityTimer - delta);
    syncPlayerInvulnerability();
  }

  if (menuVisible) {
    profiler?.nextPhase('visuals');
    for (const obs of ObstacleEntities.getAll()) syncObstacle(obs);
    for (const door of SlidingDoorEntities.getAll()) updateSlidingDoor(door, delta);
    updateCheckpointVisuals(time);
    updatePlayerVisuals(time, 0);
    updateCamera(playerBody.pos, playerBody.vel, delta, false);
    updateClashFlashes(delta);
    updateTopDownCulling(camera, SCENE_CULL_PADDING);
    profiler?.nextPhase('render');
    renderer.render(scene, camera);
    finishProfilerFrame();
    return;
  }

  if (gameOver) {
    profiler?.nextPhase('visuals');
    updateFallingVictims(delta);
    updateGibs(delta);
    for (const door of SlidingDoorEntities.getAll()) updateSlidingDoor(door, delta);
    updateCheckpointVisuals(time);
    const done = updateTopple(delta);
    if (done) gameOverOverlay.style.display = 'flex';
    updateHud(playerBody.rpm, time, delta, getComboHudState());
    updateCamera(playerBody.pos, playerBody.vel, delta, shouldSnapComboCamera());
    updateClashFlashes(delta);
    updateTopDownCulling(camera, SCENE_CULL_PADDING);
    profiler?.nextPhase('render');
    renderer.render(scene, camera);
    finishProfilerFrame();
    return;
  }

  if (respawnPending) {
    profiler?.nextPhase('visuals');
    updateFallingVictims(delta);
    updateGibs(delta);
    for (const door of SlidingDoorEntities.getAll()) updateSlidingDoor(door, delta);
    updateCheckpointVisuals(time);
    const done = updateTopple(delta);
    if (done) completePlayerDeathSequence();
    updateHud(playerBody.rpm, time, delta, getComboHudState());
    updateCamera(playerBody.pos, playerBody.vel, delta, false);
    updateClashFlashes(delta);
    updateTopDownCulling(camera, SCENE_CULL_PADDING);
    profiler?.nextPhase('render');
    renderer.render(scene, camera);
    finishProfilerFrame();
    return;
  }

  // 1. Entity updates (intent — player input, enemy AI, boss AI, turret aim)
  profiler?.nextPhase('entityUpdate');
  if (enemyComboLockTimer > 0) {
    enemyComboLockTimer = Math.max(0, enemyComboLockTimer - delta);
    if (enemyComboLockTimer <= 0 && !isPlayerInvulnerable()) {
      setPlayerControlLocked(false);
    }
  }
  updateAwakenableEncounterEntities();
  tryStartPlayerCombo();
  entityUpdateSystem(delta);
  const playerSpeed = Math.hypot(playerBody.vel.x, playerBody.vel.z);
  for (const e of EnemyEntities.getAll()) updateEnemyAI(e, playerBody.pos, playerBody.radius, playerSpeed, delta);
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
  updateOctobossSystem(delta);
  if (playerWebTimer > 0) {
    playerBody.vel.x *= PLAYER_WEB_VEL_DAMP;
    playerBody.vel.z *= PLAYER_WEB_VEL_DAMP;
    setMovementMaxSpeed(playerId, spinnerConfig.maxSpeed * PLAYER_WEB_SPEED_MULT);
  }
  updatePlayerCombo(delta);

  // 2. Movement (friction, clamp, position for all registered movables)
  profiler?.nextPhase('movement');
  movementSystem(delta);

  // 2b. Sync siege engine sub-parts to core position (before collision)
  profiler?.nextPhase('sync');
  for (const s of SiegeEntities.getAll()) syncSiegeEngineParts(s);
  for (const spider of SpiderEntities.getAll()) syncSpiderReliquaryLegs(spider, delta);
  for (const boss of OctobossEntities.getAll()) syncOctobossTentacles(boss, delta);
  for (const h of HiveEntities.getAll()) syncFlockPositions(h);
  updateSpiderCorePassThroughHits();

  // 2c. Kill-fall trigger zones
  updateKillFallZones(delta);
  updateFallingVictims(delta);
  if (gameOver || respawnPending) {
    const done = updateTopple(delta);
    updateGibs(delta);
    updateCheckpointVisuals(time);
    if (done) {
      if (respawnPending) completePlayerDeathSequence();
      else gameOverOverlay.style.display = 'flex';
    }
    updateHud(playerBody.rpm, time, delta, getComboHudState());
    updateCamera(playerBody.pos, playerBody.vel, delta, respawnPending ? false : shouldSnapComboCamera());
    updateClashFlashes(delta);
    updateTopDownCulling(camera, SCENE_CULL_PADDING);
    profiler?.nextPhase('render');
    renderer.render(scene, camera);
    finishProfilerFrame();
    return;
  }

  // 3. Collision resolution
  profiler?.nextPhase('collision');
  const { wallHits, circleHits } = runCollisions();
  applyPlayerCollisionCameraShake(circleHits);
  applyPlayerClashFlashes(circleHits);

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
  profiler?.nextPhase('collisionDispatch');
  collisionSystem(circleHits);
  updateOctobossDrillContacts(delta);

  // 5. Proximity pair dispatch (pickup collection)
  profiler?.nextPhase('proximity');
  proximitySystem();

  // 5b. Level trigger spawns
  updateTriggerSpawns();
  updateCheckpointActivation();

  // 6. RPM system (base decay) + player-specific hooks
  profiler?.nextPhase('rpm');
  rpmSystem(delta);
  playerRpmHooks(delta, hasPlayerWallHit(wallHits), circleHits);

  // 7. Death checks
  profiler?.nextPhase('deathChecks');
  checkEnemyDeath();
  checkBossDeath();
  checkSiegeDeath();
  checkSpiderDeath();
  checkOctobossDeath();
  checkRobotDeath();
  checkZombieDeath();
  checkHiveDeath();
  checkSlugDeath();

  if (playerBody.rpm <= 0) {
    beginPlayerRespawnSequence('topple');
    profiler?.nextPhase('visuals');
    updateHud(0, time, delta, getComboHudState());
    updateCamera(playerBody.pos, playerBody.vel, delta, shouldSnapComboCamera());
    updateClashFlashes(delta);
    updateTopDownCulling(camera, SCENE_CULL_PADDING);
    profiler?.nextPhase('render');
    renderer.render(scene, camera);
    finishProfilerFrame();
    return;
  }

  // 8. Visuals + render
  profiler?.nextPhase('visuals');
  for (const obs of ObstacleEntities.getAll()) syncObstacle(obs);
  updatePickups(pickups, time, delta);
  updatePlayerVisuals(time, delta);
  for (const e of EnemyEntities.getAll()) updateEnemyVisuals(e, time, delta);
  for (const z of ZombieEntities.getAll()) updateZombieVisuals(z, playerBody.pos, delta, time);
  for (const b of DreadnoughtEntities.getAll()) updateDreadnoughtVisuals(b, time, delta);
  for (const s of SiegeEntities.getAll()) updateSiegeEngineVisuals(s, time, delta);
  for (const spider of SpiderEntities.getAll()) updateSpiderReliquaryVisuals(spider, time, delta);
  for (const boss of OctobossEntities.getAll()) updateOctobossVisuals(boss, time, delta);
  for (const r of RobotEntities.getAll()) updateRobotVisuals(r, playerBody.pos, time, delta);
  for (const h of HiveEntities.getAll()) updateHiveVisuals(h, playerBody.pos, time, delta);
  for (const s of BigSlugEntities.getAll()) updateSlugwormVisuals(s, time, delta);
  for (const s of BabySlugEntities.getAll()) updateSlugwormVisuals(s, time, delta);
  for (const door of SlidingDoorEntities.getAll()) updateSlidingDoor(door, delta);
  updateCheckpointVisuals(time);
  updateHud(playerBody.rpm, time, delta, getComboHudState());
  updateCamera(playerBody.pos, playerBody.vel, delta, shouldSnapComboCamera());
  sampleSpiderMotionDebug(delta);
  profiler?.nextPhase('effects');
  updateClashFlashes(delta);
  updateSparks(time);
  updateGooDecals(time, {
    pos: playerBody.pos,
    vel: playerBody.vel,
    radius: playerBody.radius,
  });
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
  updateTopDownCulling(camera, SCENE_CULL_PADDING);
  profiler?.nextPhase('render');
  renderer.render(scene, camera);
  finishProfilerFrame();
}

animate();
