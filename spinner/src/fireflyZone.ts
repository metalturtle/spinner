import * as THREE from 'three';
import { camera } from './renderer';
import { lvZ, type LevelCircle, type LevelData, type LevelPolygon } from './levelLoader';
import { registerTopDownCullable } from './sceneCulling';
import { acquireFireflyLight, releaseFireflyLight } from './fireflyLightPool';
import { getLightsDisabled } from './settings';
import type { GrassLocalLight } from './grassZone';

const TAU = Math.PI * 2;
const MIN_FIREFLIES = 18;
const MAX_FIREFLIES = 180;
const MAX_NEIGHBORS = 8;
const FLOOR_Y = 0.08;

const tempPosition = new THREE.Vector3();
const tempScale = new THREE.Vector3();
const tempMatrix = new THREE.Matrix4();
const tempColor = new THREE.Color();
const tempColorB = new THREE.Color();
const tempVecA = new THREE.Vector3();
const tempVecB = new THREE.Vector3();

interface ZoneShape {
  center: { x: number; z: number };
  area: number;
  radius: number;
  contains: (point: { x: number; z: number }) => boolean;
  samplePoint: () => { x: number; z: number };
}

interface Firefly {
  homeX: number;
  homeZ: number;
  x: number;
  y: number;
  z: number;
  height: number;
  travelRadius: number;
  phaseA: number;
  phaseB: number;
  phaseC: number;
  speed: number;
  activation: number;
  flare: number;
  excitedUntil: number;
  scheduledWakeAt: number;
  chainBurstAt: number;
  nextPlayerWakeAt: number;
  neighbors: number[];
}

interface FireflyLightCluster {
  position: THREE.Vector3;
  intensity: number;
  distance: number;
  pulsePhase: number;
}

interface FireflyChainWave {
  originX: number;
  originZ: number;
  startedAt: number;
  speed: number;
  maxRadius: number;
  strength: number;
}

export interface FireflyZoneVisual {
  root: THREE.Group;
  coreMesh: THREE.InstancedMesh;
  glowMesh: THREE.InstancedMesh;
  fireflies: Firefly[];
  idleColor: THREE.Color;
  activeColor: THREE.Color;
  glowColor: THREE.Color;
  wakeRadius: number;
  wakeRadiusSq: number;
  chainRadius: number;
  chainRadiusSq: number;
  holdTime: number;
  activationSpeed: number;
  decaySpeed: number;
  waveSpeed: number;
  flareStrength: number;
  flareDecay: number;
  baseSize: number;
  activeSize: number;
  glowSizeMult: number;
  glowOpacity: number;
  lightThreshold: number;
  lightPlayerRadius: number;
  lightPlayerRadiusSq: number;
  lightRadius: number;
  lightIntensity: number;
  maxClusterLights: number;
  lightSmoothing: number;
  grassLightColor: THREE.Color;
  grassLightRadius: number;
  grassLightIntensity: number;
  grassLightFalloff: number;
  grassLightCore: number;
  grassLightBoost: number;
  pooledLights: Array<THREE.PointLight | null>;
  grassLights: GrassLocalLight[];
  waves: FireflyChainWave[];
  unregisterCull: () => void;
  contains: (point: { x: number; z: number }) => boolean;
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

function hasFireflyZoneProperties(props: Record<string, unknown> | undefined): boolean {
  if (props?.fireflyEnabled !== undefined) return parseBoolean(props.fireflyEnabled);
  return props?.fireflyDensity !== undefined
    || props?.fireflyWakeRadius !== undefined
    || props?.fireflyChainRadius !== undefined
    || props?.fireflyIdleColor !== undefined
    || props?.fireflyActiveColor !== undefined;
}

function supportsFireflyLayer(layer: LevelPolygon['layer'] | LevelCircle['layer']): boolean {
  return layer === 'trigger' || layer === 'floor' || layer === 'decoration';
}

function buildPolygonShape(poly: LevelPolygon): ZoneShape | null {
  if (!supportsFireflyLayer(poly.layer) || poly.vertices.length < 3) return null;
  if (!hasFireflyZoneProperties(poly.properties)) return null;

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
    samplePoint() {
      for (let attempt = 0; attempt < 64; attempt += 1) {
        const point = {
          x: THREE.MathUtils.lerp(minX, maxX, Math.random()),
          z: THREE.MathUtils.lerp(minZ, maxZ, Math.random()),
        };
        if (contains(point)) return point;
      }
      return center;
    },
  };
}

