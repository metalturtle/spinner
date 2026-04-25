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
}

export const spinnerConfig: SpinnerConfig = {
  rpmCapacity:   1000,

  rpmDecayRate:  1.0,
  rpmSpeedDrain: 0.3,

  radius:        0.75,
  mass:          1.0,

  maxSpeed:      15,
  acceleration:  50,
  friction:      0.97,

  spinSpeed:     36,

  sprintSpeedMult: 1.7,
  sprintAccelMult: 1.5,
  sprintRpmDrain:  6.0,
};
