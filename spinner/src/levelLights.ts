import * as THREE from 'three';
import { lvPos, type LevelData, type LevelEntity } from './levelLoader';
import { registerTopDownCullable } from './sceneCulling';

const levelLightRoots: THREE.Object3D[] = [];
const cullHandles = new WeakMap<THREE.Object3D, () => void>();

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
  cullHandles.set(root, registerTopDownCullable(root, range));

  return root;
}

export function setupLevelLights(scene: THREE.Scene, level: LevelData): void {
  clearLevelLights(scene);

  for (const entity of level.entities) {
    if (entity.type !== 'light_point') continue;
    if (hasSpawnTrigger(entity)) continue;
    const root = createLevelPointLightRoot(entity);
    levelLightRoots.push(root);
    scene.add(root);
  }
}

export function clearLevelLights(scene: THREE.Scene): void {
  while (levelLightRoots.length > 0) {
    const root = levelLightRoots.pop()!;
    cullHandles.get(root)?.();
    cullHandles.delete(root);
    scene.remove(root);
  }
}