function buildCircleShape(circle: LevelCircle): ZoneShape | null {
  if (!supportsFireflyLayer(circle.layer) || circle.radius <= 0) return null;
  if (!hasFireflyZoneProperties(circle.properties)) return null;

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
    samplePoint() {
      const angle = Math.random() * TAU;
      const distance = Math.sqrt(Math.random()) * circle.radius;
      return {
        x: center.x + Math.cos(angle) * distance,
        z: center.z + Math.sin(angle) * distance,
      };
    },
  };
}

function createDiscTexture(size: number, sharpness: 'soft' | 'hard'): THREE.Texture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size * 2 - 1;
      const v = (y + 0.5) / size * 2 - 1;
      const r = Math.sqrt(u * u + v * v);
      let alpha = 0;
      if (sharpness === 'hard') {
        alpha = 1 - THREE.MathUtils.smoothstep(r, 0.28, 0.42);
        alpha = Math.pow(alpha, 1.6);
      } else {
        alpha = Math.exp(-r * r * 4.8) * (1 - THREE.MathUtils.smoothstep(r, 0.72, 1.0));
      }
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(THREE.MathUtils.clamp(alpha, 0, 1) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

const fireflyCoreTexture = createDiscTexture(64, 'hard');
const fireflyGlowTexture = createDiscTexture(64, 'soft');
const fireflyQuadGeometry = new THREE.PlaneGeometry(1, 1);
const fireflyCoreMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  map: fireflyCoreTexture,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});
const fireflyGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  map: fireflyGlowTexture,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

function igniteFirefly(firefly: Firefly, time: number, holdTime: number): boolean {
  const wasDormant = firefly.activation < 0.18 && firefly.excitedUntil < time - 0.1;
  firefly.excitedUntil = Math.max(firefly.excitedUntil, time + holdTime * THREE.MathUtils.lerp(0.85, 1.15, Math.random()));
  firefly.scheduledWakeAt = Infinity;
  return wasDormant;
}

function spawnChainWave(zone: FireflyZoneVisual, originX: number, originZ: number, time: number, strength: number): void {
  zone.waves.push({
    originX,
    originZ,
    startedAt: time,
    speed: zone.waveSpeed * THREE.MathUtils.lerp(0.92, 1.08, Math.random()),
    maxRadius: zone.chainRadius * THREE.MathUtils.lerp(0.82, 1.18, strength),
    strength,
  });
  if (zone.waves.length > 48) zone.waves.splice(0, zone.waves.length - 48);
}

function buildNeighborGraph(fireflies: Firefly[], chainRadiusSq: number): void {
  for (let i = 0; i < fireflies.length; i += 1) {
    const distances: Array<{ index: number; distSq: number }> = [];
    const a = fireflies[i];
    for (let j = 0; j < fireflies.length; j += 1) {
      if (i === j) continue;
      const b = fireflies[j];
      const dx = b.homeX - a.homeX;
      const dz = b.homeZ - a.homeZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > chainRadiusSq * 1.35) continue;
      distances.push({ index: j, distSq });
    }
    distances.sort((lhs, rhs) => lhs.distSq - rhs.distSq);
    a.neighbors = distances.slice(0, MAX_NEIGHBORS).map((entry) => entry.index);
  }
}

