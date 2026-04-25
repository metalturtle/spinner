import * as THREE from 'three';
import { LevelData } from '../data/LevelData';
import type { EntityData } from '../data/Entity';

function parseNumber(value: string | undefined, fallback: number, min?: number): number {
  const parsed = parseFloat(value ?? '');
  if (!Number.isFinite(parsed)) return fallback;
  return min === undefined ? parsed : Math.max(min, parsed);
}

function parseColor(value: string | undefined, fallback: string): THREE.ColorRepresentation {
  return value && value.trim() ? value : fallback;
}

export class LightingPreviewManager {
  private scene: THREE.Scene;
  private levelData: LevelData;
  private root = new THREE.Group();
  private ambientLight = new THREE.AmbientLight(0xffffff, 0.18);
  private directionalLight = new THREE.DirectionalLight(0xdde6ff, 0.9);
  private enabled = false;
  private lightRoots = new Map<string, THREE.Object3D>();

  constructor(scene: THREE.Scene, levelData: LevelData) {
    this.scene = scene;
    this.levelData = levelData;

    this.directionalLight.position.set(8, 12, 18);
    this.root.add(this.ambientLight);
    this.root.add(this.directionalLight);
    this.root.visible = false;
    this.scene.add(this.root);

    levelData.on('entity-added', (entity: EntityData) => this.onEntityAdded(entity));
    levelData.on('entity-removed', (entity: EntityData) => this.onEntityRemoved(entity.id));
    levelData.on('entity-changed', (entity: EntityData) => this.onEntityChanged(entity));
    levelData.on('level-loaded', () => this.rebuildAll());
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.root.visible = enabled;
    if (enabled) {
      this.rebuildAll();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private onEntityAdded(entity: EntityData): void {
    if (!this.enabled || entity.type !== 'light_point') return;
    this.addLight(entity);
  }

  private onEntityChanged(entity: EntityData): void {
    if (entity.type !== 'light_point') {
      this.onEntityRemoved(entity.id);
      return;
    }

    if (!this.enabled) return;
    this.onEntityRemoved(entity.id);
    this.addLight(entity);
  }

  private onEntityRemoved(id: string): void {
    const root = this.lightRoots.get(id);
    if (!root) return;
    this.root.remove(root);
    this.lightRoots.delete(id);
  }

  private rebuildAll(): void {
    for (const id of [...this.lightRoots.keys()]) {
      this.onEntityRemoved(id);
    }
    if (!this.enabled) return;

    for (const entity of this.levelData.entities) {
      if (entity.type === 'light_point') {
        this.addLight(entity);
      }
    }
  }

  private addLight(entity: EntityData): void {
    const props = entity.properties;
    const color = parseColor(props.color, '#ffd080');
    const intensity = parseNumber(props.intensity, 2.0, 0);
    const range = parseNumber(props.range, 8, 0.5);
    const decay = parseNumber(props.decay, 1.5, 0);
    const height = parseNumber(props.height, 1.5, 0);

    const root = new THREE.Group();
    root.position.set(entity.position.x, entity.position.y, height);

    const light = new THREE.PointLight(color, intensity, range, decay);
    light.castShadow = false;
    root.add(light);

    this.lightRoots.set(entity.id, root);
    this.root.add(root);
  }
}
