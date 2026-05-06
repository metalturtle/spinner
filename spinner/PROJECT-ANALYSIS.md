# Spinner Project Analysis

Date: 2026-04-25

## Executive Summary

This project is a browser-based 3D arena game built with Three.js, TypeScript, and Vite. The core fantasy is a high-speed spinning-top combat game where RPM acts as health, offensive power, and the main time-pressure resource. The codebase already has a strong gameplay identity: collisions feel like a first-class mechanic, enemies are varied, and the project has gone beyond prototype stage into a feature-rich combat sandbox with bosses, pickups, projectiles, particles, and level data.

Technically, the project sits in a useful middle ground between a raw prototype and a lightweight engine. It uses a custom 2D-on-XZ physics model, an entity registration system for movement/RPM/proximity/collision behavior, and modular files for most gameplay features. The main weakness is orchestration complexity: `src/game.ts` has become the central integration hub for nearly everything, and several systems still assume a square arena even though level geometry has become more flexible.

## What The Project Is

- Rendering stack: Three.js with a Vite + TypeScript toolchain.
- Game type: top-down / trailing-camera arena action game.
- Core mechanic: RPM economy drives survivability, damage, overcharge, movement pressure, and pickup value.
- Content style: handcrafted enemies and bosses with per-type AI and combat rules.
- Level model: JSON-driven geometry and entity placement.

## Current State Of The Codebase

The codebase contains about 6.8k lines of TypeScript across focused modules plus JSON level data and art assets. The rendering and gameplay code are already separated into sensible domains:

- `src/renderer.ts` creates the Three.js scene, camera, renderer, and lighting.
- `src/arena.ts` turns level polygons/circles into floor meshes, extruded wall meshes, collision walls, and hazard zones.
- `src/physics.ts` provides the custom circle-vs-segment and circle-vs-circle collision model.
- `src/systems.ts` acts like a lightweight ECS/service registry for update, movement, RPM, collision-pair, and proximity-pair handling.
- `src/player.ts`, `src/enemySpinner.ts`, `src/turret.ts`, `src/robotEnemy.ts`, `src/slugworm.ts`, `src/boss*.ts` encapsulate individual gameplay actors.
- `src/game.ts` wires the whole game together: level selection, permanent handler registration, spawning, reset flow, death checks, and the main loop.

This is a good sign overall: most behavior is modular. The project is not just one huge script anymore. The tradeoff is that `src/game.ts` has become a very large conductor file at 724 lines, which now holds a lot of the project’s real gameplay policy.

## Architecture Assessment

### 1. Rendering And Visual Layer

The visual side is stronger than a typical early-stage gameplay prototype:

- The spinner model is loaded through a shared GLTF cache in `src/top.ts`, which avoids repeated asset loads.
- Shared visual behavior is centralized in `src/spinnerVisuals.ts`, which reduces duplicated tilt/spin/wobble code.
- Projectile rendering uses custom shader materials rather than simple spheres, which gives the project a more distinctive look.
- Effects systems like sparks, trails, explosions, and goo decals show good attention to feedback and combat readability.

This is one of the project’s biggest strengths. The code shows clear intent to make collisions and hits feel satisfying, not just mechanically correct.

### 2. Gameplay And Systems Layer

The project uses a custom “registry-based” architecture rather than a full ECS. That choice fits the scope well:

- Entities register movement, RPM behavior, updates, and proximity bodies.
- Collision handling is type-pair based, which keeps specialized combat rules out of the low-level physics solver.
- The player’s extra RPM rules live in `playerRpmHooks`, while common RPM decay lives in `rpmSystem`.

This design is practical and readable. It gives the flexibility of systems-oriented code without the overhead of a full framework.

The main limitation is coordination overhead. A lot of higher-level game rules are still hand-assembled in `src/game.ts`, which means new content often requires edits in multiple places:

- imports
- entity-manager setup
- collision-pair registration
- spawn switch cases
- update loops
- death checks

That is manageable now, but it will get expensive as content variety grows.

### 3. Physics Model

The custom physics layer is a strong fit for the game:

- simple enough to reason about
- tailored to circular colliders and arena walls
- easy to tune for arcade feel
- integrates well with RPM-weighted impacts

This is a better choice than dropping in a generic full 3D rigid-body engine for this type of game. The collision code is readable and connected directly to gameplay outcomes.

The main caveat is that some higher-level behaviors still assume a fixed square arena via `ARENA_SIZE`, while the level system now supports arbitrary polygons. That means AI avoidance and projectile cleanup are not fully aligned with the actual map bounds.

## Gameplay Design Assessment

The RPM system is the clearest design anchor in the project. It is doing several jobs at once:

