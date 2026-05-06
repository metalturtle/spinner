# Spinner Sound Implementation Plan

Date: 2026-04-29

## Purpose

This file turns the current sound analysis into an implementation plan we can build against.

The audio goal is not just "add sounds." It is to reinforce the project's strongest design pillars:

- collision-first combat
- RPM as health, pressure, and power
- readable boss telegraphs
- satisfying reward feedback

The most important rule is this:

Gameplay readability comes before flavor.


## Current State

- There is no sound runtime or sound event layer in `src/`.
- The best initial integration point is the existing gameplay orchestration in `src/game.ts`.
- The highest-value sound families are collision impacts, RPM state feedback, projectile fire/hits, pickups, and boss telegraphs.


## Implementation Goals

### Primary

1. Make collisions feel weighty and readable.
2. Make the player's RPM state legible without looking at the HUD every frame.
3. Make enemy and boss attack timing easier to read.
4. Make kills, pickups, and combo attacks feel rewarding.

### Secondary

1. Add ambient life to lava, torches, menus, and overlays.
2. Add more enemy-specific flavor once the core sound bed is working.


## Recommended Runtime

Create a small audio layer instead of scattering `new Audio()` calls through gameplay code.

Recommended files:

- `src/sound.ts`
- `src/soundEvents.ts`
- `src/soundLibrary.ts`

Recommended responsibilities:

### `src/sound.ts`

- Own the audio context and unlock-on-first-input flow.
- Expose simple helpers like:
  - `playSfx(name, options?)`
  - `playLoop(name, key, options?)`
  - `stopLoop(key, fadeOut?)`
  - `setBusVolume(bus, value)`
- Support light randomization:
  - volume variation
  - pitch variation
  - multi-variant round robin

### `src/soundLibrary.ts`

- Register sound definitions in one place.
- Example data per sound:
  - asset path
  - bus
  - base volume
  - pitch range
  - cooldown
  - max simultaneous voices

### `src/soundEvents.ts`

- Define stable game-facing event names.
- Keep gameplay code using semantic names like:
  - `player_hit_heavy`
  - `pickup_hyper_collect`
  - `boss_spider_stomp_telegraph`


## Recommended Buses

Use a few buses from the start:

- `master`
- `sfx`
- `ui`
- `ambience`
- `combat`
- `player`
- `boss`

This makes later balancing much easier than per-sound tweaking only.


## Naming Convention

Use semantic names, not file-derived names.

Examples:

- `player_spin_loop`
- `player_sprint_loop`
- `player_hit_light`
- `player_hit_heavy`
- `player_low_rpm_warning`
- `pickup_normal_collect`
- `pickup_hyper_collect`
- `combo_start`
- `combo_hit`
- `combo_return`
- `turret_fire`
- `projectile_wall_ricochet`
- `boss_spider_leg_break`


## Priority Order

### Phase 1: Audio Runtime

Build the runtime before adding many sounds.

Tasks:

1. Create `src/sound.ts` with context setup, asset loading, and basic `playSfx`.
2. Add a mute toggle and master volume constant.
3. Unlock audio on first keyboard input or menu start.
4. Add cooldown support so repeated collision spam does not become noise.
5. Add optional positional pan or simple left/right stereo bias later, not in MVP.

Definition of done:

- The game can play one-shot sounds reliably.
- Loops can start and stop cleanly.
- Repeated events do not stack uncontrollably.


### Phase 2: Core Player And Combat Readability

This is the highest-value milestone.

Required sounds:

- `player_spin_loop`
- `player_sprint_loop`
- `collision_light`
- `collision_medium`
- `collision_heavy`
- `collision_grind_loop`
- `player_hit_projectile`
- `player_hit_body`
- `player_low_rpm_warning`
- `player_overcharge_loop`
- `player_death_topple`
- `player_death_pit`
- `pickup_normal_collect`
- `pickup_hyper_collect`
- `combo_ready`
- `combo_start`
- `combo_hit`
- `combo_return`
- `combo_finish`

Hook points:

- `src/player.ts`
  - `playerRpmHooks`
  - `notifyHit`
  - `startPlayerToppleDeath`
  - `startPlayerPitFallDeath`
- `src/game.ts`
  - wall-hit spark/grind section after `runCollisions()`
  - circle-contact grind section
  - `tryStartPlayerCombo()`
  - `applyComboHit()`
  - combo return/recovery in `updatePlayerCombo()`
  - pickup collection in the `registerProximityPair('player', 'pickup', ...)` block

