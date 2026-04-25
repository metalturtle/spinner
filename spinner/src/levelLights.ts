import * as THREE from 'three';
import type { LevelData, LevelEntity } from './levelLoader';

const levelLightRoots: THREE.Object3D[] = [];

function parseNumber(value: unknown, fallback: number, min?: number): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return min === undefined ? parsed : Math.max(min, parsed);
}

function parseColor(value: unknown, fallback: string): THREE.ColorRepresentation {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function createPointLight(entity: LevelEntity): THREE.Object3D {
  const props = entity.properties ?? {};
  const color = parseColor(props.color, '#ffd080');
  const intensity = parseNumber(props.intensity, 2.0, 0);
  const range = parseNumber(props.range, 8, 0.5);
  const decay = parseNumber(props.decay, 1.5, 0);
  const height = parseNumber(props.height, 1.5, 0);

  const root = new THREE.Group();
  root.position.set(entity.position.x, height, entity.position.y);

  const light = new THREE.PointLight(color, intensity, range, decay);
  light.castShadow = false;
  root.add(light);

  return root;
}

export function setupLevelLights(scene: THREE.Scene, level: LevelData): void {
  clearLevelLights(scene);

  for (const entity of level.entities) {
    if (entity.type !== 'light_point') continue;
    const root = createPointLight(entity);
    levelLightRoots.push(root);
    scene.add(root);
  }
}

export function clearLevelLights(scene: THREE.Scene): void {
  while (levelLightRoots.length > 0) {
    const root = levelLightRoots.pop()!;
    scene.remove(root);
  }
}