- health/resource bar
- damage amplifier
- pacing system
- tension system
- reward balancing system through pickup diminishing returns

That is a strong design foundation because it gives the whole game one unifying language. Several modules reinforce that well:

- `src/player.ts` handles sprint drain, collision damage, zone drain, overcharge behavior, and critical-state presentation.
- `src/hud.ts` visualizes RPM in a way that supports the mechanic rather than just displaying a number.
- pickups and hyper pickups create useful short-term risk/reward decisions.

The enemy roster also shows good range. Turrets, robots, spinners, slugworms, and multiple bosses suggest the project already has enough mechanical variety to support deeper balancing and progression work.

## Concrete Findings

### 1. Default level selection points to an empty map

`src/game.ts` currently sets:

- `currentLevel = level3`

`src/levels/level3.json` contains geometry but `0` entities, while:

- `level1` has 23 entities
- `level2` has 11 entities

So the default startup experience is likely an empty arena with no encounter content. That is fine for layout testing, but not ideal as the default play experience.

### 2. Arena logic is more data-driven than AI logic

Arena geometry comes from level JSON, but multiple enemy and projectile systems still depend on `ARENA_SIZE` from `src/constants.ts`. This shows up in:

- enemy wall avoidance
- boss movement clamping
- projectile wall culling

This creates a mismatch between the world described by level data and the world assumed by combat logic.

### 3. `src/game.ts` is the main scaling pressure point

The codebase is modular, but the game loop/orchestration file still owns too much policy:

- permanent collision registrations
- permanent proximity registrations
- entity spawning
- per-system update ordering
- death/reward handling
- reset lifecycle

This file is currently the project’s de facto gameplay director. That is workable, but it is the clearest source of future maintenance friction.

### 4. Build health is currently good

A production build completed successfully during this review with `npm run build`.

Notable output:

- JS bundle: about 722 kB minified
- GLB model: about 39.2 MB
- Vite warned that some chunks exceed 500 kB

So the code compiles, but asset and bundle size are already worth watching.

### 5. The spinner model is very large for web delivery

The generated build includes:

- `spinner.glb` at about 39 MB

That is unusually heavy for a browser game asset and is likely to dominate startup/load time more than the code itself.

### 6. Automated testing is not present

I did not find a test suite, and `package.json` only exposes:

- `dev`
- `build`

This is common for gameplay prototypes, but with the number of interacting systems now present, a small amount of automated verification would pay off quickly.

## Strengths

- Strong central mechanic with RPM as a unifying gameplay language.
- Good modular split between rendering, physics, player logic, enemies, and effects.
- Custom physics is appropriate for the game and easier to tune than a generic engine.
- Visual feedback is unusually polished for the project stage.
- Level geometry is already data-driven.
- Boss/content ambition is high, which gives the project a strong identity.

## Main Risks

- Content growth will keep increasing pressure on `src/game.ts`.
- Arena-size assumptions can drift away from actual level data.
- Large assets may make web delivery feel slow.
- Lack of tests means regressions in collision/RPM interactions will be hard to catch early.
- Some systems still rely on global arrays and index-based assumptions, especially the idea that `collidables[0]` is always the player.

That last point is important: it works, but it is a fragile convention. The architecture would be safer if “player” were identified by role/tag rather than array position.

## Recommended Next Steps

### High Priority

1. Change the default playable level from `level3` to a content-bearing level, or add entities to `level3`.
2. Move arena-bound queries away from `ARENA_SIZE` and toward level-derived bounds or wall data.
3. Break `src/game.ts` into a few higher-level modules such as:
   - spawn/content bootstrap
   - combat rules registration
   - death/reward resolution
   - main loop sequencing

### Medium Priority

1. Introduce a content registry so new entity types do not require repeated switch/case edits.
2. Add a few automated checks around:
   - level parsing
   - collision math invariants
   - spawn/reset behavior
   - RPM pickup formulas
3. Compress or replace the 39 MB spinner asset.

### Lower Priority But Valuable

1. Add a small README describing setup, Node version, controls, and current level options.
2. Add developer-facing notes on how to add a new entity type end to end.
3. Consider lazy-loading heavy assets or code-splitting if load time becomes a problem.

## Overall Verdict

This is a promising and surprisingly feature-rich gameplay codebase. The project already has a real mechanical identity, a coherent architecture for its size, and several signs of craft in the feedback systems and combat presentation. The main job now is not “make it possible,” because that part is already working. The main job is to keep growth sustainable by moving more gameplay policy out of `src/game.ts`, aligning AI/world assumptions with level data, and reducing delivery weight.

In short: the project is past prototype novelty and into “worth stabilizing” territory.