function createZoneVisual(
  scene: THREE.Scene,
  props: Record<string, unknown> | undefined,
  shape: ZoneShape,
): FireflyZoneVisual {
  const density = parseNumber(props?.fireflyDensity, 1.65, 0.1);
  const wakeRadius = parseNumber(props?.fireflyWakeRadius, 2.7, 0.2);
  const chainRadius = parseNumber(props?.fireflyChainRadius, 3.4, 0.3);
  const holdTime = parseNumber(props?.fireflyHoldTime, 5.2, 0.4);
  const activationSpeed = parseNumber(props?.fireflyActivationSpeed, 9.5, 0.1);
  const decaySpeed = parseNumber(props?.fireflyDecaySpeed, 1.4, 0.05);
  const waveSpeed = parseNumber(props?.fireflyWaveSpeed, 12.5, 0.1);
  const flareStrength = parseNumber(props?.fireflyFlareStrength, 1.15, 0);
  const flareDecay = parseNumber(props?.fireflyFlareDecay, 8.5, 0.05);
  const baseSize = parseNumber(props?.fireflySize, 0.08, 0.01);
  const activeSize = parseNumber(props?.fireflyActiveSize, baseSize * 3.0, baseSize * 1.1);
  const glowSizeMult = parseNumber(props?.fireflyGlowScale, 3.2, 1.2);
  const glowOpacity = parseNumber(props?.fireflyGlowOpacity, 0.32, 0.02);
  const idleColor = parseColor(props?.fireflyIdleColor, '#efe18f');
  const activeColor = parseColor(props?.fireflyActiveColor, '#2f8fff');
  const glowColor = parseColor(props?.fireflyGlowColor, '#7fd8ff');
  const heightMin = parseNumber(props?.fireflyHeightMin, 0.35, 0.05);
  const heightMax = parseNumber(props?.fireflyHeightMax, 0.95, heightMin + 0.01);
  const moveRadius = parseNumber(props?.fireflyMoveRadius, 0.75, 0.02);
  const speedMin = parseNumber(props?.fireflySpeedMin, 0.28, 0.01);
  const speedMax = parseNumber(props?.fireflySpeedMax, 0.58, speedMin + 0.01);
  const lightThreshold = Math.max(2, Math.round(parseNumber(props?.fireflyLightThreshold, 6, 2)));
  const lightPlayerRadius = parseNumber(props?.fireflyLightPlayerRadius, 5.5, 0.5);
  const lightRadius = parseNumber(props?.fireflyLightRadius, 5.4, 0.5);
  const lightIntensity = parseNumber(props?.fireflyLightIntensity, 7.4, 0);
  const maxClusterLights = Math.max(1, Math.min(2, Math.round(parseNumber(props?.fireflyLightCount, 2, 1))));
  const lightSmoothing = parseNumber(props?.fireflyLightSmoothing, 8.5, 0.1);
  const grassLightColor = parseColor(props?.fireflyGrassLightColor, '#7fd8ff');
  const grassLightRadius = parseNumber(props?.fireflyGrassLightRadius, lightRadius * 1.85, 0.1);
  const grassLightIntensity = parseNumber(props?.fireflyGrassLightIntensity, lightIntensity * 0.92, 0);
  const grassLightFalloff = parseNumber(props?.fireflyGrassLightFalloff, 2.25, 0.05);
  const grassLightCore = parseNumber(props?.fireflyGrassLightCore, 5.0, 0.05);
  const grassLightBoost = parseNumber(props?.fireflyGrassLightBoost, 1.35, 0);
  const count = Math.max(MIN_FIREFLIES, Math.min(MAX_FIREFLIES, Math.round(shape.area * density)));

  const root = new THREE.Group();
  root.position.set(shape.center.x, 0, shape.center.z);

  const coreMesh = new THREE.InstancedMesh(fireflyQuadGeometry, fireflyCoreMaterial, count);
  coreMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  coreMesh.frustumCulled = false;
  root.add(coreMesh);

  const glowMesh = new THREE.InstancedMesh(fireflyQuadGeometry, fireflyGlowMaterial, count);
  glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glowMesh.frustumCulled = false;
  root.add(glowMesh);

  const fireflies: Firefly[] = [];
  for (let i = 0; i < count; i += 1) {
    const point = shape.samplePoint();
    fireflies.push({
      homeX: point.x,
      homeZ: point.z,
      x: point.x,
      y: FLOOR_Y + THREE.MathUtils.lerp(heightMin, heightMax, Math.random()),
      z: point.z,
      height: THREE.MathUtils.lerp(heightMin, heightMax, Math.random()),
      travelRadius: moveRadius * THREE.MathUtils.lerp(0.45, 1.15, Math.random()),
      phaseA: Math.random() * TAU,
      phaseB: Math.random() * TAU,
      phaseC: Math.random() * TAU,
      speed: THREE.MathUtils.lerp(speedMin, speedMax, Math.random()),
      activation: Math.random() * 0.1,
      flare: 0,
      excitedUntil: -Infinity,
      scheduledWakeAt: Infinity,
      chainBurstAt: Infinity,
      nextPlayerWakeAt: -Infinity,
      neighbors: [],
    });
  }
  buildNeighborGraph(fireflies, chainRadius * chainRadius);

  scene.add(root);
  const unregisterCull = registerTopDownCullable(root, shape.radius + lightRadius + 1.2);

  return {
    root,
    coreMesh,
    glowMesh,
    fireflies,
    idleColor,
    activeColor,
    glowColor,
    wakeRadius,
    wakeRadiusSq: wakeRadius * wakeRadius,
    chainRadius,
    chainRadiusSq: chainRadius * chainRadius,
    holdTime,
    activationSpeed,
    decaySpeed,
    waveSpeed,
    flareStrength,
    flareDecay,
    baseSize,
    activeSize,
    glowSizeMult,
    glowOpacity,
    lightThreshold,
    lightPlayerRadius,
    lightPlayerRadiusSq: lightPlayerRadius * lightPlayerRadius,
    lightRadius,
    lightIntensity,
    maxClusterLights,
    lightSmoothing,
    grassLightColor,
    grassLightRadius,
    grassLightIntensity,
    grassLightFalloff,
    grassLightCore,
    grassLightBoost,
    pooledLights: Array.from({ length: maxClusterLights }, () => null),
    grassLights: Array.from({ length: maxClusterLights }, () => ({
      position: new THREE.Vector3(0, -200, 0),
      color: new THREE.Color(grassLightColor),
      intensity: 0,
      distance: 0,
      falloffExponent: grassLightFalloff,
      coreExponent: grassLightCore,
      softenMix: 0.72,
      glowMix: 0.9,
    })),
    waves: [],
    unregisterCull,
    contains: shape.contains,
  };
}