Notes:

- The collision set should be parameterized by impact force.
- Low RPM warning should be rate-limited so it informs rather than annoys.
- Overcharge should be a loop or sustained layer, not repeated one-shots.


### Phase 3: Common Enemies And Projectiles

Required sounds:

- `turret_fire`
- `turret_destroy`
- `enemy_spinner_charge`
- `enemy_spinner_recover`
- `enemy_spinner_destroy`
- `zombie_attack`
- `zombie_hit`
- `zombie_death`
- `zombie_gib_death`
- `robot_prepare`
- `robot_fire`
- `robot_destroy`
- `slug_big_spit`
- `slug_head_poison_contact`
- `slug_belly_hit`
- `slug_big_death`
- `slug_baby_hit`
- `slug_baby_death`
- `projectile_fire`
- `projectile_wall_ricochet`
- `projectile_player_hit`
- `poison_projectile_fire`
- `crate_break`
- `barrel_bump`

Hook points:

- `src/game.ts`
  - `updateTurretSystem`
  - `updateRobotSystem`
  - `updateZombieSystem`
  - `updateSlugSystem`
  - `checkEnemyDeath`
  - `checkRobotDeath`
  - `checkZombieDeath`
  - `checkSlugDeath`
- `src/projectile.ts`
  - projectile wall-hit branch in `updateProjectiles()`
  - player hit branch in `updateProjectiles()`
- `src/enemySpinner.ts`
  - transition into `charge`
  - `onEnemyCollision()`
- `src/robotEnemy.ts`
  - `prepare` state
  - `shoot` state
- `src/zombieEnemy.ts`
  - attack trigger in `updateZombieAI()`
- `src/obstacle.ts`
  - obstacle break path through `game.ts` collision handling


### Phase 4: Boss Telemetry And Phase Feedback

Boss sounds should emphasize:

- telegraph start
- impact release
- vulnerability state
- part break
- phase shift
- death payoff

#### Dreadnought

Required:

- `boss_dread_windup`
- `boss_dread_charge`
- `boss_dread_recover_vulnerable`
- `boss_dread_weakpoint_hit`
- `boss_dread_drain_zone_spawn`
- `boss_dread_death`

Hook points:

- `src/bossDreadnought.ts`
  - charge state changes in `updateDreadnoughtAI()`
  - phase change in `updatePhase()`

#### Siege Engine

Required:

- `boss_siege_shield_loop`
- `boss_siege_shield_break`
- `boss_siege_turret_fire`
- `boss_siege_part_hit`
- `boss_siege_part_break`
- `boss_siege_core_vulnerable`
- `boss_siege_death`

Hook points:

- `src/game.ts`
  - `registerCollisionPair('player', 'siege_core', ...)`
  - `registerCollisionPair('player', 'siege_part', ...)`
  - `checkSiegeDeath()`
- `src/bossSiegeEngine.ts`
  - `destroySiegePart()`
  - `updateSiegeEngineTurrets()`

#### Spider Reliquary

Required:

- `boss_spider_step`
- `boss_spider_stomp_telegraph`
- `boss_spider_stomp_impact`
- `boss_spider_pulse_cast`
- `boss_spider_pulse_release`
- `boss_spider_legslam_windup`
- `boss_spider_legslam_impact`
- `boss_spider_leg_hit`
- `boss_spider_leg_break`
- `boss_spider_collapse`
- `boss_spider_core_exposed`
- `boss_spider_death`

Hook points:

- `src/bossSpiderReliquary.ts`
  - `scheduleStomp()`
  - `schedulePulse()`
  - `scheduleLegSlam()`
  - `applyDamageToSpiderLeg()`
- `src/game.ts`
  - `updateSpiderSystem()`
  - `registerCollisionPair('player', 'spider_core', ...)`
  - `registerCollisionPair('player', 'spider_leg', ...)`
  - `checkSpiderDeath()`

Important note:

- The current Spider Reliquary runtime uses `stomp`, `pulse`, and `leg_slam`.
- Web and acid attack sound hooks should be deferred until those attacks are actually emitted in live gameplay.

#### Octoboss

Required:

- `boss_octo_mode_extend`
- `boss_octo_mode_chase`
- `boss_octo_mode_retract`
- `boss_octo_drill_contact`
- `boss_octo_core_blocked`
- `boss_octo_core_exposed`
- `boss_octo_spawn_parasite`
- `boss_octo_spawn_drone`
- `boss_octo_death`

