import * as THREE from 'three';
import { scene } from './renderer';
import { getLightPoolSize, getLightsDisabled } from './settings';

const pool: THREE.PointLight[] = [];
const inUse = new Set<THREE.PointLight>();
let initialized = false;

function getTargetPoolSize(): number {
  // Fireflies only need a few averaged cluster lights. Keep this pool much
  // smaller than the aura/projectile pools so the extra NUM_POINT_LIGHTS
  // cost stays contained even when the user turns the slider up.
  return Math.min(4, Math.max(0, Math.ceil(getLightPoolSize() * 0.5)));
}

function ensurePool(): void {
  if (initialized) return;
  initialized = true;
  const size = getTargetPoolSize();
  for (let i = 0; i < size; i += 1) {
    const light = new THREE.PointLight(0x65d6ff, 0, 6, 1.7);
    light.castShadow = false;
    light.position.set(0, -200, 0);
    scene.add(light);
    pool.push(light);
  }
}

export function acquireFireflyLight(color: THREE.ColorRepresentation = 0x65d6ff): THREE.PointLight | null {
  if (getLightsDisabled()) return null;
  ensurePool();
  for (const light of pool) {
    if (inUse.has(light)) continue;
    inUse.add(light);
    light.color.set(color);
    return light;
  }
  return null;
}

export function releaseFireflyLight(light: THREE.PointLight | null): void {
  if (!light) return;
  light.intensity = 0;
  light.position.set(0, -200, 0);
  inUse.delete(light);
}

export function getActiveFireflyLights(): readonly THREE.PointLight[] {
  return Array.from(inUse);
}

export function zeroAllFireflyLights(): void {
  for (const light of pool) {
    light.intensity = 0;
  }
}

export function syncFireflyLightPoolToSetting(): void {
  const target = getTargetPoolSize();
  while (pool.length < target) {
    const light = new THREE.PointLight(0x65d6ff, 0, 6, 1.7);
    light.castShadow = false;
    light.position.set(0, -200, 0);
    scene.add(light);
    pool.push(light);
  }
  for (let i = pool.length - 1; i >= 0 && pool.length > target; i -= 1) {
    const light = pool[i];
    if (inUse.has(light)) continue;
    scene.remove(light);
    light.dispose();
    pool.splice(i, 1);
  }
  initialized = true;
}