export function createFireflyZoneVisuals(scene: THREE.Scene, level: LevelData): FireflyZoneVisual[] {
  const visuals: FireflyZoneVisual[] = [];

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

function releaseExtraLights(zone: FireflyZoneVisual, keepCount: number): void {
  for (let i = keepCount; i < zone.pooledLights.length; i += 1) {
    releaseFireflyLight(zone.pooledLights[i]);
    zone.pooledLights[i] = null;
  }
  for (let i = keepCount; i < zone.grassLights.length; i += 1) {
    zone.grassLights[i].intensity = 0;
    zone.grassLights[i].distance = 0;
    zone.grassLights[i].position.set(0, -200, 0);
  }
}

function summarizeCluster(
  contributors: Firefly[],
  threshold: number,
  lightIntensity: number,
  lightRadius: number,
  pulseSeed: number,
): FireflyLightCluster | null {
  if (contributors.length < threshold) return null;

  let totalWeight = 0;
  let totalEnergy = 0;
  tempVecA.set(0, 0, 0);
  for (const firefly of contributors) {
    const energy = Math.min(1.8, firefly.activation + firefly.flare * 0.62);
    const weight = 0.4 + firefly.activation * 1.35 + firefly.flare * 0.95;
    totalWeight += weight;
    totalEnergy += energy;
    tempVecA.x += firefly.x * weight;
    tempVecA.y += firefly.y * weight;
    tempVecA.z += firefly.z * weight;
  }
  if (totalWeight <= 0.0001) return null;

  const averageEnergy = totalEnergy / contributors.length;
  const densityFactor = THREE.MathUtils.clamp((contributors.length - threshold + 1) / threshold, 0, 1.85);
  return {
    position: new THREE.Vector3(
      tempVecA.x / totalWeight,
      tempVecA.y / totalWeight,
      tempVecA.z / totalWeight,
    ),
    intensity: lightIntensity * densityFactor * (0.72 + averageEnergy * 0.6),
    distance: lightRadius * (0.88 + Math.min(1, contributors.length / (threshold * 1.7)) * 0.4),
    pulsePhase: pulseSeed,
  };
}

function processChainWaves(zone: FireflyZoneVisual, time: number, delta: number): void {
  for (let waveIndex = zone.waves.length - 1; waveIndex >= 0; waveIndex -= 1) {
    const wave = zone.waves[waveIndex];
    const elapsed = Math.max(0, time - wave.startedAt);
    const prevElapsed = Math.max(0, elapsed - delta);
    const previousRadius = prevElapsed * wave.speed;
    const currentRadius = elapsed * wave.speed;

    if (previousRadius > wave.maxRadius + 0.6) {
      zone.waves.splice(waveIndex, 1);
      continue;
    }

    for (const firefly of zone.fireflies) {
      if (firefly.activation > 0.72 || firefly.excitedUntil > time + 0.2) continue;
      const dx = firefly.homeX - wave.originX;
      const dz = firefly.homeZ - wave.originZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= 0.05 || dist > wave.maxRadius) continue;
      if (dist <= previousRadius || dist > currentRadius) continue;

      const newlyIgnited = igniteFirefly(firefly, time, zone.holdTime * (0.86 + wave.strength * 0.18));
      firefly.flare = Math.max(firefly.flare, zone.flareStrength * (0.72 + wave.strength * 0.42));
      if (newlyIgnited && wave.strength > 0.34) {
        spawnChainWave(zone, firefly.homeX, firefly.homeZ, time + 0.01, wave.strength * 0.68);
      }
    }
  }
}

