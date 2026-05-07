import * as THREE from 'three';
import { lvZ, type LevelCircle, type LevelData, type LevelPolygon } from './levelLoader';
import { registerTopDownCullable } from './sceneCulling';

const TAU = Math.PI * 2;
// const DROP_COLOR_FALLBACK = '#8fdcff';
const DROP_COLOR_FALLBACK = '#00dcff00';
const SPLASH_COLOR_FALLBACK = '#dff6ff';
const FLOOR_Y = 0.03;
const DROP_BASE_THICKNESS = 0.04;
const DROP_STREAK_LENGTH = 0.24;
const SPLASH_THICKNESS = 0.012;
const MIN_DROPS = 18;
const MAX_DROPS = 60;

const tempPosition = new THREE.Vector3();
const tempScale = new THREE.Vector3();
const tempMatrix = new THREE.Matrix4();
const tempColor = new THREE.Color();
const identityRotation = new THREE.Quaternion();

interface ZoneShape {
  center: { x: number; z: number };
  area: number;
  radius: number;
  contains: (point: { x: number; z: number }) => boolean;
  samplePoint: (maxDistanceRatio?: number) => { x: number; z: number };
}

interface SprinklerDrop {
  x: number;
  z: number;
  phaseOffset: number;
  speed: number;
  size: number;
  streakLength: number;
  splashSize: number;
  brightness: number;
  wobblePhase: number;
  driftPhase: number;
  driftAmount: number;
  radialRatio: number;
  currentCycle: number;
}

export interface SprinklerZoneVisual {
  root: THREE.Group;
  dropsMesh: THREE.InstancedMesh;
  splashesMesh: THREE.InstancedMesh;
  drops: SprinklerDrop[];
  ceilingHeight: number;
  density: number;
  splashOpacity: number;
  unregisterCull: () => void;
  dropColor: THREE.Color;
  splashColor: THREE.Color;
  contains: (point: { x: number; z: number }) => boolean;
  influenceAt: (point: { x: number; z: number }) => number;
  respawnDrop: (drop: SprinklerDrop) => void;
}

type SprinklerMode = 'uniform' | 'center_falloff';

function parseBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

function parseNumber(value: unknown, fallback: number, min?: number): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return min === undefined ? parsed : Math.max(min, parsed);
}

