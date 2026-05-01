import * as THREE from 'three';
import { LevelData } from '../data/LevelData';
import type { EntityData } from '../data/Entity';
import type { PolygonData, PolygonPoint } from '../data/Polygon';
import type { CircleData } from '../data/Circle';

function parseNumber(value: string | undefined, fallback: number, min?: number): number {
  const parsed = parseFloat(value ?? '');
  if (!Number.isFinite(parsed)) return fallback;
  return min === undefined ? parsed : Math.max(min, parsed);
}

function parseColor(value: string | undefined, fallback: string): THREE.ColorRepresentation {
  return value && value.trim() ? value : fallback;
}

function parseBoolean(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

function isPointInPolygon(point: { x: number; y: number }, vertices: PolygonPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

interface LightingTarget {
  ambientColor: THREE.ColorRepresentation;
  ambientIntensity: number;
  directionalColor: THREE.ColorRepresentation;
  directionalIntensity: number;
}

interface LightingZone {
  contains(point: { x: number; y: number }): boolean;
  target: LightingTarget;
  transitionSeconds: number;
  priority: number;
}

function hasLightingZoneProperties(properties: Record<string, string>): boolean {
  if (properties.lightEnabled !== undefined) return parseBoolean(properties.lightEnabled);
  return properties.lightAmbientIntensity !== undefined
    || properties.lightDirectionalIntensity !== undefined;
}

function createLightingTarget(properties: Record<string, string>): LightingTarget {
  return {
    ambientColor: parseColor(properties.lightAmbientColor, '#ffffff'),
    ambientIntensity: parseNumber(properties.lightAmbientIntensity, 0.18, 0),
    directionalColor: parseColor(properties.lightDirectionalColor, '#dde6ff'),
    directionalIntensity: parseNumber(properties.lightDirectionalIntensity, 0.9, 0),
  };
}

function buildPolygonLightingZone(poly: PolygonData): LightingZone | null {
  if (poly.layer !== 'trigger' || poly.vertices.length < 3) return null;
  if (!hasLightingZoneProperties(poly.properties)) return null;

  const outer = poly.vertices;
  const holes = poly.holes ?? [];
  return {
    target: createLightingTarget(poly.properties),
    transitionSeconds: parseNumber(poly.properties.lightTransition, 0.75, 0.01),
    priority: parseNumber(poly.properties.lightPriority, 0),
    contains(point) {
      if (!isPointInPolygon(point, outer)) return false;
      return !holes.some((hole) => hole.length >= 3 && isPointInPolygon(point, hole));
    },
  };
}

function buildCircleLightingZone(circle: CircleData): LightingZone | null {
  if (circle.layer !== 'trigger') return null;
  if (!hasLightingZoneProperties(circle.properties)) return null;

  const center = circle.center;
  const radiusSq = circle.radius * circle.radius;
  return {
    target: createLightingTarget(circle.properties),
    transitionSeconds: parseNumber(circle.properties.lightTransition, 0.75, 0.01),
    priority: parseNumber(circle.properties.lightPriority, 0),
    contains(point) {
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      return dx * dx + dy * dy <= radiusSq;
    },
  };
}

export class LightingPreviewManager {
  private scene: THREE.Scene;
  private levelData: LevelData;
  private root = new THREE.Group();
  private ambientLight = new THREE.AmbientLight(0xffffff, 0.18);
  private directionalLight = new THREE.DirectionalLight(0xdde6ff, 0.9);
  private enabled = false;
  private lightRoots = new Map<string, THREE.Object3D>();
  private lightingZones: LightingZone[] = [];
  private currentAmbientColor = new THREE.Color('#ffffff');
  private currentDirectionalColor = new THREE.Color('#dde6ff');
  private targetAmbientColor = new THREE.Color('#ffffff');
  private targetDirectionalColor = new THREE.Color('#dde6ff');
  private currentAmbientIntensity = 0.18;
  private currentDirectionalIntensity = 0.9;
  private targetAmbientIntensity = 0.18;
  private targetDirectionalIntensity = 0.9;
  private transitionSeconds = 0.75;

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
    levelData.on('polygon-added', () => this.rebuildZones());
    levelData.on('polygon-removed', () => this.rebuildZones());
    levelData.on('polygon-changed', () => this.rebuildZones());
    levelData.on('circle-added', () => this.rebuildZones());
    levelData.on('circle-removed', () => this.rebuildZones());
    levelData.on('circle-changed', () => this.rebuildZones());
    levelData.on('level-loaded', () => this.rebuildAll());
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.root.visible = enabled;
    if (enabled) {
      this.rebuildAll();
      this.applyCurrentLighting();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  update(focusPoint: { x: number; y: number }, delta: number): void {
    if (!this.enabled) return;

    let activeZone: LightingZone | null = null;
    for (const zone of this.lightingZones) {
      if (!zone.contains(focusPoint)) continue;
      if (!activeZone || zone.priority > activeZone.priority) activeZone = zone;
    }

    if (activeZone) {
      this.targetAmbientColor.set(activeZone.target.ambientColor);
      this.targetAmbientIntensity = activeZone.target.ambientIntensity;
      this.targetDirectionalColor.set(activeZone.target.directionalColor);
      this.targetDirectionalIntensity = activeZone.target.directionalIntensity;
      this.transitionSeconds = activeZone.transitionSeconds;
    } else {
      this.targetAmbientColor.set('#ffffff');
      this.targetAmbientIntensity = 0.18;
      this.targetDirectionalColor.set('#dde6ff');
      this.targetDirectionalIntensity = 0.9;
      this.transitionSeconds = 0.75;
    }

    const t = 1 - Math.exp(-delta / Math.max(0.01, this.transitionSeconds));
    this.currentAmbientColor.lerp(this.targetAmbientColor, t);
    this.currentDirectionalColor.lerp(this.targetDirectionalColor, t);
    this.currentAmbientIntensity += (this.targetAmbientIntensity - this.currentAmbientIntensity) * t;
    this.currentDirectionalIntensity += (this.targetDirectionalIntensity - this.currentDirectionalIntensity) * t;
    this.applyCurrentLighting();
  }

  private applyCurrentLighting(): void {
    this.ambientLight.color.copy(this.currentAmbientColor);
    this.ambientLight.intensity = this.currentAmbientIntensity;
    this.directionalLight.color.copy(this.currentDirectionalColor);
    this.directionalLight.intensity = this.currentDirectionalIntensity;
  }

  private onEntityAdded(entity: EntityData): void {
    if (!this.enabled || !this.isLightEmitterEntity(entity.type)) return;
    this.addLight(entity);
  }

  private onEntityChanged(entity: EntityData): void {
    if (!this.isLightEmitterEntity(entity.type)) {
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
    this.rebuildZones();
    if (!this.enabled) return;

    for (const entity of this.levelData.entities) {
      if (this.isLightEmitterEntity(entity.type)) {
        this.addLight(entity);
      }
    }
  }

  private rebuildZones(): void {
    this.lightingZones = [
      ...this.levelData.polygons.map((poly) => buildPolygonLightingZone(poly)).filter((zone): zone is LightingZone => Boolean(zone)),
      ...this.levelData.circles.map((circle) => buildCircleLightingZone(circle)).filter((zone): zone is LightingZone => Boolean(zone)),
    ];
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

  private isLightEmitterEntity(type: string): boolean {
    return type === 'light_point' || type === 'fire_torch';
  }
}
