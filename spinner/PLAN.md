# 🎮 Spinning Top 3D Game — Tasks

---

## Phase 1: Project Scaffolding ✅
- [x] Initialize project with `npm init -y`
- [x] Install dependencies: `npm install three` and `npm install -D vite typescript @types/three`
- [x] Create `tsconfig.json` — configure strict TypeScript with ESNext modules
- [x] Add `dev` and `build` scripts to `package.json` (`"dev": "vite"`, `"build": "tsc && vite build"`)
- [x] Create `index.html` — entry point with canvas container, imports `src/game.ts` as ES module
- [x] Create `style.css` — fullscreen canvas, remove margins/scrollbars
- [x] Create `src/game.ts` — empty module with basic boilerplate
- [x] Verify Vite dev server runs (`npm run dev`) and TypeScript compiles without errors

---

## Phase 2: Scene Setup ✅
- [x] Initialize WebGL renderer (antialiased, full window, auto-resize)
- [x] Create perspective camera positioned above looking straight down
- [x] Add ambient light for base illumination
- [x] Add directional light with shadow support
- [x] Create ground plane mesh (arena floor with grid/texture)
- [x] Confirm scene renders a visible ground from top-down view

---

## Phase 3: Spinning Top (Player) ✅
- [x] Build top geometry: inverted ConeGeometry + tip cylinder, grouped
- [x] Apply material/color to the top
- [x] Add constant Y-axis spin animation
- [x] Position top at center of arena on startup

---

## Phase 4: Input Handling ✅
- [x] Add `keydown` / `keyup` event listeners for W, A, S, D
- [x] Track held keys in a `keys` map (boolean per key)
- [x] Verify input tracking works (e.g., console log)

---

## Phase 5: Acceleration-Based Movement ✅
- [x] Define constants: ACCELERATION, FRICTION, MAX_SPEED
- [x] Create velocity vector `(vx, vz)`
- [x] Each frame: apply acceleration from held keys to velocity
- [x] Each frame: apply friction/drag (multiply velocity by FRICTION)
- [x] Clamp velocity to MAX_SPEED
- [x] Update top position by `velocity × deltaTime`
- [x] Calculate proper deltaTime using `THREE.Timer`

---

## Phase 5.5: Module Refactor ✅
- [x] Create `src/constants.ts` — export all tuning constants (`ACCELERATION`, `FRICTION`, `MAX_SPEED`, `ARENA_SIZE`, `SPIN_SPEED`, etc.)
- [x] Create `src/renderer.ts` — export `renderer`, `scene`, `camera`; owns WebGL init, lights, and window resize handler
- [x] Create `src/arena.ts` — export `createArena(scene)` that builds floor + grid and returns meshes
- [x] Create `src/top.ts` — export `createTop()` that builds the `topGroup` (body, tip, ring) and returns it
- [x] Create `src/input.ts` — export `keys` record and register `keydown`/`keyup` listeners on import
- [x] Rewrite `src/game.ts` as thin orchestrator — import modules, wire up game loop (velocity, position, spin)
- [x] Verify `npm run dev` still works, no regressions, `tsc` passes

---

## Phase 6: Top Tilt Effect ✅
- [x] Tilt the top slightly in the direction of movement
- [x] Smoothly interpolate tilt so it feels natural
- [x] Return to upright when stationary

---

## Phase 7: Arena Walls ✅
- [x] Define ARENA_SIZE constant (half-width of square arena)
- [x] Create 4 wall meshes (BoxGeometry) around the perimeter
- [x] Position and scale walls correctly
- [x] Apply distinct material/color to walls

---

## Phase 8: Collision System (Circle + Segment) ✅

> **Approach:** Custom 2D (XZ-plane) collision engine — all entities are circles, all walls
> are line segments. Supports slanted walls, pushable obstacles, and enemy tops out of the box.

### 8a: Collidable Interface & Data Structures ✅
- [x] Create `src/physics.ts`
- [x] Define `Collidable` interface: `{ position: {x, z}, velocity: {x, z}, radius, mass, isStatic }`
- [x] Define `Segment` type: `{ p1: {x, z}, p2: {x, z} }` for walls
- [x] Export a mutable list `collidables: Collidable[]` and `walls: Segment[]`