Hook points:

- `src/game.ts`
  - `updateOctobossSystem()`
  - `updateOctobossDrillContacts()`
  - `spawnOctobossRetractPickups()`
  - `spawnOctobossChaseWave()`
  - `checkOctobossDeath()`
- `src/bossOctoboss.ts`
  - mode transitions returned from `updateOctobossAI()`

Important note:

- The current gameplay loop is driven more by tentacle mode changes and drill contact than by the attack scheduling helpers.
- Prioritize mode-shift and contact sounds before jab/sweep flavor.

#### Hive Boss

Required:

- `boss_hive_chaingun_fire`
- `boss_hive_flock_hit`
- `boss_hive_flock_death`
- `boss_hive_phase_shift`
- `boss_hive_rage`
- `boss_hive_core_death`

Hook points:

- `src/bossHive.ts`
  - `updateHiveChaingun()`
  - `onFlockCollision()`
  - phase changes in `updateHiveAI()`
- `src/game.ts`
  - `registerCollisionPair('player', 'hive_flock', ...)`
  - `registerCollisionPair('player', 'hive_core', ...)`
  - `checkHiveDeath()`


### Phase 5: Ambient, UI, And Polish

Required:

- `lava_burn_tick`
- `torch_fire_loop`
- `spawn_trigger_activate`
- `menu_start`
- `menu_back`
- `game_over_sting`
- `restart_confirm`

Hook points:

- `src/game.ts`
  - `startSelectedLevel()`
  - `returnToMenu()`
  - game-over branch in `animate()`
  - `updateTriggerSpawns()`
  - kill-fall trigger path

Optional later:

- ambient dungeon room tone
- subtle space ambience if the space background returns


## First Asset Pass

Start with a deliberately small set of reusable assets.

### Must-Have First Batch

- 3 impact variations x 3 intensity bands
- 1 grind loop
- 1 projectile fire
- 1 ricochet
- 1 player hurt
- 1 pickup collect
- 1 hyper pickup collect
- 1 combo start
- 1 combo hit
- 1 combo finish
- 1 turret fire
- 1 robot fire
- 1 zombie attack
- 1 slug spit
- 1 death burst
- 1 boss telegraph
- 1 boss slam
- 1 shield hum
- 1 shield break

This is enough to make the game feel alive without needing a huge library.


## Event Emission Strategy

Do not call sound playback every frame without gating.

Use:

- cooldowns for repeated events
- thresholds for impact intensity
- loop start/stop for sustained states

Examples:

- Only trigger `collision_heavy` when `impactForce` exceeds a high threshold.
- Use one `collision_grind_loop` keyed to the player, not dozens of tiny scrape one-shots.
- Trigger `player_low_rpm_warning` only when crossing into critical RPM, then re-arm after recovery.
- Trigger `combo_ready` when the cooldown becomes ready, not every HUD update frame.


## Suggested Milestone Breakdown

### Milestone A

Audio runtime plus:

- player hit
- impacts
- pickups
- combo

This milestone should already make the game feel much better.

### Milestone B

Add:

- turret
- robot
- zombie
- slug
- projectile wall-hit

This covers most non-boss combat.

### Milestone C

Add boss telegraphs and boss death payoffs.

This is where readability and spectacle jump the most.

### Milestone D

Add ambience, UI, and polish layers.


## Technical Risks

### Sound Spam

The collision system can emit events frequently. Without cooldowns and force thresholds, the mix will become cluttered fast.

### Browser Unlock

Web audio must unlock from user input. Build this into the runtime from day one.

### Asset Mismatch

If the first asset batch is too realistic or too soft, it will fight the arcade feel. Favor stylized, punchy, short sounds.

### Boss Noise Floor

Boss fights already generate lots of particles and gameplay events. Telegraph sounds should be distinct and sparse.


## Deferred Sounds

These should wait until their runtime hooks are actually active:

- Spider Reliquary web projectile family
- Spider Reliquary acid projectile family
- Octoboss jab/sweep/double-specific telegraphs beyond mode-shift cues
- deep menu polish and ambient room layers


## Recommended Next Step

Implement Milestone A first:

1. build `src/sound.ts`
2. add a tiny starter library
3. wire in player/combat/pickup/combo events
4. tune spam control before expanding coverage

Once Milestone A feels good, expand outward into enemies and bosses.
