import * as THREE from 'three';
import { scene } from './renderer';
import { getLightPoolSize } from './settings';

// Aura PointLights live forever at scene root. Three keys its program cache
// on NUM_POINT_LIGHTS — adding or removing a light from the scene forces
// every visible lit material to recompile. The old pattern parented each
// spinner's aura light to its tiltGroup, so killing an enemy removed a
// light and triggered a 30+ program recompile cascade. The pool keeps a
// fixed bank of lights in the scene; acquire/release just toggles
// intensity and sets a color.
//
// Pool size matters: every PointLight in the scene costs an iteration of
// the per-pixel shader light loop, even if intensity is 0. The user-facing
// "Light pool size" setting picks between performance and richness — 0 means
// "no aura on anyone, including the player."

const pool: THREE.PointLight[] = [];
const inUse = new Set<THREE.PointLight>();
let initialized = false;

function ensurePool(): void {
  if (initialized) return;
  initialized = true;
  const size = getLightPoolSize();
  for (let i = 0; i < size; i++) {
    const light = new THREE.PointLight(0xffffff, 0, 10, 1.8);
    light.castShadow = false;
    light.position.set(0, -200, 0);
    scene.add(light);
    pool.push(light);
  }
}

export function acquireAuraLight(color: THREE.ColorRepresentation): THREE.PointLight | null {
  ensurePool();
  for (const light of pool) {
    if (!inUse.has(light)) {
      inUse.add(light);
      light.color.set(color);
      return light;
    }
  }
  // Pool exhausted. Don't grow — that would add a new PointLight to the
  // scene and force every visible lit material to recompile. Skip the aura
  // light for this spinner instead. (Pool is sized for player + a few
  // enemies; if the user lowered the slider, they explicitly accepted this.)
  return null;
}

export function releaseAuraLight(light: THREE.PointLight | null): void {
  if (!light) return;
  light.intensity = 0;
  light.position.set(0, -200, 0);
  inUse.delete(light);
}

/** Force-release every acquired light. Called when a level is reset. */
export function resetAuraLightPool(): void {
  for (const light of pool) {
    light.intensity = 0;
    light.position.set(0, -200, 0);
  }
  inUse.clear();
}

/** Zero all pool lights immediately. Called when the lights-disabled toggle is switched on. */
export function zeroAllAuraLights(): void {
  for (const light of pool) {
    light.intensity = 0;
  }
}

/**
 * Refresh a spinner's aura light reference if the pool was empty when its
 * createTop() ran. Returns the now-acquired light (or null if the pool is
 * still too small). Used by the player at level-start so growing the pool
 * via the slider gives the player back its aura.
 */
export function refreshAuraLight(
  motionVisuals: { auraLight: THREE.PointLight | null },
  color: THREE.ColorRepresentation,
): THREE.PointLight | null {
  if (motionVisuals.auraLight) return motionVisuals.auraLight;
  const acquired = acquireAuraLight(color);
  if (acquired) {
    acquired.intensity = 15.25;
    acquired.distance = 10;
    acquired.decay = 1.8;
    motionVisuals.auraLight = acquired;
  }
  return acquired;
}

/**
 * Resize the pool to match the current setting. Adds lights to scene if the
 * pool is too small, removes free ones if too big. Called at level-start so
 * the slider's value takes effect on the next play without a page reload.
 *
 * Resizing changes NUM_POINT_LIGHTS, which forces a re-link of every
 * visible lit shader — but level-start runs prewarm right after, so those
 * compiles fold into the loading screen.
 */
export function syncAuraLightPoolToSetting(): void {
  const target = getLightPoolSize();
  // Grow.
  while (pool.length < target) {
    const light = new THREE.PointLight(0xffffff, 0, 10, 1.8);
    light.castShadow = false;
    light.position.set(0, -200, 0);
    scene.add(light);
    pool.push(light);
  }
  // Shrink — only remove lights that aren't currently in use.
  for (let i = pool.length - 1; i >= 0 && pool.length > target; i -= 1) {
    const light = pool[i];
    if (inUse.has(light)) continue;
    scene.remove(light);
    light.dispose();
    pool.splice(i, 1);
  }
  initialized = true;
}
