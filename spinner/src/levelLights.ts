import * as THREE from 'three';
import { lvPos, type LevelData, type LevelEntity } from './levelLoader';
import { registerTopDownCullable } from './sceneCulling';
import { getLightsDisabled } from './settings';

interface LevelLightState {
  light: THREE.PointLight;
  baseIntensity: number;
  activated: boolean;
}
const levelLightStates: LevelLightState[] = [];

const levelLightRoots: THREE.Object3D[] = [];
const cullHandles = new WeakMap<THREE.Object3D, () => void>();
// Lights belonging to encounter-locked entities are spawned at level load
// with intensity 0 so they don't change NUM_POINT_LIGHTS when the trigger
// fires. Map: triggerId -> activate callbacks that restore the configured
// intensity. Toggling NUM_POINT_LIGHTS forces every lit material in view to
// recompile, which used to stutter for 100s of ms when entering a triggered
// room.
const triggeredLightActivators = new Map<string, Array<() => void>>();

function parseNumber(value: unknown, fallback: number, min?: number): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return min === undefined ? parsed : Math.max(min, parsed);
}

function parseColor(value: unknown, fallback: string): THREE.ColorRepresentation {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function hasSpawnTrigger(entity: LevelEntity): boolean {
  const triggerId = entity.properties?.spawnTrigger;
  return typeof triggerId === 'string' && triggerId.trim().length > 0;
}

export function createLevelPointLightRoot(entity: LevelEntity): THREE.Object3D {
  const props = entity.properties ?? {};
  const pos = lvPos(entity.position);
  const color = parseColor(props.color, '#ffd080');
  const intensity = parseNumber(props.intensity, 2.0, 0);
  const range = parseNumber(props.range, 8, 0.5);
  const decay = parseNumber(props.decay, 1.5, 0);
  const height = parseNumber(props.height, 1.5, 0);

  const root = new THREE.Group();
  root.position.set(pos.x, height, pos.z);

  const light = new THREE.PointLight(color, intensity, range, decay);
  light.castShadow = false;
  root.add(light);
  // Toggle intensity instead of visibility when culled — visibility changes
  // Three's NUM_POINT_LIGHTS define and force every lit material to recompile.
  cullHandles.set(root, registerTopDownCullable(root, range, root, (active) => {
    light.intensity = (!getLightsDisabled() && active) ? intensity : 0;
  }));

  return root;
}

export function setupLevelLights(scene: THREE.Scene, level: LevelData): void {
  clearLevelLights(scene);

  for (const entity of level.entities) {
    if (entity.type !== 'light_point') continue;
    const triggerId = hasSpawnTrigger(entity)
      ? String(entity.properties!.spawnTrigger)
      : null;
    const root = createLevelPointLightRoot(entity);
    levelLightRoots.push(root);
    scene.add(root);

    const light = root.children.find((c) => (c as THREE.Light).isLight) as THREE.PointLight | undefined;
    if (!light) continue;

    if (triggerId) {
      const targetIntensity = light.intensity;
      const state: LevelLightState = { light, baseIntensity: targetIntensity, activated: false };
      levelLightStates.push(state);
      light.intensity = 0;
      const list = triggeredLightActivators.get(triggerId) ?? [];
      list.push(() => {
        state.activated = true;
        light.intensity = getLightsDisabled() ? 0 : targetIntensity;
      });
      triggeredLightActivators.set(triggerId, list);
    } else {
      levelLightStates.push({ light, baseIntensity: light.intensity, activated: true });
      if (getLightsDisabled()) light.intensity = 0;
    }
  }
}

/**
 * Re-applies intensities after the lights-disabled toggle changes. Restores
 * activated lights to their base intensity (cull system will re-zero
 * off-screen ones on the next cull pass).
 */
export function refreshLevelLightIntensities(): void {
  const disabled = getLightsDisabled();
  for (const state of levelLightStates) {
    state.light.intensity = (!disabled && state.activated) ? state.baseIntensity : 0;
  }
}

/** Activate every light gated on this trigger. Called from encounter activation. */
export function activateTriggeredLights(triggerId: string): void {
  const list = triggeredLightActivators.get(triggerId);
  if (!list) return;
  for (const fn of list) fn();
  triggeredLightActivators.delete(triggerId);
}

export function clearLevelLights(scene: THREE.Scene): void {
  while (levelLightRoots.length > 0) {
    const root = levelLightRoots.pop()!;
    cullHandles.get(root)?.();
    cullHandles.delete(root);
    scene.remove(root);
  }
  levelLightStates.length = 0;
  triggeredLightActivators.clear();
}