function parseColor(value: unknown, fallback: string): THREE.Color {
  try {
    return new THREE.Color(typeof value === 'string' && value.trim() ? value : fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

function isPointInPolygon(point: { x: number; z: number }, vertices: { x: number; z: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const zi = vertices[i].z;
    const xj = vertices[j].x;
    const zj = vertices[j].z;
    const intersects = ((zi > point.z) !== (zj > point.z))
      && (point.x < ((xj - xi) * (point.z - zi)) / ((zj - zi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonSignedArea(vertices: { x: number; z: number }[]): number {
  let area = 0;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    area += vertices[j].x * vertices[i].z - vertices[i].x * vertices[j].z;
  }
  return area * 0.5;
}

function hasSprinklerZoneProperties(props: Record<string, unknown> | undefined): boolean {
  if (props?.sprinklerEnabled !== undefined) return parseBoolean(props.sprinklerEnabled);
  return props?.sprinklerDensity !== undefined
    || props?.sprinklerMode !== undefined
    || props?.sprinklerFalloff !== undefined
    || props?.sprinklerCeilingHeight !== undefined
    || props?.sprinklerDropSpeed !== undefined
    || props?.sprinklerColor !== undefined;
}

function readSprinklerMode(value: unknown): SprinklerMode {
  return value === 'center_falloff' ? 'center_falloff' : 'uniform';
}

function buildPolygonShape(poly: LevelPolygon): ZoneShape | null {
  if (poly.layer !== 'trigger' || poly.vertices.length < 3) return null;
  if (!hasSprinklerZoneProperties(poly.properties)) return null;

  const outer = poly.vertices.map((vertex) => ({ x: vertex.x, z: lvZ(vertex.y) }));
  const holes = (poly.holes ?? []).map((hole) => hole.map((vertex) => ({ x: vertex.x, z: lvZ(vertex.y) })));

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const vertex of outer) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minZ = Math.min(minZ, vertex.z);
    maxZ = Math.max(maxZ, vertex.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return null;
  }

  const holeArea = holes.reduce((sum, hole) => sum + Math.abs(polygonSignedArea(hole)), 0);
  const area = Math.abs(polygonSignedArea(outer)) - holeArea;
  if (area <= 0.01) return null;

  const center = {
    x: (minX + maxX) * 0.5,
    z: (minZ + maxZ) * 0.5,
  };

  let radius = 0;
  for (const vertex of outer) {
    radius = Math.max(radius, Math.hypot(vertex.x - center.x, vertex.z - center.z));
  }
  for (const hole of holes) {
    for (const vertex of hole) {
      radius = Math.max(radius, Math.hypot(vertex.x - center.x, vertex.z - center.z));
    }
  }

  const contains = (point: { x: number; z: number }): boolean => {
    if (!isPointInPolygon(point, outer)) return false;
    return !holes.some((hole) => hole.length >= 3 && isPointInPolygon(point, hole));
  };

  return {
    center,
    area,
    radius,
    contains,
    samplePoint(maxDistanceRatio = 1) {
      const clampedRatio = THREE.MathUtils.clamp(maxDistanceRatio, 0.05, 1);
      for (let attempt = 0; attempt < 48; attempt += 1) {
        const point = {
          x: center.x + (Math.random() * 2 - 1) * (maxX - minX) * 0.5 * clampedRatio,
          z: center.z + (Math.random() * 2 - 1) * (maxZ - minZ) * 0.5 * clampedRatio,
        };
        if (!contains(point)) continue;
        return point;
      }
      return center;
    },
  };
}

function buildCircleShape(circle: LevelCircle): ZoneShape | null {
  if (circle.layer !== 'trigger' || circle.radius <= 0) return null;
  if (!hasSprinklerZoneProperties(circle.properties)) return null;

  const center = { x: circle.center.x, z: lvZ(circle.center.y) };
  return {
    center,
    area: Math.PI * circle.radius * circle.radius,
    radius: circle.radius,
    contains(point) {
      const dx = point.x - center.x;
      const dz = point.z - center.z;
      return dx * dx + dz * dz <= circle.radius * circle.radius;
    },
    samplePoint(maxDistanceRatio = 1) {
      const clampedRatio = THREE.MathUtils.clamp(maxDistanceRatio, 0.05, 1);
      const angle = Math.random() * TAU;
      const distance = Math.sqrt(Math.random()) * circle.radius * clampedRatio;
      return {
        x: center.x + Math.cos(angle) * distance,
        z: center.z + Math.sin(angle) * distance,
      };
    },
  };
}

function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined): void {
  if (Array.isArray(material)) {
    for (const entry of material) entry.dispose();
    return;
  }
  material?.dispose();
}

function createZoneVisual(
  scene: THREE.Scene,
  props: Record<string, unknown> | undefined,
  shape: ZoneShape,
): SprinklerZoneVisual {
  const density = parseNumber(props?.sprinklerDensity, 2.4, 0.15);
  const count = Math.max(MIN_DROPS, Math.min(MAX_DROPS, Math.round(shape.area * density)));
  const mode = readSprinklerMode(props?.sprinklerMode);
  const falloffStrength = parseNumber(props?.sprinklerFalloff, 1.6, 0.2);
  const ceilingHeight = parseNumber(props?.sprinklerCeilingHeight, 3.4, 0.75);
  const dropSpeed = parseNumber(props?.sprinklerDropSpeed, 1.9, 0.2);
  // const dropColor = parseColor(props?.sprinklerColor, DROP_COLOR_FALLBACK);
  const dropColor = parseColor(DROP_COLOR_FALLBACK, DROP_COLOR_FALLBACK);
  const splashColor = dropColor.clone().lerp(parseColor(undefined, SPLASH_COLOR_FALLBACK), 0.5);
// const splashColor = dropColor.clone()

  const root = new THREE.Group();
  root.position.set(shape.center.x, 0, shape.center.z);

  const respawnDrop = (drop: SprinklerDrop): void => {
    const radialRatio = mode === 'center_falloff'
      ? Math.pow(Math.random(), falloffStrength)
      : Math.sqrt(Math.random());
    const sampled = shape.samplePoint(radialRatio);
    const centerDistance = Math.hypot(sampled.x - shape.center.x, sampled.z - shape.center.z);
    const distanceRatio = shape.radius > 0.0001
      ? THREE.MathUtils.clamp(centerDistance / shape.radius, 0, 1)
      : 0;
    const falloffWeight = mode === 'center_falloff'
      ? Math.pow(1 - distanceRatio, Math.max(0.35, falloffStrength * 0.65))
      : 1;

    drop.x = sampled.x - shape.center.x;
    drop.z = sampled.z - shape.center.z;
    drop.radialRatio = distanceRatio;
    drop.size = (0.04 + Math.random() * 0.035) * (0.8 + falloffWeight * 0.24);
    drop.streakLength = (DROP_STREAK_LENGTH + Math.random() * 0.16) * (0.84 + falloffWeight * 0.2);
    drop.splashSize = (0.11 + Math.random() * 0.08) * (0.8 + falloffWeight * 0.35);
    drop.brightness = (0.72 + Math.random() * 0.28) * (0.68 + falloffWeight * 0.42);
    drop.wobblePhase = Math.random() * TAU;
    drop.driftPhase = Math.random() * TAU;
    drop.driftAmount = 0.012 + Math.random() * 0.045;
  };

  const dropGeometry = new THREE.BoxGeometry(1, 1, 1);
  const dropMaterial = new THREE.MeshBasicMaterial({
    color: dropColor,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dropsMesh = new THREE.InstancedMesh(dropGeometry, dropMaterial, count);
  dropsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dropsMesh.frustumCulled = false;
  root.add(dropsMesh);

  const splashGeometry = new THREE.BoxGeometry(1, 1, 1);
  const splashMaterial = new THREE.MeshBasicMaterial({
    color: splashColor,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const splashesMesh = new THREE.InstancedMesh(splashGeometry, splashMaterial, count);
  splashesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  splashesMesh.frustumCulled = false;
  root.add(splashesMesh);

  const drops: SprinklerDrop[] = [];
  for (let i = 0; i < count; i += 1) {
    const drop: SprinklerDrop = {
      x: 0,
      z: 0,
      phaseOffset: Math.random(),
      speed: dropSpeed * (0.78 + Math.random() * 0.46),
      size: 0.05,
      streakLength: DROP_STREAK_LENGTH,
      splashSize: 0.12,
      brightness: 1,
      wobblePhase: 0,
      driftPhase: 0,
      driftAmount: 0.02,
      radialRatio: 0,
      currentCycle: -1,
    };
    respawnDrop(drop);
    drops.push(drop);

    tempColor.copy(dropColor).multiplyScalar(0.82 + drop.brightness * 0.3);
    dropsMesh.setColorAt(i, tempColor);
    splashesMesh.setColorAt(i, new THREE.Color(0x000000));
  }
  dropsMesh.instanceColor!.needsUpdate = true;
  splashesMesh.instanceColor!.needsUpdate = true;

  scene.add(root);
  const unregisterCull = registerTopDownCullable(root, shape.radius + 1.2);

  return {
    root,
    dropsMesh,
    splashesMesh,
    drops,
    ceilingHeight,
    density,
    splashOpacity: 1,
    unregisterCull,
    dropColor,
    splashColor,
    contains: shape.contains,
    respawnDrop,
    influenceAt(point) {
      if (!shape.contains(point)) return 0;
      if (mode === 'uniform' || shape.radius <= 0.0001) return 1;
      const dx = point.x - shape.center.x;
      const dz = point.z - shape.center.z;
      const distanceRatio = THREE.MathUtils.clamp(Math.hypot(dx, dz) / shape.radius, 0, 1);
      return Math.pow(1 - distanceRatio, Math.max(0.35, falloffStrength * 0.65));
    },
  };
}

export function createSprinklerZoneVisuals(scene: THREE.Scene, level: LevelData): SprinklerZoneVisual[] {
  const visuals: SprinklerZoneVisual[] = [];

  for (const poly of level.polygons ?? []) {
    const shape = buildPolygonShape(poly);
    if (!shape) continue;
    visuals.push(createZoneVisual(scene, poly.properties, shape));
  }

  for (const circle of level.circles ?? []) {
    const shape = buildCircleShape(circle);
    if (!shape) continue;
    visuals.push(createZoneVisual(scene, circle.properties, shape));
  }

  return visuals;
}

export function updateSprinklerZoneVisual(zone: SprinklerZoneVisual, time: number): void {
  for (let i = 0; i < zone.drops.length; i += 1) {
    const drop = zone.drops[i];
    const phaseValue = drop.phaseOffset + time * drop.speed;
    const cycle = Math.floor(phaseValue);
    if (cycle !== drop.currentCycle) {
      drop.currentCycle = cycle;
      zone.respawnDrop(drop);
      tempColor.copy(zone.dropColor).multiplyScalar(0.82 + drop.brightness * 0.3);
      zone.dropsMesh.setColorAt(i, tempColor);
    }
    const phase = phaseValue - cycle;
    const wobbleAmount = Math.sin(time * 6.5 + drop.wobblePhase + phase * TAU) * 0.012;
    const driftAmount = Math.sin(time * 1.4 + drop.driftPhase + phase * TAU * 0.45) * drop.driftAmount;
    const edgeDamping = 1 - drop.radialRatio * 0.55;
    const x = drop.x + Math.cos(drop.wobblePhase) * wobbleAmount * edgeDamping + Math.cos(drop.driftPhase) * driftAmount;
    const z = drop.z + Math.sin(drop.wobblePhase) * wobbleAmount * edgeDamping + Math.sin(drop.driftPhase) * driftAmount;
    const y = THREE.MathUtils.lerp(zone.ceilingHeight, FLOOR_Y + 0.05, phase);

    tempPosition.set(x, y, z);
    tempScale.set(drop.size, drop.streakLength, drop.size);
    tempMatrix.compose(tempPosition, identityRotation, tempScale);
    zone.dropsMesh.setMatrixAt(i, tempMatrix);

    const impact = THREE.MathUtils.clamp(1 - Math.abs(phase - 0.96) / 0.11, 0, 1);
    const splashScale = impact > 0.001
      ? drop.splashSize * (0.55 + impact * 1.7)
      : 0.0001;
    tempPosition.set(drop.x, FLOOR_Y, drop.z);
    tempScale.set(splashScale, SPLASH_THICKNESS, splashScale);
    tempMatrix.compose(tempPosition, identityRotation, tempScale);
    zone.splashesMesh.setMatrixAt(i, tempMatrix);

    tempColor.copy(zone.splashColor).multiplyScalar(impact * drop.brightness * zone.splashOpacity);
    zone.splashesMesh.setColorAt(i, tempColor);
  }

  zone.dropsMesh.instanceMatrix.needsUpdate = true;
  zone.dropsMesh.instanceColor!.needsUpdate = true;
  zone.splashesMesh.instanceMatrix.needsUpdate = true;
  zone.splashesMesh.instanceColor!.needsUpdate = true;
}

export function destroySprinklerZoneVisual(scene: THREE.Scene, zone: SprinklerZoneVisual): void {
  zone.unregisterCull();
  scene.remove(zone.root);
  zone.dropsMesh.geometry.dispose();
  zone.splashesMesh.geometry.dispose();
  disposeMaterial(zone.dropsMesh.material);
  disposeMaterial(zone.splashesMesh.material);
}
