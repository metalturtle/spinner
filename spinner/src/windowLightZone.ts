import * as THREE from 'three';
import { lvZ, type LevelCircle, type LevelData, type LevelPolygon } from './levelLoader';
import { registerTopDownCullable } from './sceneCulling';

const TAU = Math.PI * 2;
const FLOOR_Y = 0.055;
const MIN_RAYS = 4;
const MAX_RAYS = 18;

const tempPosition = new THREE.Vector3();
const tempScale = new THREE.Vector3();
const tempMatrix = new THREE.Matrix4();
const tempColor = new THREE.Color();
const tempQuaternion = new THREE.Quaternion();
const tempEuler = new THREE.Euler();

interface ZoneShape {
  center: { x: number; z: number };
  area: number;
  radius: number;
  contains: (point: { x: number; z: number }) => boolean;
  samplePoint: (maxDistanceRatio?: number) => { x: number; z: number };
}

interface WindowRay {
  x: number;
  z: number;
  width: number;
  length: number;
  brightness: number;
  phase: number;
  drift: number;
}

export interface WindowLightZoneVisual {
  root: THREE.Group;
  raysMesh: THREE.InstancedMesh;
  rays: WindowRay[];
  baseOpacity: number;
  angleRad: number;
  speed: number;
  unregisterCull: () => void;
  color: THREE.Color;
}

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

function hasWindowRayProperties(props: Record<string, unknown> | undefined): boolean {
  if (props?.windowRaysEnabled !== undefined) return parseBoolean(props.windowRaysEnabled);
  return props?.windowRaysColor !== undefined
    || props?.windowRaysIntensity !== undefined
    || props?.windowRaysAngle !== undefined
    || props?.windowRaysCount !== undefined
    || props?.windowRaysLength !== undefined
    || props?.windowRaysWidth !== undefined
    || props?.windowRaysSpeed !== undefined;
}

function buildPolygonShape(poly: LevelPolygon): ZoneShape | null {
  if (poly.layer !== 'trigger' || poly.vertices.length < 3) return null;
  if (!hasWindowRayProperties(poly.properties)) return null;

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

  const center = { x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5 };
  let radius = 0;
  for (const vertex of outer) {
    radius = Math.max(radius, Math.hypot(vertex.x - center.x, vertex.z - center.z));
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
        if (contains(point)) return point;
      }
      return center;
    },
  };
}

function buildCircleShape(circle: LevelCircle): ZoneShape | null {
  if (circle.layer !== 'trigger' || circle.radius <= 0) return null;
  if (!hasWindowRayProperties(circle.properties)) return null;

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

function getRayTexture(): THREE.Texture {
  const width = 32;
  const height = 128;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const verticalFade = Math.sin(v * Math.PI);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const horizontalFade = Math.exp(-Math.pow((u - 0.5) / 0.24, 2));
      const alpha = Math.max(0, Math.min(1, horizontalFade * verticalFade));
      const index = (y * width + x) * 4;
      const value = 255;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

const rayTexture = getRayTexture();

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
): WindowLightZoneVisual {
  const color = parseColor(props?.windowRaysColor, '#ffc77a');
  const baseOpacity = parseNumber(props?.windowRaysIntensity, 0.34, 0.01);
  const angleRad = THREE.MathUtils.degToRad(parseNumber(props?.windowRaysAngle, -34));
  const rayWidth = parseNumber(props?.windowRaysWidth, Math.max(0.9, shape.radius * 0.18), 0.2);
  const rayLength = parseNumber(props?.windowRaysLength, Math.max(3.5, shape.radius * 1.2), 0.5);
  const speed = parseNumber(props?.windowRaysSpeed, 0.24, 0);
  const count = Math.max(
    MIN_RAYS,
    Math.min(MAX_RAYS, Math.round(parseNumber(props?.windowRaysCount, shape.area * 0.12, MIN_RAYS))),
  );

  const root = new THREE.Group();
  root.position.set(shape.center.x, 0, shape.center.z);

  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    color,
    map: rayTexture,
    transparent: true,
    opacity: baseOpacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const raysMesh = new THREE.InstancedMesh(geometry, material, count);
  raysMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  raysMesh.frustumCulled = false;
  root.add(raysMesh);

  const rays: WindowRay[] = [];
  const dirX = Math.cos(angleRad);
  const dirZ = Math.sin(angleRad);
  const perpX = -dirZ;
  const perpZ = dirX;

  for (let i = 0; i < count; i += 1) {
    const radialRatio = 0.22 + Math.random() * 0.78;
    const point = shape.samplePoint(radialRatio);
    const along = (Math.random() * 2 - 1) * Math.min(shape.radius * 0.25, rayLength * 0.15);
    const across = (Math.random() * 2 - 1) * shape.radius * 0.18;
    rays.push({
      x: point.x - shape.center.x + dirX * along + perpX * across,
      z: point.z - shape.center.z + dirZ * along + perpZ * across,
      width: rayWidth * (0.72 + Math.random() * 0.8),
      length: rayLength * (0.78 + Math.random() * 0.55),
      brightness: 0.72 + Math.random() * 0.4,
      phase: Math.random() * TAU,
      drift: 0.05 + Math.random() * 0.12,
    });
  }

  scene.add(root);
  const unregisterCull = registerTopDownCullable(root, shape.radius + rayLength * 0.7);

  return {
    root,
    raysMesh,
    rays,
    baseOpacity,
    angleRad,
    speed,
    unregisterCull,
    color,
  };
}

export function createWindowLightZoneVisuals(scene: THREE.Scene, level: LevelData): WindowLightZoneVisual[] {
  const visuals: WindowLightZoneVisual[] = [];

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

export function updateWindowLightZoneVisual(zone: WindowLightZoneVisual, time: number): void {
  const baseYaw = zone.angleRad;
  for (let i = 0; i < zone.rays.length; i += 1) {
    const ray = zone.rays[i];
    const pulse = 0.72 + Math.sin(time * zone.speed * 2.1 + ray.phase) * 0.18;
    const sway = Math.sin(time * zone.speed + ray.phase * 1.7) * ray.drift;
    const angle = baseYaw + Math.sin(time * zone.speed * 0.55 + ray.phase) * 0.04;

    tempPosition.set(ray.x + sway * 0.35, FLOOR_Y, ray.z + sway);
    tempEuler.set(-Math.PI / 2, angle, 0);
    tempQuaternion.setFromEuler(tempEuler);
    tempScale.set(ray.width, ray.length * (0.92 + pulse * 0.12), 1);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    zone.raysMesh.setMatrixAt(i, tempMatrix);

    tempColor.copy(zone.color).multiplyScalar(zone.baseOpacity * pulse * ray.brightness * 2.2);
    zone.raysMesh.setColorAt(i, tempColor);
  }

  zone.raysMesh.instanceMatrix.needsUpdate = true;
  zone.raysMesh.instanceColor!.needsUpdate = true;
}

export function destroyWindowLightZoneVisual(scene: THREE.Scene, zone: WindowLightZoneVisual): void {
  zone.unregisterCull();
  scene.remove(zone.root);
  zone.raysMesh.geometry.dispose();
  disposeMaterial(zone.raysMesh.material);
}
