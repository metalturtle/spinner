# Performance Profiling Guide

## Goal

This project already has an in-game FPS readout, but FPS only tells us that the game is slow. Profiling tells us why it is slow and which part of the frame is taking the time.

For this game, the best workflow is:

1. Use the browser profiler to see whether the frame is CPU-bound or render-bound.
2. Add lightweight timings inside the game loop to break the frame into named phases.
3. Compare the biggest phase over several seconds in a slow gameplay scenario.

## Fastest Way To Start

Use Chrome DevTools or Edge DevTools:

1. Run the game locally.
2. Open DevTools.
3. Go to the **Performance** tab.
4. Start recording.
5. Play the game for 5-10 seconds in the slow scene.
6. Stop recording.

Look at the main categories:

- `Scripting`: game logic, AI, collision, effects updates
- `Rendering`: WebGL draw work, scene rendering cost
- `Painting / Layout`: DOM updates such as HUD work

Interpretation:

- If `Scripting` is dominant, the JavaScript game loop is the main bottleneck.
- If `Rendering` is dominant, the scene is too expensive to draw.
- If `Painting / Layout` is dominant, HUD or DOM updates are doing too much work.

## Where The Frame Time Lives

The main loop is in [src/game.ts](/Users/metalturtle/Documents/projects/game/spinner/src/game.ts:596). That is the best place to split frame time into named buckets.

Good profiling buckets for this project:

- entity updates and AI
- movement
- collision detection and resolution
- collision handlers
- proximity checks
- RPM updates
- death checks
- visual updates
- renderer draw call

Those correspond closely to the existing frame structure:

- `entityUpdateSystem(...)`
- enemy/boss/robot/slug/turret update loops
- `movementSystem(...)`
- `runCollisions()`
- `collisionSystem(...)`
- `proximitySystem()`
- `rpmSystem(...)`
- `playerRpmHooks(...)`
- death-check helpers
- visual update helpers
- `renderer.render(scene, camera)`

## Recommended In-Code Profiling

Use `performance.now()` around each major phase in `animate()`.

Example:

```ts
const t0 = performance.now();
movementSystem(delta);
const t1 = performance.now();
profile.movement += t1 - t0;
```

Then repeat that pattern for the rest of the major phases:

```ts
const tAi0 = performance.now();
entityUpdateSystem(delta);
// other AI loops...
const tAi1 = performance.now();
profile.ai += tAi1 - tAi0;

const tCol0 = performance.now();
const { wallHits, circleHits } = runCollisions();
const tCol1 = performance.now();
profile.collisions += tCol1 - tCol0;

const tRender0 = performance.now();
renderer.render(scene, camera);
const tRender1 = performance.now();
profile.render += tRender1 - tRender0;
```

A good pattern is to accumulate timings for one second, then print averages:

- average ms per frame for each phase
- percent of total frame time for each phase

That avoids noisy per-frame logs.

## What To Measure First In This Codebase

The most useful first measurements are:

### 1. Collision cost

The collision layer is in [src/physics.ts](/Users/metalturtle/Documents/projects/game/spinner/src/physics.ts:1).

Start by measuring:

- `runCollisions()`
- `collisionSystem(circleHits)`
- `proximitySystem()`

Why:

- `runCollisions()` checks all collidables against walls and each other.
- More enemies and spawned entities increase pair-count quickly.

### 2. AI update cost

The AI work is spread across the frame in [src/game.ts](/Users/metalturtle/Documents/projects/game/spinner/src/game.ts:618).

Start by grouping:

- enemy spinners
- robots
- hive boss and flock
- slugs
- turrets
- siege engine / dreadnought

Why:

- AI often looks cheap per entity but becomes expensive when many entities are active.

### 3. Render cost

Measure `renderer.render(...)` separately.

Why:

- If render time is large even when scripting is modest, the scene is GPU-bound or draw-call heavy.

### 4. Visual/effects update cost

Measure these together at first:

- `updateSparks(time)`
- `updateGooDecals(time)`
- `updateTrails(...)`
- entity visual updates

Why:

- They run every frame and can quietly add up even if each function looks small.

## Good Debugging Technique

If the browser profile shows a slow frame but the cause is still unclear, temporarily disable whole feature groups one at a time and watch FPS:

- skip AI
- skip collisions
- skip projectiles
- skip effects
- skip visual updates
- skip render

If disabling one section causes a large FPS jump, that section is the right family to profile more deeply.

This is often faster than guessing based on code inspection alone.

## CPU-Bound Vs Render-Bound Checklist

Signs you are CPU-bound:

- high `Scripting` time in DevTools
- `runCollisions()` or AI buckets are large
- FPS improves a lot when gameplay systems are disabled

Signs you are render-bound:

- `renderer.render(...)` is one of the biggest timings
- DevTools shows render-heavy frames
- FPS improves when scene complexity is reduced but not when logic is removed

## Suggested Next Instrumentation

If you want deeper profiling later, the most useful next step is an in-game profiler overlay that shows:

- FPS
- total frame ms
- AI ms
- collision ms
- render ms
- effects ms

That makes it easy to test slow scenes without keeping DevTools open.

## Summary

For this project, the most practical profiling workflow is:

1. Record a slow scene in the browser Performance tab.
2. Confirm whether the bottleneck is scripting or rendering.
3. Add `performance.now()` timings to the major phases in `animate()`.
4. Watch which phase consumes the most frame time over a few seconds.
5. Optimize only after a clear hotspot appears.
