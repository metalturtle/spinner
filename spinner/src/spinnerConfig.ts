// ─── Spinner Config ──────────────────────────────────────────────────────────
//
// All properties that belong to *this specific spinner* and can be upgraded
// at runtime. Game code reads from this object every frame — an upgrade is
// just a mutation of one or more fields (sync playerBody fields too if needed).
//
// RPM economy values derived from rpmCapacity live in constants.ts as ratios:
//   soft cap     = rpmCapacity × RPM_SOFT_CAP_RATIO   (0.70)
//   hyper ceiling = rpmCapacity × RPM_HYPER_RATIO      (1.30)
//   pickup pivot  = rpmCapacity × RPM_HALF_POINT_RATIO (1.00)
//
// World rules (RESTITUTION, WALL_RPM_PENALTY, etc.) live in constants.ts.

export interface SpinnerConfig {
  // RPM economy — master stat
  rpmCapacity:   number;   // THE upgradeable power level; all RPM thresholds derive from this
  startingRpmRatio: number; // fresh-run starting fill as a fraction of capacity
  maxRpmCapacity: number;   // hard cap for current-run growth

  // RPM economy — independently upgradeable drain rates
  rpmDecayRate:  number;   // natural drain per second
  rpmSpeedDrain: number;   // extra drain per unit speed per second

  // Collision
  radius:        number;   // hitbox radius
  mass:          number;   // collision weight (heavier = hits harder)

  // Movement
  maxSpeed:      number;   // velocity cap (units/s)
  acceleration:  number;   // force per WASD key (units/s²)
  friction:      number;   // velocity multiplier per frame (drag)

  // Visual
  spinSpeed:     number;   // max spin rate at full RPM (rad/s)

  // Sprint (Shift key)
  sprintSpeedMult: number;   // max speed multiplier while sprinting
  sprintAccelMult: number;   // acceleration multiplier while sprinting
  sprintRpmDrain:  number;   // extra RPM drained per second while sprinting

  // Run growth
  growthPickupCapacityGain: number; // permanent capacity gain for the current run
  growthPickupRpmGain: number;      // immediate RPM bonus when collecting a growth pickup

  // Spinner duel tuning
  duelImpactCap: number;          // maximum impact contribution in spinner-vs-spinner clashes
  duelSpeedReference: number;     // speed at which a spinner is considered fully committed to a clash
  duelSharedDamageScale: number;  // low baseline scrape damage both sides take on contact
  duelVelocityDamageScale: number; // main damage scale from committed collision speed
  duelRpmInfluenceScale: number;  // small RPM/stability modifier layered on top of velocity

  // Combo attack (X key)
  comboMinRpmRatio:     number;               // minimum rpm/capacity needed to cast
  comboCostRatio:       number;               // upfront RPM spend on cast
  comboCooldown:        number;               // seconds before combo can be used again
  comboRecovery:        number;               // seconds of end-lag after returning
  comboHitCount:        number;               // number of chained strikes
  comboDamageMultiplier:number;               // bonus applied to combo damage
  comboRepeatFalloff:   [number, number, number]; // repeated hits on same target get weaker
  comboStrikeDuration:  number;               // seconds per strike dash
  comboReturnDuration:  number;               // seconds to snap back to origin
  comboSpeedScale:      number;               // movement speed multiplier during combo travel
  comboHitPause:        number;               // pause duration after each combo hit
}

const DEFAULT_SPINNER_CONFIG: SpinnerConfig = {
  rpmCapacity:   120,
  startingRpmRatio: 0.55,
  maxRpmCapacity: 2000,

  rpmDecayRate:  1.0,
  rpmSpeedDrain: 0.3,

  radius:        1.6875,
  mass:          1.0,

  maxSpeed:      15,
  acceleration:  50,
  friction:      0.97,

  spinSpeed:     36,

  sprintSpeedMult: 1.7,
  sprintAccelMult: 1.5,
  sprintRpmDrain:  6.0,

  growthPickupCapacityGain: 12,
  growthPickupRpmGain: 14,

  duelImpactCap: 7.5,
  duelSpeedReference: 11.5,
  duelSharedDamageScale: 0.05,
  duelVelocityDamageScale: 0.16,
  duelRpmInfluenceScale: 0.22,

  comboMinRpmRatio:      0.35,
  comboCostRatio:        0.20,
  comboCooldown:         6.5,
  comboRecovery:         0.25,
  comboHitCount:         3,
  comboDamageMultiplier: 1.75,
  comboRepeatFalloff:    [1.0, 0.8, 0.65],
  comboStrikeDuration:   0.075,
  comboReturnDuration:   0.08,
  comboSpeedScale:       0.3,
  comboHitPause:         0.05,
};

export const spinnerConfig: SpinnerConfig = { ...DEFAULT_SPINNER_CONFIG };

export function resetSpinnerConfig(): void {
  Object.assign(spinnerConfig, DEFAULT_SPINNER_CONFIG);
}