function updateZoneLights(zone: FireflyZoneVisual, playerPos: { x: number; z: number }, time: number, delta: number): void {
  if (!zone.root.visible || getLightsDisabled()) {
    releaseExtraLights(zone, 0);
    return;
  }

  const contributors = zone.fireflies.filter((firefly) => {
    const energy = firefly.activation + firefly.flare * 0.6;
    if (energy < 0.42) return false;
    const dx = firefly.x - playerPos.x;
    const dz = firefly.z - playerPos.z;
    return dx * dx + dz * dz <= zone.lightPlayerRadiusSq;
  });

  if (contributors.length < zone.lightThreshold) {
    releaseExtraLights(zone, 0);
    return;
  }

  const clusters: FireflyLightCluster[] = [];
  const primary = summarizeCluster(
    contributors,
    zone.lightThreshold,
    zone.lightIntensity,
    zone.lightRadius,
    zone.root.position.x * 0.13 + zone.root.position.z * 0.19,
  );
  if (primary) clusters.push(primary);

  if (zone.maxClusterLights > 1 && contributors.length >= zone.lightThreshold * 2) {
    let seedA = contributors[0];
    let seedB = contributors[0];
    let strongestWeight = -Infinity;
    for (const firefly of contributors) {
      const weight = firefly.activation;
      if (weight <= strongestWeight) continue;
      strongestWeight = weight;
      seedA = firefly;
    }
    let farthestDistSq = 0;
    for (const firefly of contributors) {
      const dx = firefly.x - seedA.x;
      const dz = firefly.z - seedA.z;
      const distSq = dx * dx + dz * dz;
      if (distSq <= farthestDistSq) continue;
      farthestDistSq = distSq;
      seedB = firefly;
    }

    if (seedA !== seedB && farthestDistSq >= zone.chainRadiusSq * 0.18) {
      const groupA: Firefly[] = [];
      const groupB: Firefly[] = [];
      for (const firefly of contributors) {
        const distASq = (firefly.x - seedA.x) * (firefly.x - seedA.x) + (firefly.z - seedA.z) * (firefly.z - seedA.z);
        const distBSq = (firefly.x - seedB.x) * (firefly.x - seedB.x) + (firefly.z - seedB.z) * (firefly.z - seedB.z);
        if (distASq <= distBSq) groupA.push(firefly);
        else groupB.push(firefly);
      }
      const secondary = summarizeCluster(
        groupB.length >= groupA.length ? groupB : groupA,
        zone.lightThreshold,
        zone.lightIntensity * 0.9,
        zone.lightRadius * 0.92,
        zone.root.position.x * 0.21 + zone.root.position.z * 0.07 + 1.9,
      );
      if (secondary) clusters.push(secondary);
    }
  }

  if (clusters.length === 0) {
    releaseExtraLights(zone, 0);
    return;
  }

  for (let i = 0; i < clusters.length; i += 1) {
    const cluster = clusters[i];
    const pulse = 0.9 + Math.sin(time * 3.8 + cluster.pulsePhase) * 0.1;
    const grassLight = zone.grassLights[i];
    grassLight.position.copy(cluster.position);
    grassLight.color.copy(zone.grassLightColor);
    grassLight.distance = zone.grassLightRadius * (0.92 + Math.min(1, cluster.distance / Math.max(zone.lightRadius, 0.001)) * 0.24);
    grassLight.intensity = zone.grassLightIntensity * zone.grassLightBoost * (cluster.intensity / Math.max(zone.lightIntensity, 0.001)) * pulse;
    grassLight.falloffExponent = zone.grassLightFalloff;
    grassLight.coreExponent = zone.grassLightCore;
    grassLight.softenMix = 0.72;
    grassLight.glowMix = 0.9;

    let light = zone.pooledLights[i];
    if (!light) {
      light = acquireFireflyLight(zone.activeColor);
      zone.pooledLights[i] = light;
    }
    if (!light) continue;
    light.color.copy(zone.activeColor).lerp(tempColorB.set(0xffffff), 0.08);
    light.distance = cluster.distance;
    light.decay = 1.7;
    light.intensity = cluster.intensity * pulse;
    tempVecB.copy(cluster.position);
    light.position.lerp(tempVecB, 1 - Math.exp(-delta * zone.lightSmoothing));
  }
  releaseExtraLights(zone, clusters.length);
}

