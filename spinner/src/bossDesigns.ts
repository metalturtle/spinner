/**
 * Boss Fight Designs
 *
 * Each boss leverages the core mechanics: RPM = health + power, mass ratios
 * in collisions, arena space, and speed = damage. Bosses are multi-phase
 * spinner fights that require different strategies than regular enemies.
 */

import type { Vec2 } from './physics';

// ─── Shared Boss Types ───────────────────────────────────────────────────────

export type BossPhase = 'phase1' | 'phase2' | 'phase3';

export interface BossPhaseThreshold {
  phase:     BossPhase;
  rpmRatio:  number;   // triggers when rpm/rpmCapacity drops below this
}

export interface BossDesign {
  name:        string;
  description: string;
  phases:      BossPhaseThreshold[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. THE DREADNOUGHT — Mass tank with a directional weak point
// ═══════════════════════════════════════════════════════════════════════════════
//
// Core mechanic: Extremely high mass and RPM. Frontal collisions are suicide
// for the player — the mass ratio crushes you. But the boss has an exposed
// vent on its back. Hitting from behind (>120° from facing direction) deals
// massive damage and reduced knockback to the player.
//
// As it loses RPM it gets FASTER and more aggressive (desperation).
//
// Phase 1 (100%–50% RPM):
//   - Steady chase AI, moderate speed
//   - Periodic charge attacks (telegraphed wind-up, then a fast lunge)
//   - Player learns to dodge charges and punish the back
//
// Phase 2 (50%–25% RPM):
//   - Faster movement, shorter charge cooldown
//   - Spawns 2 temporary floor drain zones that punish standing still
//   - Starts doing sweep attacks (wide arc turns to protect its back)
//
// Phase 3 (25%–0% RPM):
//   - Berserk — very fast, nearly constant charging
//   - More floor drain zones, larger coverage
//   - Visual: glowing red, erratic wobble, sparks
//   - Weak point grows slightly larger (mercy mechanic)

export const DREADNOUGHT_DESIGN: BossDesign = {
  name: 'The Dreadnought',
  description: 'Massive armored spinner. Invulnerable from the front — attack the exposed vent on its back.',
  phases: [
    { phase: 'phase1', rpmRatio: 1.0  },
    { phase: 'phase2', rpmRatio: 0.5  },
    { phase: 'phase3', rpmRatio: 0.25 },
  ],
};

export interface DreadnoughtConfig {
  // RPM / Physics
  rpmCapacity:     number;
  rpmDecayRate:    number;
  radius:          number;
  mass:            number;
  heatFactor:      number;

  // Movement (per phase)
  maxSpeed:        [number, number, number];   // [phase1, phase2, phase3]
  acceleration:    [number, number, number];
  friction:        number;
  spinSpeed:       number;

  // Charge attack
  chargeWindUp:    number;   // seconds of telegraph before charge
  chargeSpeed:     number;   // speed during charge lunge
  chargeDuration:  number;   // seconds the charge lasts
  chargeCooldown:  [number, number, number];   // per-phase cooldown
  chargeRecovery:  number;   // stun window after charge misses

  // Weak point
  weakAngle:       number;   // half-angle of rear vulnerability cone (radians)
  weakDamageMult:  number;   // damage multiplier when hit from behind
  frontDamageMult: number;   // damage multiplier to player when hitting front (pain)

  // Phase 2+ abilities
  drainZoneCount:  [number, number, number];   // floor zones spawned per phase
  drainZoneRadius: number;
  drainZoneRate:   number;   // RPM drained per second in zone

  // Visual
  color:           number;
  berserkColor:    number;
}

export const DREADNOUGHT_TIER_1: DreadnoughtConfig = {
  rpmCapacity:     500,
  rpmDecayRate:    0.0,
  radius:          1.2,
  mass:            5.0,
  heatFactor:      1.5,

  maxSpeed:        [8, 12, 18],
  acceleration:    [14, 20, 30],
  friction:        0.97,
  spinSpeed:       8,

  chargeWindUp:    0.8,
  chargeSpeed:     25,
  chargeDuration:  0.6,
  chargeCooldown:  [4.0, 2.5, 1.2],
  chargeRecovery:  1.2,

  weakAngle:       Math.PI / 3,       // 60° half-cone = 120° total rear arc
  weakDamageMult:  4.0,               // 4× damage when attacking the back
  frontDamageMult: 3.0,               // 3× damage TO PLAYER when hitting front

  drainZoneCount:  [0, 2, 4],
  drainZoneRadius: 3.0,
  drainZoneRate:   8.0,

  color:           0x882222,
  berserkColor:    0xff2200,
};


// ═══════════════════════════════════════════════════════════════════════════════
// 2. THE ORBITAL — Satellite ring protects a vulnerable core
// ═══════════════════════════════════════════════════════════════════════════════
//
// Core mechanic: Slow central body surrounded by 4–6 fast-orbiting drone
// spinners. Drones orbit at a fixed radius and block approach. Must either
// destroy drones to open lanes, or time dashes through gaps.
//
// Destroying a drone speeds up the remaining ones (angular velocity increases).
// Core only takes full damage when fewer than 2 drones remain.
//
// Phase 1 (100%–60% RPM): 6 drones, slow orbit, core barely moves
// Phase 2 (60%–30% RPM):  Remaining drones orbit faster, core starts chasing
// Phase 3 (30%–0% RPM):   Core goes aggressive, spawns 2 new mini-drones

export interface OrbitalConfig {
  rpmCapacity:      number;
  radius:           number;
  mass:             number;
  coreMaxSpeed:     [number, number, number];
  droneCount:       number;
  droneRpmCapacity: number;
  droneRadius:      number;
  droneMass:        number;
  orbitRadius:      number;
  orbitSpeed:       [number, number, number];    // rad/s per phase
  shieldRatio:      number;   // damage reduction while >2 drones alive (0–1)
  color:            number;
}

export const ORBITAL_TIER_1: OrbitalConfig = {
  rpmCapacity:      400,
  radius:           1.0,
  mass:             4.0,
  coreMaxSpeed:     [3, 8, 14],
  droneCount:       6,
  droneRpmCapacity: 60,
  droneRadius:      0.35,
  droneMass:        0.6,
  orbitRadius:      3.5,
  orbitSpeed:       [1.5, 2.5, 4.0],
  shieldRatio:      0.8,
  color:            0x6633aa,
};


// ═══════════════════════════════════════════════════════════════════════════════
// 3. THE MAGNETAR — Push/pull arena control
// ═══════════════════════════════════════════════════════════════════════════════
//
// Core mechanic: Alternates between PULL and PUSH phases on a timer.
// Pull: applies radial force toward itself (deadly if caught at low RPM).
// Push: blasts everything outward (can slam player into walls).
// Transition window (~0.5s): brief vulnerability where neither force applies.
//
// The player can exploit push phase: let the push accelerate you, then
// redirect into the boss during the transition for a high-speed impact.
//
// Has an energy shield that only breaks from high-impact collisions
// (impactForce > threshold). Light taps do nothing.
//
// Phase 1: Slow cycle (4s pull, 4s push), moderate force
// Phase 2: Faster cycle (2.5s each), stronger force, drops floor hazards
// Phase 3: Erratic timing, sometimes double-pulses

export interface MagnetarConfig {
  rpmCapacity:       number;
  radius:            number;
  mass:              number;
  maxSpeed:          number;
  pullForce:         [number, number, number];
  pushForce:         [number, number, number];
  cycleDuration:     [number, number, number];  // seconds per pull/push half-cycle
  transitionWindow:  number;                     // vulnerability window in seconds
  shieldThreshold:   number;                     // minimum impactForce to deal damage
  color:             number;
}

export const MAGNETAR_TIER_1: MagnetarConfig = {
  rpmCapacity:       350,
  radius:            0.9,
  mass:              3.5,
  maxSpeed:          6,
  pullForce:         [12, 18, 25],
  pushForce:         [15, 22, 30],
  cycleDuration:     [4.0, 2.5, 1.5],
  transitionWindow:  0.5,
  shieldThreshold:   8.0,
  color:             0x2266ff,
};


// ═══════════════════════════════════════════════════════════════════════════════
// 4. THE ARENA SHAPER — Battlefield manipulation
// ═══════════════════════════════════════════════════════════════════════════════
//
// Core mechanic: Doesn't move much. Instead, progressively walls off the arena
// with moving barriers, shrinking the player's maneuvering room. Spawns
// temporary floor drain zones. The less space you have, the harder it is to
// build up collision speed.
//
// The boss IS the arena — hitting the barriers damages the boss but also costs
// player RPM. Destroying a barrier opens space temporarily before a new one
// spawns.
//
// Phase 1: 2 barriers, 1 drain zone, boss mostly stationary
// Phase 2: 4 barriers, barriers start moving, 2 drain zones
// Phase 3: 6 barriers, fast-moving, floor is mostly drain zones
//
// Win by destroying barriers (which damages the boss) or by reaching the
// core in the shrinking arena.

export interface ArenaShaperConfig {
  rpmCapacity:        number;
  radius:             number;
  mass:               number;
  maxSpeed:           number;
  barrierCount:       [number, number, number];
  barrierHp:          number;
  barrierSpeed:       [number, number, number];  // movement speed of barriers
  drainZoneCount:     [number, number, number];
  drainZoneRate:      number;
  coreDamagePerBarrier: number;  // RPM damage to boss when a barrier is destroyed
  color:              number;
}

export const ARENA_SHAPER_TIER_1: ArenaShaperConfig = {
  rpmCapacity:        400,
  radius:             1.0,
  mass:               6.0,
  maxSpeed:           4,
  barrierCount:       [2, 4, 6],
  barrierHp:          8,
  barrierSpeed:       [0, 3, 6],
  drainZoneCount:     [1, 2, 4],
  drainZoneRate:      6.0,
  coreDamagePerBarrier: 40,
  color:              0x886644,
};


// ═══════════════════════════════════════════════════════════════════════════════
// 5. THE TWINS — Coordinated pair with shared RPM pool
// ═══════════════════════════════════════════════════════════════════════════════
//
// Core mechanic: Two enemy spinners that share one RPM pool. Damage to either
// drains the pool. They coordinate: one chases aggressively while the other
// flanks or cuts off escape. When separated by distance, the chaser gets a
// speed boost.
//
// If you focus one, the other punishes you. Need to kite them into each other
// or use arena geometry to separate them.
//
// Phase 1: Loose coordination, moderate speed
// Phase 2: Tighter coordination, one starts doing charge attacks
// Phase 3: Both go berserk, RPM transfer on hit (hitting one heals the other slightly)

export interface TwinsConfig {
  sharedRpmCapacity:  number;
  radius:             number;
  mass:               number;
  maxSpeed:           [number, number, number];
  acceleration:       [number, number, number];
  friction:           number;
  separationBoost:    number;  // speed multiplier when twins are far apart
  separationDist:     number;  // distance threshold for boost
  rpmTransferRatio:   number;  // phase 3: fraction of damage that heals the other twin
  heatFactor:         number;
  color1:             number;
  color2:             number;
}

export const TWINS_TIER_1: TwinsConfig = {
  sharedRpmCapacity:  350,
  radius:             0.6,
  mass:               1.5,
  maxSpeed:           [10, 14, 18],
  acceleration:       [16, 22, 30],
  friction:           0.97,
  separationBoost:    1.4,
  separationDist:     12,
  rpmTransferRatio:   0.3,
  heatFactor:         1.2,
  color1:             0xcc4444,
  color2:             0x44cccc,
};


// ═══════════════════════════════════════════════════════════════════════════════
// 6. THE MIMIC — Mirror fight
// ═══════════════════════════════════════════════════════════════════════════════
//
// Core mechanic: Copies the player's movement with a short delay (~0.5s).
// Has identical physics stats. Your own patterns are used against you.
//
// Gets erratic as RPM drops. Phase 2 spawns 2 weaker echoes.
// Phase 3: the original stops mirroring and goes fully aggressive.
//
// Countered by unpredictable movement and sudden direction changes — the
// delay means you can bait it into walls or obstacles.

export interface MimicConfig {
  rpmCapacity:     number;
  mimicDelay:      number;    // seconds of movement history replay
  radius:          number;
  mass:            number;
  maxSpeed:        number;
  acceleration:    number;
  friction:        number;
  echoCount:       number;    // phase 2 echo spawns
  echoRpmRatio:    number;    // echo RPM as fraction of main
  heatFactor:      number;
  color:           number;
}

export const MIMIC_TIER_1: MimicConfig = {
  rpmCapacity:     200,
  mimicDelay:      0.5,
  radius:          0.5,
  mass:            1.0,
  maxSpeed:        15,
  acceleration:    25,
  friction:        0.97,
  echoCount:       2,
  echoRpmRatio:    0.4,
  heatFactor:      1.0,
  color:           0x888888,
};


// ═══════════════════════════════════════════════════════════════════════════════
// 7. THE SIEGE ENGINE — Multi-part destructible boss
// ═══════════════════════════════════════════════════════════════════════════════
//
// Core mechanic: Multiple collidable components that must be destroyed in
// order. A shield generator makes the core immune. A turret array provides
// ranged fire. Destroying parts changes movement/attack behavior.
//
// Destroy shield → core exposed. Destroy turrets → no more projectiles.
// Destroying legs → slower movement. Each part has its own HP bar.
//
// Parts are separate collidables attached to the boss body (offset positions
// that follow the boss). Uses the existing turret + obstacle systems.
//
// Phase 1: All parts intact, slow movement, turret array fires
// Phase 2: Shield down, core exposed, boss speeds up to compensate
// Phase 3: Most parts destroyed, core goes full aggressive

export interface SiegeEngineConfig {
  coreRpmCapacity: number;
  coreRadius:      number;
  coreMass:        number;
  coreMaxSpeed:    [number, number, number];

  shieldHp:        number;
  shieldRadius:    number;

  turretCount:     number;
  turretHp:        number;
  turretFireRate:   number;
  turretProjSpeed: number;
  turretProjDamage: number;

  legCount:        number;
  legHp:           number;
  speedPerLeg:     number;  // speed reduction when a leg is destroyed

  heatFactor:      number;
  color:           number;
}

export const SIEGE_ENGINE_TIER_1: SiegeEngineConfig = {
  coreRpmCapacity: 500,
  coreRadius:      1.0,
  coreMass:        4.0,
  coreMaxSpeed:    [6, 10, 16],

  shieldHp:        15,
  shieldRadius:    2.0,

  turretCount:     2,
  turretHp:        8,
  turretFireRate:   1.5,
  turretProjSpeed: 12,
  turretProjDamage: 10,

  legCount:        4,
  legHp:           6,
  speedPerLeg:     2,

  heatFactor:      1.0,
  color:           0x556677,
};
