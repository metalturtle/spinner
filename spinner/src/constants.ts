// ─── Arena ───────────────────────────────────────────────────────────────────
export const ARENA_SIZE        = 20;    // half-width of square arena
export const WALL_HEIGHT       = 1.5;  // visual height of perimeter walls
export const WALL_THICKNESS    = 0.5;  // depth of wall geometry

// ─── Physics (world rules) ───────────────────────────────────────────────────
export const RESTITUTION       = 0.7;  // bounce energy retention
export const OBSTACLE_MASS     = 0.5;  // mass of a pushable obstacle

// ─── RPM ratios — applied to spinnerConfig.rpmCapacity ───────────────────────
// These define the shape of the RPM economy at any power level.
// Upgrading rpmCapacity shifts the whole economy proportionally.
export const RPM_SOFT_CAP_RATIO   = 0.70;  // overdrain + overcharge threshold = capacity × 0.70
export const RPM_HYPER_RATIO      = 1.30;  // overcharge visual ceiling         = capacity × 1.30
export const RPM_HALF_POINT_RATIO = 1.00;  // pickup diminishing-returns pivot  = capacity × 1.00
export const COLLISION_DAMAGE_RATIO = 0.05; // base collision damage             = attacker capacity × 0.05
export const SPINNER_SIZE_SCALE     = 0.75; // shared player/enemy top size multiplier

// ─── RPM flat world rules — do NOT scale with capacity ───────────────────────
export const RPM_OVERDRAIN         = 0;    // extra drain/s above soft cap threshold
export const WALL_RPM_PENALTY      = 3.0;  // flat RPM cost per wall bounce (constant by design)
export const PICKUP_RPM_BOOST      = 100;   // flat base RPM from a normal pickup (constant by design)
export const HYPER_BOOST           = 200;   // flat RPM from hyper pickup (bypasses scaling)