export function updateFireflyZoneVisual(
  zone: FireflyZoneVisual,
  time: number,
  delta: number,
  playerPos: { x: number; z: number },
): void {
  const billboardQuat = camera.quaternion;
  const zoneCenter = zone.root.position;

  processChainWaves(zone, time, delta);

  for (let i = 0; i < zone.fireflies.length; i += 1) {
    const firefly = zone.fireflies[i];

    const playerDx = firefly.x - playerPos.x;
    const playerDz = firefly.z - playerPos.z;
    if (playerDx * playerDx + playerDz * playerDz <= zone.wakeRadiusSq && time >= firefly.nextPlayerWakeAt) {
      const newlyIgnited = igniteFirefly(firefly, time, zone.holdTime);
      firefly.flare = Math.max(firefly.flare, zone.flareStrength * 1.22);
      if (newlyIgnited) spawnChainWave(zone, firefly.homeX, firefly.homeZ, time, 1.0);
      firefly.nextPlayerWakeAt = time + 0.08 + Math.random() * 0.08;
    }

    if (firefly.scheduledWakeAt <= time) {
      const newlyIgnited = igniteFirefly(firefly, time, zone.holdTime * 0.92);
      firefly.flare = Math.max(firefly.flare, zone.flareStrength * 0.82);
      if (newlyIgnited) spawnChainWave(zone, firefly.homeX, firefly.homeZ, time, 0.62);
    }

    const targetActivation = firefly.excitedUntil > time ? 1 : 0;
    const lambda = targetActivation > firefly.activation ? zone.activationSpeed : zone.decaySpeed;
    firefly.activation = THREE.MathUtils.damp(firefly.activation, targetActivation, lambda, delta);
    firefly.flare = THREE.MathUtils.damp(firefly.flare, 0, zone.flareDecay, delta);

    const driftX = Math.sin(time * firefly.speed * 1.3 + firefly.phaseA) * firefly.travelRadius;
    const driftZ = Math.cos(time * firefly.speed * 1.13 + firefly.phaseB) * firefly.travelRadius;
    const swirlX = Math.sin(time * firefly.speed * 2.1 + firefly.phaseC) * firefly.travelRadius * 0.32;
    const swirlZ = Math.cos(time * firefly.speed * 1.75 + firefly.phaseA * 1.7) * firefly.travelRadius * 0.28;
    const candidateX = firefly.homeX + driftX + swirlX;
    const candidateZ = firefly.homeZ + driftZ + swirlZ;
    if (zone.contains({ x: candidateX, z: candidateZ })) {
      firefly.x = candidateX;
      firefly.z = candidateZ;
    } else {
      firefly.x = THREE.MathUtils.lerp(candidateX, firefly.homeX, 0.55);
      firefly.z = THREE.MathUtils.lerp(candidateZ, firefly.homeZ, 0.55);
    }

    const heightPulse = Math.sin(time * firefly.speed * 2.2 + firefly.phaseB) * (0.08 + firefly.activation * 0.04);
    const activeLift = firefly.activation * 0.14 + firefly.flare * 0.05;
    firefly.y = FLOOR_Y + firefly.height + heightPulse + activeLift;

    const pulse = 0.88 + Math.sin(time * (2.8 + firefly.activation * 4.6) + firefly.phaseC) * (0.08 + firefly.activation * 0.24);
    const flareBoost = 1 + firefly.flare * 0.92;
    const brightness = THREE.MathUtils.lerp(0.4, 2.2, firefly.activation) * pulse * flareBoost;
    const coreSize = THREE.MathUtils.lerp(zone.baseSize * 1.08, zone.activeSize * 1.16, firefly.activation)
      * THREE.MathUtils.lerp(0.96, 1.22, pulse * 0.5)
      * (1 + firefly.flare * 0.26);
    const glowSize = coreSize * THREE.MathUtils.lerp(1.8, zone.glowSizeMult, firefly.activation) * (1 + firefly.flare * 0.4);

    tempColor.copy(zone.idleColor).lerp(zone.activeColor, firefly.activation);
    tempColor.multiplyScalar(brightness);
    tempColorB.copy(zone.idleColor).lerp(zone.glowColor, firefly.activation);
    tempColorB.multiplyScalar(brightness * zone.glowOpacity);

    tempPosition.set(firefly.x - zoneCenter.x, firefly.y, firefly.z - zoneCenter.z);
    tempScale.set(coreSize, coreSize, coreSize);
    tempMatrix.compose(tempPosition, billboardQuat, tempScale);
    zone.coreMesh.setMatrixAt(i, tempMatrix);
    zone.coreMesh.setColorAt(i, tempColor);

    tempScale.set(glowSize, glowSize, glowSize);
    tempMatrix.compose(tempPosition, billboardQuat, tempScale);
    zone.glowMesh.setMatrixAt(i, tempMatrix);
    zone.glowMesh.setColorAt(i, tempColorB);
  }

  zone.coreMesh.instanceMatrix.needsUpdate = true;
  zone.glowMesh.instanceMatrix.needsUpdate = true;
  if (zone.coreMesh.instanceColor) zone.coreMesh.instanceColor.needsUpdate = true;
  if (zone.glowMesh.instanceColor) zone.glowMesh.instanceColor.needsUpdate = true;

  updateZoneLights(zone, playerPos, time, delta);
}

export function destroyFireflyZoneVisual(scene: THREE.Scene, zone: FireflyZoneVisual): void {
  releaseExtraLights(zone, 0);
  zone.unregisterCull();
  scene.remove(zone.root);
}