### 8b: Circle ↔ Segment Resolution ✅
- [x] `resolveCircleSegment(circle, segment)` — project circle center onto segment, find closest point, compute penetration depth and normal
- [x] Separate circle from wall by penetration depth along normal
- [x] Reflect velocity along normal, scaled by `RESTITUTION`
- [x] Test: player top bounces off all 4 arena walls

### 8c: Circle ↔ Circle Resolution ✅
- [x] `resolveCircleCircle(a, b)` — compute distance between centers, detect overlap
- [x] Separate both bodies along the collision normal proportional to inverse mass (static bodies don't move)
- [x] Apply impulse to both velocities using mass, restitution, and relative velocity along normal
- [x] Test: place a second static circle in the arena, confirm player bounces off it

### 8d: Arena Walls as Segments ✅
- [x] Refactor `arena.ts` to export wall segments alongside meshes
- [x] Register arena wall segments in `walls[]` on startup
- [x] Support angled/slanted walls — segments at arbitrary angles work with the same math

### 8e: Integration into Game Loop ✅
- [x] Register the player top as a `Collidable` in the list
- [x] Each frame after velocity update: run all circle↔segment checks, then all circle↔circle checks
- [x] Position Three.js meshes from `Collidable.position` after resolution
- [x] Verify: top bounces off walls, can't escape arena, framerate stays smooth

---

## Phase 9: RPM System (Core Mechanic) ✅

> RPM is the top's life force. It drains constantly, everything in the game accelerates or
> slows that drain. Zero RPM = game over. High RPM = you hit harder. This makes RPM
> simultaneously health, offense, and a ticking clock.

### 9a: RPM State & Natural Decay ✅
- [x] Add `rpm` field to `Collidable` (default `RPM_MAX`)
- [x] Add RPM constants: `RPM_MAX`, `RPM_DECAY_RATE`, `RPM_SPEED_DRAIN` to `constants.ts`
- [x] Each frame: `rpm -= RPM_DECAY_RATE * delta` (natural decay)
- [x] Each frame: `rpm -= currentSpeed * RPM_SPEED_DRAIN * delta` (movement costs RPM)
- [x] Clamp RPM to `[0, RPM_MAX]`

### 9b: RPM Drives Visuals ✅
- [x] Spin speed driven by RPM: `rpm / RPM_MAX * SPIN_SPEED` (replaces old speed-based spin)
- [x] Low RPM wobble: add sinusoidal oscillation to `tiltGroup.rotation.x/z`, amplitude grows as RPM falls
- [x] Material desaturation at low RPM: lerp `bodyMat.color` toward grey as RPM drops
- [x] Critical flash: pulse `bodyMat.emissive` when RPM < 25%

### 9c: Wall & Floor RPM Penalties ✅
- [x] Wall hit: `rpm -= WALL_RPM_PENALTY` (flat cost per bounce, already detected via `playerWallHit`)
- [x] Add `FloorZone` type: `{ minX, maxX, minZ, maxZ, drainRate }` and `zones[]` list in `physics.ts`
- [x] Each frame: if player inside a zone, `rpm -= zone.drainRate * delta`
- [x] Add a water zone to the arena for testing (visual: blue-tinted plane mesh)

### 9d: RPM-Weighted Collision Impulse ✅
- [x] Modify `resolveCircleCircle` to compute **effective mass** = `mass * (rpm / RPM_MAX)`:
  - Higher RPM = heavier collision presence → you knock enemies around
  - Low RPM = you're light → enemies shove you
- [x] Keep positional separation mass-based (prevents tunnelling), but impulse uses effective mass

### 9e: Enemy RPM Damage Formula ✅
- [x] Add `heatFactor` field to `Collidable` (default 1.0, enemies can have higher)
- [x] On circle-circle collision involving the player, compute damage:
  ```
  impactForce  = abs(relativeVelocity · normal)
  massFactor   = enemy.mass / player.mass
  rpmFactor    = enemy.rpm / player.rpm
  heatMult     = enemy.heatFactor
  damage       = BASE_COLLISION_DAMAGE * impactForce * massFactor * rpmFactor * heatMult
  ```
- [x] Apply `damage` to player RPM, apply inverse damage to enemy RPM
- [x] `resolveCircleCircle` needs to return collision info (who, impact force) so game loop can apply RPM damage

### 9f: Pickups ✅
- [x] Define `Pickup` type or reuse `Collidable` with a `pickup` flag
- [x] On collision with player: `rpm += PICKUP_RPM_BOOST`, remove pickup from scene + collidables
- [x] Create pickup mesh (glowing torus or sphere)
- [x] Place a few test pickups in the arena

### 9g: Game Over ✅
- [x] When `rpm <= 0`: freeze input, play topple animation (lerp tiltGroup.rotation.z to π/2 over ~1s)
- [x] Show "Game Over" text overlay (HTML div or canvas text)
- [x] Allow restart (e.g., press R to reset state)

---

## Phase 10: Game Loop Refactor ✅

> `game.ts` is ~310 lines with all logic inline in `animate()`. Extract discrete
> systems into named functions so each concern is isolated and future phases
> (soft cap, enemies, new pickups) slot in cleanly.

- [x] Extract `updateMovement(delta)` — input, friction, speed clamp, position update
- [x] Extract `updateRpm(delta, playerWallHit, circleHits)` — natural decay, speed drain, wall penalty, zone drain, enemy collision damage, clamp
- [x] Extract `updatePickups(delta)` — collection check, mesh animation
- [x] Extract `updateVisuals(delta)` — tilt, wobble, spin, desaturation, hit flash / critical pulse, sync Three.js position
- [x] Extract `updateTopple(delta)` — game over animation branch (already partly separate)
- [x] `animate()` becomes: movement → physics → rpm → pickups → game-over check → visuals → hud → render
- [x] Verify `tsc` passes, no regressions

---

## Phase 11: RPM Soft Cap & Hyper Boost (Option B) ✅

> See [RPM-OPTIONS.md](RPM-OPTIONS.md) for full analysis. Normal play caps at 70.
> A rare hyper boost pickup pushes past 70, up to 130. Overcharge drains faster.

### 11a: Soft Cap & Overdrain ✅
- [x] Add constants: `RPM_SOFT_CAP = 70`, `RPM_HYPER_MAX = 130`, `RPM_OVERDRAIN = 4.0`
- [x] Normal pickups clamp to `RPM_SOFT_CAP` instead of `RPM_MAX`
- [x] Each frame: if `rpm > RPM_SOFT_CAP`, apply extra decay `RPM_OVERDRAIN * delta`
- [x] Update all `RPM_MAX` clamps to `RPM_HYPER_MAX` where appropriate
- [x] Player starts at `RPM_SOFT_CAP` (not 100)

### 11b: Hyper Boost Pickup ✅
- [x] Create distinct hyper pickup mesh (pulsing bright cyan/white, larger)
- [x] On collection: `rpm += HYPER_BOOST` (50), clamped to `RPM_HYPER_MAX`
- [x] Place 1 hyper pickup in a risky location (inside the water zone)

### 11c: Overcharged Visuals ✅
- [x] When `rpm > RPM_SOFT_CAP`: brighter body material, emissive glow (cyan/white)
- [x] HUD number glows bright cyan when overcharged
- [x] Spin speed uses `rpm / RPM_SOFT_CAP` (so overcharged = faster than "normal max")

### 11d: Physics at High RPM ✅
- [x] Effective mass formula still uses `rpm / RPM_MAX` — overcharged player hits harder than any normal enemy
- [x] Verify collision feel when player is at 130 vs enemies at 70

---

## Phase 11.5: Diminishing Returns on Pickups

> See [DIMINISHING-RETURNS.md](DIMINISHING-RETURNS.md) for full analysis.
> Replace the hard RPM_SOFT_CAP on normal pickups with inverse scaling.
> Pickups always help, but give less the higher your RPM. Hyper pickup
> bypasses the curve entirely (flat +50). HALF_POINT becomes the
> upgrade-friendly knob that controls RPM capacity.

### 11.5a: Inverse Scaling Formula ✅
- [x] Add constant `RPM_HALF_POINT = 100` to `constants.ts` (RPM at which pickups give half value)
- [x] Remove `RPM_SOFT_CAP` hard clamp from normal pickup collection in `updatePickups`
- [x] Normal pickup gain: `PICKUP_RPM_BOOST * RPM_HALF_POINT / (rpm + RPM_HALF_POINT)`
- [x] Hyper pickup stays flat `+HYPER_BOOST` (bypasses diminishing returns), no upper clamp

### 11.5b: Update Overdrain Threshold ✅
- [x] Overdrain still applies above `RPM_SOFT_CAP` (70) — no change to decay logic
- [x] Remove `RPM_HYPER_MAX` hard ceiling clamp from `updateRpm` — let decay be the natural limit
- [x] Keep `RPM_HYPER_MAX` as a reference constant (visual normaliser for overcharge effects)

### 11.5c: Visuals & HUD Adjustments ✅
- [x] Overcharged visuals still trigger at `rpm > RPM_SOFT_CAP` — cyan glow, faster spin
- [x] HUD overcharge cyan still triggers at `rpm > RPM_SOFT_CAP`
- [x] HUD normal colour fraction uses `rpm / RPM_SOFT_CAP` (clamped to 1 for colour math)
- [x] `overFrac` clamped to 1 in updateVisuals — glow saturates at RPM_HYPER_MAX, stays maxed above it

### 11.5d: Verify & Tune
- [ ] Test: at low RPM, pickups give near-full boost (+~20)
- [ ] Test: at 100+ RPM, pickups give noticeably less (+~10)
- [ ] Test: hyper pickup always gives flat +50 regardless of current RPM
- [ ] Test: practical ceiling emerges from decay vs pickup balance (~130–150 range)
- [ ] Verify `tsc` passes, no regressions

---

## Phase 12: Spinner Config & Upgrade Foundation

> Spinner-related constants are currently imported as flat module-level values.
> To make upgrades possible at runtime, extract them into a single mutable
> `SpinnerConfig` object in `src/spinnerConfig.ts`. Game code reads from it
> every frame — an upgrade is just a mutation of that object.
>
> This phase is infrastructure only. No upgrade UI yet.
> See [SPINNER-CONFIG.md](SPINNER-CONFIG.md) for design rationale.

### 12a: Define SpinnerConfig ✅
- [x] Create `src/spinnerConfig.ts`
- [x] Define `SpinnerConfig` interface with all spinner-owned properties:
  - `radius`, `mass` — collision properties
  - `maxSpeed`, `acceleration`, `friction` — movement
  - `spinSpeed` — visual spin rate
  - `rpmDecayRate`, `rpmSpeedDrain`, `rpmSoftCap`, `rpmHalfPoint` — RPM economy
- [x] Export `spinnerConfig: SpinnerConfig` initialised from current constant values
- [x] Remove the spinner-owned constants from `constants.ts`
  (kept world constants: `RPM_MAX`, `RPM_HYPER_MAX`, `RPM_OVERDRAIN`,
  `WALL_RPM_PENALTY`, `PICKUP_RPM_BOOST`, `HYPER_BOOST`, `BASE_COLLISION_DAMAGE`,
  `RESTITUTION`, `ARENA_SIZE`, `WALL_HEIGHT`, `WALL_THICKNESS`)

### 12b: Thread Config Through game.ts ✅
- [x] Import `spinnerConfig` in `game.ts`, remove spinner constant imports
- [x] `playerBody` init reads `spinnerConfig.radius` and `spinnerConfig.mass`
- [x] `updateMovement` reads `spinnerConfig.acceleration`, `.friction`, `.maxSpeed`
- [x] `updateRpm` reads `spinnerConfig.rpmDecayRate`, `.rpmSpeedDrain`, `.rpmSoftCap`, `.rpmHalfPoint`
- [x] `updateVisuals` reads `spinnerConfig.spinSpeed`, `.rpmSoftCap`, `.rpmHalfPoint`
- [x] `hud.ts` reads `spinnerConfig.rpmSoftCap` for overcharge threshold
- [x] `resetGame` syncs `playerBody.radius` / `.mass` from config on restart

### 12c: Verify ✅
- [x] `tsc` passes, no regressions
- [x] All behaviour identical to before — pure refactor

---

## Phase 13: RPG RPM Scaling — `rpmCapacity` as Master Stat

> As the spinner levels up, flat RPM values (RPM_MAX = 100, soft cap = 70) become
> meaningless. Replace them with a single master stat `rpmCapacity` in SpinnerConfig.
> Everything RPM-related derives from it via ratio constants. Upgrading `rpmCapacity`
> shifts the entire RPM economy proportionally — no re-tuning needed.
>
> Pickups and wall penalty stay flat (user decision) — the diminishing-returns
> formula already makes pickups less impactful at high RPM naturally.

### 13a: Ratio Constants in constants.ts ✅
- [x] Add `RPM_SOFT_CAP_RATIO = 0.70` — soft cap = `rpmCapacity × 0.70`
- [x] Add `RPM_HYPER_RATIO = 1.30` — overcharge visual ceiling = `rpmCapacity × 1.30`
- [x] Add `RPM_HALF_POINT_RATIO = 1.00` — pickup half-point = `rpmCapacity × 1.00`
- [x] Add `COLLISION_DAMAGE_RATIO = 0.05` — base collision damage = `rpmCapacity × 0.05`
- [x] Remove `RPM_MAX` and `RPM_HYPER_MAX` (replaced by capacity × ratio)

### 13b: rpmCapacity in SpinnerConfig ✅
- [x] Add `rpmCapacity: 100` to `SpinnerConfig` — the single upgradeable RPM stat
- [x] Remove `rpmSoftCap` and `rpmHalfPoint` from SpinnerConfig (now derived)
- [x] Derived values computed inline wherever needed:
  - soft cap threshold = `spinnerConfig.rpmCapacity * RPM_SOFT_CAP_RATIO`
  - overcharge ceiling  = `spinnerConfig.rpmCapacity * RPM_HYPER_RATIO`
  - pickup half-point   = `spinnerConfig.rpmCapacity * RPM_HALF_POINT_RATIO`

### 13c: rpmCapacity on Collidable ✅
- [x] Add `rpmCapacity` field to `Collidable` interface in `physics.ts`
- [x] Player `rpmCapacity` synced from `spinnerConfig.rpmCapacity` at init and on upgrade
- [x] Enemies get their own `rpmCapacity` (default 100 — enemies can have different tiers later)
- [x] Effective mass in `resolveCircleCircle` uses `rpm / rpmCapacity` instead of `rpm / RPM_MAX`

### 13d: Collision Damage Scales with Capacity ✅
- [x] Replace `BASE_COLLISION_DAMAGE` flat constant with `COLLISION_DAMAGE_RATIO = 0.05`
- [x] Damage formula: `COLLISION_DAMAGE_RATIO × attacker.rpmCapacity × impactForce × massRatio × rpmRatio × heatFactor`
- [x] At capacity 100: base ×5 (same as before). At capacity 1000: base ×50 — combat stays proportional

### 13e: Update All Usages ✅
- [x] `game.ts` — `updateRpm`, `updatePickups`, `updateVisuals`, `resetGame`
- [x] `hud.ts` — overcharge threshold, fraction calculation
- [x] `physics.ts` — effective mass formula, Collidable interface
- [x] Verify `tsc` passes, no regressions

---

## Phase 14: Follow Camera

> The camera currently sits fixed at (0, 30, 20) looking at origin.
> Extract camera logic into `src/camera.ts` with a smooth follow system:
> exponential-lerp lag, velocity look-ahead, max-lag clamp, and arena
> boundary clamping. Translate-only — orientation never changes.

### 14a: Create `src/camera.ts` ✅
- [x] Export `initCamera()` — sets initial camera position (same as current)
- [x] Export `updateCamera(pos: Vec2, vel: Vec2, delta: number)` — called each frame
- [x] Internal `camX`, `camZ` state (starts at 0, 0)
- [x] Camera constants (local, not exported):
  - `FOLLOW_SPEED = 3.0` — lerp speed; lower = more lag
  - `LOOK_AHEAD   = 0.35` — velocity offset fraction for anticipation
  - `MAX_LAG      = 7.0` — max distance camera can fall behind spinner
  - `MARGIN       = 3.0` — inward clamp from arena edge

### 14b: Follow Algorithm ✅
- [x] Look-ahead target: `targetX = pos.x + vel.x * LOOK_AHEAD`, same for Z
- [x] Exponential lerp (framerate-independent): `t = 1 - exp(-FOLLOW_SPEED * delta)`
- [x] Apply lerp: `camX += (targetX - camX) * t`
- [x] Max-lag clamp: if `dist(cam, spinner) > MAX_LAG`, slide cam along gap to restore limit
- [x] Arena boundary clamp: `camX = clamp(camX, -(ARENA_SIZE - MARGIN), ARENA_SIZE - MARGIN)`
- [x] Apply to Three.js camera: `position.set(camX, 30, camZ + 20)`, `lookAt(camX, 0, camZ)`

### 14c: Wire into game.ts ✅
- [x] Import `initCamera`, `updateCamera` from `./camera`
- [x] Call `initCamera()` on startup
- [x] Call `updateCamera(playerBody.pos, playerBody.vel, delta)` each frame before render (all 3 render paths)
- [x] Remove `camera.position.set` / `lookAt` from renderer.ts (camera.ts owns this now)

### 14d: Verify ✅
- [x] Camera lags smoothly behind fast movement
- [x] Look-ahead pulls camera in movement direction
- [x] Camera doesn't show void outside arena walls
- [x] No regressions on resize or game-over screen

---

## Phase 15: Turret Enemy

> A static turret guards the arena. It tracks the spinner with a smoothly rotating
> barrel, fires predictive projectiles that drain RPM on hit, and takes HP damage
> when rammed. When HP reaches zero it explodes and is removed. One turret for now.

### 15a: Turret Module (`src/turret.ts`) ✅
- [x] `TurretState` interface: `pos`, `hp/maxHp`, `fireCooldown`, `barrelAngle`, Three.js group refs, collidable ref, `alive` flag
- [x] `createTurret(pos, rpmCapacity)` — builds base cylinder + body + horizontal barrel + HP bar, registers `isStatic` Collidable
- [x] `updateTurret(turret, spinnerPos, spinnerVel, delta)` — predictive aim, smooth barrel rotation (`BARREL_ROTATION_SPEED = 2.5 rad/s`), fire cooldown (`FIRE_COOLDOWN = 2.0s`), returns `{shouldFire, firePos, fireDir}`
- [x] `applyDamageToTurret(turret, damage)` — reduces HP, updates HP bar fill width/position, returns true if dead
- [x] `destroyTurret(turret)` — removes group from scene, splices collidable from array

### 15b: Projectile Module (`src/projectile.ts`) ✅
- [x] `Projectile` interface: `pos`, `vel`, `lifetime`, `mesh`, `alive`, `turretRpmCapacity`
- [x] `createProjectile(pos, dir, speed, turretRpmCapacity)` — orange glowing sphere mesh
- [x] `updateProjectiles(...)` — move, despawn at arena boundary or lifetime expiry, check spinner hit
- [x] On spinner hit: damage = `PROJECTILE_DAMAGE_RATIO × turretRpmCapacity` (= 15 RPM), return `{rpmDamage, hitFlash}`
- [x] Projectiles pass through turret (no turret collision check in this module)

### 15c: Explosion Module (`src/explosion.ts`) ✅
- [x] `Explosion` interface: `mesh`, `elapsed`, `alive`
- [x] `createExplosion(pos)` — orange/yellow emissive sphere, transparent
- [x] `updateExplosions(explosions, delta)` — expand scale, fade opacity over `EXPLOSION_DURATION = 0.55s`
- [x] No area damage (visual only)

### 15d: Wire into `game.ts` ✅
- [x] Create one turret at `(-8, 7)` on startup
- [x] `updateTurretSystem(delta, circleHits)` — AI + fire, projectile updates, ram HP damage, explosions
- [x] `if (!enemy.isStatic)` guard in `updateRpm` — skip modifying turret's rpm field on collision
- [x] Turret HP damage from ram uses same `COLLISION_DAMAGE_RATIO` formula as RPM damage
- [x] `resetGame` — destroys old turret, clears projectiles/explosions, recreates turret

### 15e: Physics Fix ✅
- [x] Fix inverted `relVelDotN` sign check in `resolveCircleCircle` (`<= 0` not `>= 0`) — was silently returning 0 impactForce for all approaching collisions since no non-player collidables existed before

### 15f: Verify
- [ ] Ramming turret reduces its HP bar visibly
- [ ] Turret barrel rotates smoothly toward spinner
- [ ] Projectiles fire and drain spinner RPM on hit
- [ ] Turret explodes when HP reaches zero and is removed from physics
- [ ] Game restarts cleanly with fresh turret

---

## Phase 16: Entity Component System

> Introduce a lightweight component-registration pattern. Each entity type keeps its
> own `setupX` / `updateX` / `cleanupX` functions but registers into shared systems
> (movement, collision, proximity, RPM). The game loop iterates systems, not entities.
> Entities are updated in registration order. Collision and proximity pairs are
> commutative — `(player, turret)` and `(turret, player)` resolve to the same handler.
>
> Explosions stay as a simple pool (no components). Walls stay as environment (not entities).

### 16a: Create `src/systems.ts` — registries & runners
- [ ] **Entity update registry** — ordered array; `update()` called in registration order
- [ ] **Movement registry** — `{ id, collidable, maxSpeed, friction }`; system applies `vel += accel`, friction, speed clamp, `pos += vel * delta`
- [ ] **Collision pair registry** — `Map<pairKey, handler(colA, colB, hit)>`; commutative key `[typeA, typeB].sort().join(':')`; system loops `circleHits` once, dispatches to matching handler
- [ ] **Proximity pair registry** — same commutative key pattern; system iterates all registered pairs, runs distance check, dispatches handler
- [ ] **RPM registry** — `{ id, collidable, decayRate, speedDrain }`; system applies natural decay + speed drain + clamp to 0
- [ ] `registerEntity(id, updateFn)` / `deregisterEntity(id)` — sweeps all registries
- [ ] Each registration tagged with numeric entity ID for safe bulk deregistration

### 16b: Migrate movement
- [ ] Player: `updatePlayer(delta)` reads keyboard → sets `playerBody.vel` acceleration only
- [ ] Enemy: `updateEnemyAI(delta)` runs AI state machine → sets acceleration only
- [ ] Both register into movement pool during setup
- [ ] `movementSystem(delta)` handles friction, speed clamp, position update for all registrants
- [ ] Remove duplicated friction/clamp/position code from `updateMovement` and `updateEnemyAI`

### 16c: Migrate collision handlers
- [ ] `('player', 'turret')` → compute HP damage to turret, apply, check death
- [ ] `('player', 'obstacle')` → compute HP damage to breakable obstacle, apply, check death
- [ ] `('player', 'enemy')` → trigger enemy recovery state
- [ ] Handlers registered during `setupTurret`, `setupObstacle`, `setupEnemySpinner`
- [ ] `collisionSystem(circleHits)` — one loop, dispatches to registered pair handler
- [ ] RPM collision damage stays in RPM system (not a pair handler) — bidirectional, pair-level

### 16d: Migrate proximity
- [ ] `('player', 'pickup')` → collect pickup, return RPM gain
- [ ] `('projectile', 'player')` → damage player RPM, despawn projectile
- [ ] Pickups register during `setupPickup`; projectiles register on spawn, deregister on despawn
- [ ] `proximitySystem()` — one loop, distance check, dispatches to registered pair handler

### 16e: Migrate RPM
- [ ] Player + enemy register into RPM pool during setup
- [ ] `rpmSystem(delta)` — shared base: natural decay + speed drain + clamp
- [ ] Player-specific hooks run after: wall penalty, zone drain, overdrain
- [ ] Remove `updateEnemyRpm` (absorbed into shared system)
- [ ] RPM collision damage pass: iterate `circleHits`, compute symmetrical damage for all player-involved hits

### 16f: Rewrite game loop
- [ ] Phase 1: `entityUpdateSystem(delta)` — calls each entity's update in registration order
- [ ] Phase 2: `movementSystem(delta)` — friction, clamp, position for all movables
- [ ] Phase 3: `runCollisions()` → circleHits
- [ ] Phase 4: `collisionSystem(circleHits)` — pair dispatch
- [ ] Phase 5: `proximitySystem()` — pair dispatch
- [ ] Phase 6: `rpmSystem(delta)` + player RPM hooks + RPM collision damage
- [ ] Phase 7: death checks → `cleanupX` → spawn drops
- [ ] Phase 8: visuals + explosions + HUD + camera + render

### 16g: Verify
- [ ] `tsc` passes
- [ ] All entities spawn correctly on game start
- [ ] Turret destruction → explosion + collidable removed
- [ ] Enemy death → explosion + pickup drop + collidable removed
- [ ] Obstacle destruction → explosion + collidable removed
- [ ] Pickup collection works (normal + hyper)
- [ ] Projectile hits player and despawns
- [ ] Reset (R key) cleanly destroys all, re-spawns fresh
- [ ] Entity update order matches registration order

---

## Phase 17: Polish & Tuning
- [ ] Tune RPM decay, penalties, and boost values for tension without frustration
- [ ] Tune ACCELERATION, FRICTION, MAX_SPEED for good game feel
- [ ] Tune RESTITUTION for satisfying bounces
- [x] Add visual feedback on wall hit (color flash) — *done in Phase 9 prep*
- [x] HUD: RPM number overlay — *done*

---

## Phase 18: Stretch Goals
- [ ] Screen shake on hard wall impacts
- [ ] AI enemies with patrol/chase behaviour
- [ ] Sound effects (spin hum pitch tied to RPM, wall bounce, pickup chime)
- [ ] Slanted walls / non-rectangular arena layouts
- [ ] Pushable obstacle entities (crates, barrels)
- [ ] Enemy heat factor visual: glow intensity, particle aura
- [ ] Floor zone types: ice (low friction), boost pads (RPM + speed burst)

---

## Constants Reference

### World Constants (`constants.ts`)

| Parameter               | Value | Description                                          |
| ----------------------- | ----- | ---------------------------------------------------- |
| ARENA_SIZE              | 20    | Half-width of the square arena                       |
| WALL_HEIGHT             | 1.5   | Visual height of perimeter walls                     |
| WALL_THICKNESS          | 0.5   | Depth of wall geometry                               |
| RESTITUTION             | 0.7   | Bounce energy retention                              |
| OBSTACLE_MASS           | 0.5   | Mass of a pushable obstacle                          |
| RPM_OVERDRAIN           | 0     | Extra drain/s above soft cap threshold               |
| WALL_RPM_PENALTY        | 3.0   | Flat RPM cost per wall bounce (stays constant)       |
| PICKUP_RPM_BOOST        | 20    | Flat base RPM from a normal pickup (stays constant)  |
| HYPER_BOOST             | 50    | Flat RPM from hyper pickup (bypasses scaling)        |
| BASE_COLLISION_DAMAGE   | 5.0   | → Phase 13: replaced by COLLISION_DAMAGE_RATIO       |
| RPM_MAX / RPM_HYPER_MAX | 100/130 | → Phase 13: replaced by rpmCapacity × ratio       |

*Phase 13 adds:* `RPM_SOFT_CAP_RATIO`, `RPM_HYPER_RATIO`, `RPM_HALF_POINT_RATIO`, `COLLISION_DAMAGE_RATIO`

### Spinner Config (`spinnerConfig.ts`) — upgradeable at runtime

| Property      | Default | Description                                          |
| ------------- | ------- | ---------------------------------------------------- |
| rpmCapacity   | 100     | → Phase 13: master RPM stat, everything derives from it |
| rpmDecayRate  | 1.0     | Natural RPM drain per second                         |
| rpmSpeedDrain | 0.3     | Extra drain per unit speed per second                |
| rpmSoftCap    | 70      | → Phase 13: removed, derived as capacity × 0.70     |
| rpmHalfPoint  | 100     | → Phase 13: removed, derived as capacity × 1.00     |
| radius        | 0.5     | Collision radius                                     |
| mass          | 1.0     | Collision weight                                     |
| maxSpeed      | 15      | Velocity cap (units/s)                               |
| acceleration  | 25      | Force per WASD key (units/s²)                        |
| friction      | 0.97    | Velocity multiplier per frame                        |
| spinSpeed     | 12      | Max visual spin rate (rad/s)                         |
