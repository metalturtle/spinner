import * as THREE from 'three';
import { lvZ, type LevelPolygon } from './levelLoader';
import { registerTopDownCullable } from './sceneCulling';

const MAX_EMBERS = 2400;
const VERTS_PER_EMBER = 2;
const DEAD_TIME = -9999;
const SURFACE_Y = 0.08;
const MAX_SAMPLE_ATTEMPTS = 32;
const MAX_SPAWNS_PER_REGION_PER_FRAME = 28;
const MAX_FLYING_SPAWNS_PER_REGION_PER_FRAME = 12;
const EMBER_CHUNK_CAPACITY = 320;
const EMBER_CHUNK_PADDING = 4.5;

const SURFACE_KIND = 0;
const FLYING_KIND = 1;

type Vec2 = { x: number; z: number };
type Vec3 = { x: number; y: number; z: number };

interface EmberChunk {
  center: Vec2;
  radius: number;
  positions: Float32Array;
  velocities: Float32Array;
  birthTimes: Float32Array;
  lifetimes: Float32Array;
  seeds: Float32Array;
  kinds: Float32Array;
  colors: Float32Array;
  geometry: THREE.BufferGeometry;
  lines: THREE.LineSegments;
  freeHead: number;
  unregisterCull: () => void;
}

interface LavaEmitterRegion {
  center: Vec2;
  radius: number;
  vertices: Vec2[];
  holes: Vec2[][];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  area: number;
  surfaceEmissionRate: number;
  flyingEmissionRate: number;
  surfaceSpawnCarry: number;
  flyingSpawnCarry: number;
  chunk: EmberChunk | null;
}

interface EmberPointEmitter {
  id: string;
  origin: Vec3;
  position: Vec3;
  radius: number;
  heightJitter: number;
  surfaceEmissionRate: number;
  flyingEmissionRate: number;
  surfaceSpawnCarry: number;
  flyingSpawnCarry: number;
  chunk: EmberChunk | null;
}

interface SpinnerInfluence {
  position: Vec2;
  radius: number;
  rpm: number;
  rpmCapacity: number;
  spinSign: number;
}

const SURFACE_EMBER_PALETTE: [number, number, number][] = [
  [1.0, 0.84, 0.26],
  [1.0, 0.7, 0.18],
  [1.0, 0.56, 0.12],
  [0.98, 0.34, 0.06],
];

const FLYING_EMBER_PALETTE: [number, number, number][] = [
  [1.0, 0.8, 0.24],
  [1.0, 0.64, 0.16],
  [1.0, 0.44, 0.1],
  [0.9, 0.22, 0.05],
];

const emitterRegions: LavaEmitterRegion[] = [];
const pointEmitters = new Map<string, EmberPointEmitter>();
const emberChunks: EmberChunk[] = [];

let lavaEmberScene: THREE.Scene | null = null;
let material: THREE.ShaderMaterial | null = null;
let currentTime = 0;

const VERTEX_SHADER = /* glsl */ `
uniform float uTime;

attribute vec3 aVelocity;
attribute float aBirthTime;
attribute float aLifetime;
attribute float aEndpoint;
attribute float aSeed;
attribute float aKind;
attribute vec3 aColor;

varying vec3 vColor;
varying float vLifeRatio;
varying float vEndpoint;
varying float vKind;

void main() {
  float age = uTime - aBirthTime;
  float lifeRatio = age / aLifetime;

  if (lifeRatio < 0.0 || lifeRatio > 1.0) {
    gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    return;
  }

  vec3 tipPos = position + aVelocity * age;
  float driftRatio = mix(lifeRatio, sqrt(lifeRatio), aKind);
  float swirl = aSeed * 6.28318530718 + age * (1.6 + aSeed * 2.1);
  tipPos.x += sin(swirl) * mix(0.09, 0.38, aKind) * driftRatio;
  tipPos.z += cos(swirl * 1.13) * mix(0.07, 0.31, aKind) * driftRatio;
  tipPos.y += aKind * sin(swirl * 0.65) * 0.08 * driftRatio;

  float speed = length(aVelocity);
  vec3 velDir = speed > 0.001 ? aVelocity / speed : vec3(0.0, 1.0, 0.0);
  float trail = mix(0.12, 0.46, aKind) + speed * mix(0.028, 0.085, aKind);
  trail *= mix(1.0 - lifeRatio * 0.5, 1.0 - lifeRatio * 0.18, aKind);
  vec3 tailPos = tipPos - velDir * trail;

  vec3 pos = mix(tailPos, tipPos, aEndpoint);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

  vColor = aColor;
  vLifeRatio = lifeRatio;
  vEndpoint = aEndpoint;
  vKind = aKind;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
varying vec3 vColor;
varying float vLifeRatio;
varying float vEndpoint;
varying float vKind;

void main() {
  float fade = mix(1.0 - vLifeRatio * 0.82, pow(1.0 - vLifeRatio, 0.82), vKind);
  float bright = vEndpoint * vEndpoint * vEndpoint;
  vec3 cooled = mix(vColor, vec3(0.22, 0.05, 0.01), mix(0.36, 0.62, vKind) * vLifeRatio);
  vec3 color = mix(cooled * mix(0.16, 0.22, vKind), cooled * 1.18, min(1.0, vEndpoint));
  float alpha = fade * bright * mix(1.15, 1.32, vKind);
  gl_FragColor = vec4(color, alpha);
}
`;

function signedPolygonArea(vertices: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area * 0.5;
}

function isPointInPolygon(point: Vec2, vertices: Vec2[]): boolean {
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

function isPointInRegion(point: Vec2, region: LavaEmitterRegion): boolean {
  if (!isPointInPolygon(point, region.vertices)) return false;
  for (const hole of region.holes) {
    if (hole.length >= 3 && isPointInPolygon(point, hole)) return false;
  }
  return true;
}

function samplePointInRegion(region: LavaEmitterRegion): Vec2 | null {
  for (let attempt = 0; attempt < MAX_SAMPLE_ATTEMPTS; attempt++) {
    const point = {
      x: THREE.MathUtils.lerp(region.minX, region.maxX, Math.random()),
      z: THREE.MathUtils.lerp(region.minZ, region.maxZ, Math.random()),
    };
    if (isPointInRegion(point, region)) return point;
  }
  return null;
}

function computeTipPosition(chunk: EmberChunk, emberIndex: number, age: number, lifetime: number): Vec3 {
  const v0 = emberIndex * VERTS_PER_EMBER;
  const v0_3 = v0 * 3;
  const kind = chunk.kinds[v0];
  const seed = chunk.seeds[v0];
  const lifeRatio = age / lifetime;
  const driftRatio = kind === FLYING_KIND ? Math.sqrt(lifeRatio) : lifeRatio;
  const swirl = seed * Math.PI * 2 + age * (1.6 + seed * 2.1);

  return {
    x: chunk.positions[v0_3] + chunk.velocities[v0_3] * age + Math.sin(swirl) * (kind === FLYING_KIND ? 0.38 : 0.09) * driftRatio,
    y: chunk.positions[v0_3 + 1] + chunk.velocities[v0_3 + 1] * age + (kind === FLYING_KIND ? Math.sin(swirl * 0.65) * 0.08 * driftRatio : 0),
    z: chunk.positions[v0_3 + 2] + chunk.velocities[v0_3 + 2] * age + Math.cos(swirl * 1.13) * (kind === FLYING_KIND ? 0.31 : 0.07) * driftRatio,
  };
}

function updateChunkAttributes(chunk: EmberChunk): void {
  chunk.geometry.attributes.position.needsUpdate = true;
  chunk.geometry.attributes.aVelocity.needsUpdate = true;
  chunk.geometry.attributes.aBirthTime.needsUpdate = true;
  chunk.geometry.attributes.aLifetime.needsUpdate = true;
  chunk.geometry.attributes.aSeed.needsUpdate = true;
  chunk.geometry.attributes.aKind.needsUpdate = true;
  chunk.geometry.attributes.aColor.needsUpdate = true;
}

function createChunk(scene: THREE.Scene, center: Vec2, radius: number): EmberChunk {
  const vertexCount = EMBER_CHUNK_CAPACITY * VERTS_PER_EMBER;
  const positions = new Float32Array(vertexCount * 3);
  const velocities = new Float32Array(vertexCount * 3);
  const birthTimes = new Float32Array(vertexCount).fill(DEAD_TIME);
  const lifetimes = new Float32Array(vertexCount).fill(1);
  const endpoints = new Float32Array(vertexCount);
  const seeds = new Float32Array(vertexCount).fill(0);
  const kinds = new Float32Array(vertexCount).fill(0);
  const colors = new Float32Array(vertexCount * 3);

  for (let i = 0; i < EMBER_CHUNK_CAPACITY; i++) {
    endpoints[i * 2] = 0.0;
    endpoints[i * 2 + 1] = 1.48;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
  geometry.setAttribute('aBirthTime', new THREE.BufferAttribute(birthTimes, 1));
  geometry.setAttribute('aLifetime', new THREE.BufferAttribute(lifetimes, 1));
  geometry.setAttribute('aEndpoint', new THREE.BufferAttribute(endpoints, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

  const lines = new THREE.LineSegments(geometry, material!);
  lines.frustumCulled = false;
  lines.renderOrder = 2;
  scene.add(lines);

  return {
    center,
    radius,
    positions,
    velocities,
    birthTimes,
    lifetimes,
    seeds,
    kinds,
    colors,
    geometry,
    lines,
    freeHead: 0,
    unregisterCull: registerTopDownCullable(
      lines,
      radius,
      new THREE.Vector3(center.x, 0, center.z),
    ),
  };
}

function destroyChunks(): void {
  if (!lavaEmberScene) return;
  while (emberChunks.length > 0) {
    const chunk = emberChunks.pop()!;
    chunk.unregisterCull();
    lavaEmberScene.remove(chunk.lines);
    chunk.geometry.dispose();
  }
}

function getOrCreateChunk(scene: THREE.Scene, center: Vec2, sourceRadius: number): EmberChunk {
  const nextChunk = createChunk(scene, center, sourceRadius + EMBER_CHUNK_PADDING);
  emberChunks.push(nextChunk);
  return nextChunk;
}

function ensureRegionChunk(region: LavaEmitterRegion): EmberChunk | null {
  if (region.chunk) return region.chunk;
  if (!lavaEmberScene || !material) return null;
  region.chunk = getOrCreateChunk(lavaEmberScene, region.center, region.radius);
  return region.chunk;
}

function ensurePointEmitterChunk(emitter: EmberPointEmitter): EmberChunk | null {
  if (emitter.chunk) return emitter.chunk;
  if (!lavaEmberScene || !material) return null;
  emitter.chunk = getOrCreateChunk(
    lavaEmberScene,
    { x: emitter.origin.x, z: emitter.origin.z },
    emitter.radius + emitter.heightJitter,
  );
  return emitter.chunk;
}

function emitEmber(chunk: EmberChunk, point: Vec3, kind: number, spreadMultiplier = 1): void {
  const i = chunk.freeHead;
  chunk.freeHead = (chunk.freeHead + 1) % EMBER_CHUNK_CAPACITY;

  const v0 = i * VERTS_PER_EMBER;
  const v1 = v0 + 1;
  const v0_3 = v0 * 3;
  const v1_3 = v1 * 3;

  const isFlying = kind === FLYING_KIND;
  const spread = (isFlying ? 0.32 : 0.2) * spreadMultiplier;
  const bx = point.x + (Math.random() - 0.5) * spread;
  const by = point.y + (isFlying ? 0.05 + Math.random() * 0.12 : Math.random() * 0.05);
  const bz = point.z + (Math.random() - 0.5) * spread;

  const vx = (Math.random() - 0.5) * (isFlying ? 2.9 : 1.3);
  const vy = isFlying ? (1.2 + Math.random() * 0.85) : (0.72 + Math.random() * 0.48);
  const vz = (Math.random() - 0.5) * (isFlying ? 2.9 : 1.3);

  chunk.positions[v0_3] = bx; chunk.positions[v0_3 + 1] = by; chunk.positions[v0_3 + 2] = bz;
  chunk.positions[v1_3] = bx; chunk.positions[v1_3 + 1] = by; chunk.positions[v1_3 + 2] = bz;

  chunk.velocities[v0_3] = vx; chunk.velocities[v0_3 + 1] = vy; chunk.velocities[v0_3 + 2] = vz;
  chunk.velocities[v1_3] = vx; chunk.velocities[v1_3 + 1] = vy; chunk.velocities[v1_3 + 2] = vz;

  chunk.birthTimes[v0] = currentTime; chunk.birthTimes[v1] = currentTime;
  const lifetime = isFlying ? (1.95 + Math.random() * 1.25) : (0.82 + Math.random() * 0.62);
  chunk.lifetimes[v0] = lifetime; chunk.lifetimes[v1] = lifetime;
  const seed = Math.random();
  chunk.seeds[v0] = seed; chunk.seeds[v1] = seed;
  chunk.kinds[v0] = kind; chunk.kinds[v1] = kind;

  const palette = isFlying ? FLYING_EMBER_PALETTE : SURFACE_EMBER_PALETTE;
  const color = palette[Math.floor(Math.random() * palette.length)];
  chunk.colors[v0_3] = color[0]; chunk.colors[v0_3 + 1] = color[1]; chunk.colors[v0_3 + 2] = color[2];
  chunk.colors[v1_3] = color[0]; chunk.colors[v1_3 + 1] = color[1]; chunk.colors[v1_3 + 2] = color[2];
}

function applySpinnerInfluence(influence: SpinnerInfluence): void {
  if (emberChunks.length === 0) return;
  if (influence.rpm <= 0 || influence.rpmCapacity <= 0) return;

  const rpmRatio = THREE.MathUtils.clamp(influence.rpm / influence.rpmCapacity, 0, 1.5);
  if (rpmRatio <= 0.02) return;

  const zoneRadius = influence.radius + 0.65 + rpmRatio * 0.95;
  const zoneRadiusSq = zoneRadius * zoneRadius;
  const spinSign = influence.spinSign >= 0 ? 1 : -1;

  for (const chunk of emberChunks) {
    const chunkDx = chunk.center.x - influence.position.x;
    const chunkDz = chunk.center.z - influence.position.z;
    const maxDist = zoneRadius + chunk.radius;
    if (chunkDx * chunkDx + chunkDz * chunkDz > maxDist * maxDist) continue;

    let changed = false;

    for (let i = 0; i < EMBER_CHUNK_CAPACITY; i++) {
      const v0 = i * VERTS_PER_EMBER;
      const v1 = v0 + 1;
      const age = currentTime - chunk.birthTimes[v0];
      const lifetime = chunk.lifetimes[v0];
      if (age <= 0 || age >= lifetime) continue;

      const v0_3 = v0 * 3;
      const v1_3 = v1 * 3;
      const kind = chunk.kinds[v0];
      const tipPos = computeTipPosition(chunk, i, age, lifetime);

      const dx = tipPos.x - influence.position.x;
      const dz = tipPos.z - influence.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > zoneRadiusSq) continue;

      const dist = Math.max(0.001, Math.sqrt(distSq));
      const nx = dx / dist;
      const nz = dz / dist;
      const tx = spinSign > 0 ? -nz : nz;
      const tz = spinSign > 0 ? nx : -nx;

      const falloff = 1 - dist / zoneRadius;
      const closeBoost = dist < influence.radius + 0.18 ? 1.45 : 1.0;
      const tangentialSpeed = (1.6 + rpmRatio * (kind === FLYING_KIND ? 5.8 : 4.1)) * falloff * closeBoost;
      const outwardSpeed = (0.45 + rpmRatio * (kind === FLYING_KIND ? 2.6 : 1.8)) * falloff * closeBoost;
      const upwardBoost = (kind === FLYING_KIND ? 0.45 : 0.22) + falloff * rpmRatio * 0.45;

      const curVx = chunk.velocities[v0_3];
      const curVy = chunk.velocities[v0_3 + 1];
      const curVz = chunk.velocities[v0_3 + 2];

      const nextVx = curVx * 0.72 + tx * tangentialSpeed + nx * outwardSpeed;
      const nextVy = Math.max(curVy * 0.82 + upwardBoost, kind === FLYING_KIND ? 1.1 : 0.75);
      const nextVz = curVz * 0.72 + tz * tangentialSpeed + nz * outwardSpeed;

      const remainingLifetime = lifetime - age;
      if (remainingLifetime <= 0.03) continue;

      chunk.positions[v0_3] = tipPos.x; chunk.positions[v0_3 + 1] = tipPos.y; chunk.positions[v0_3 + 2] = tipPos.z;
      chunk.positions[v1_3] = tipPos.x; chunk.positions[v1_3 + 1] = tipPos.y; chunk.positions[v1_3 + 2] = tipPos.z;

      chunk.velocities[v0_3] = nextVx; chunk.velocities[v0_3 + 1] = nextVy; chunk.velocities[v0_3 + 2] = nextVz;
      chunk.velocities[v1_3] = nextVx; chunk.velocities[v1_3 + 1] = nextVy; chunk.velocities[v1_3 + 2] = nextVz;

      chunk.birthTimes[v0] = currentTime; chunk.birthTimes[v1] = currentTime;
      chunk.lifetimes[v0] = remainingLifetime; chunk.lifetimes[v1] = remainingLifetime;
      changed = true;
    }

    if (changed) updateChunkAttributes(chunk);
  }
}

export function initLavaEmbers(scene: THREE.Scene): void {
  if (material) return;

  lavaEmberScene = scene;
  material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  for (const region of emitterRegions) ensureRegionChunk(region);
  for (const emitter of pointEmitters.values()) ensurePointEmitterChunk(emitter);
}

export function registerLavaEmitter(poly: LevelPolygon): void {
  if (poly.vertices.length < 3) return;

  const vertices = poly.vertices.map((v) => ({ x: v.x, z: lvZ(v.y) }));
  const holes = (poly.holes ?? []).map((hole) => hole.map((v) => ({ x: v.x, z: lvZ(v.y) })));

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let centerX = 0;
  let centerZ = 0;
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minZ = Math.min(minZ, vertex.z);
    maxZ = Math.max(maxZ, vertex.z);
    centerX += vertex.x;
    centerZ += vertex.z;
  }

  centerX /= vertices.length;
  centerZ /= vertices.length;

  const holeArea = holes.reduce((sum, hole) => sum + Math.abs(signedPolygonArea(hole)), 0);
  const area = Math.abs(signedPolygonArea(vertices)) - holeArea;
  if (area <= 0.05 || !Number.isFinite(area)) return;

  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const region: LavaEmitterRegion = {
    center: { x: centerX, z: centerZ },
    radius: Math.sqrt(spanX * spanX + spanZ * spanZ) * 0.5,
    vertices,
    holes,
    minX,
    maxX,
    minZ,
    maxZ,
    area,
    surfaceEmissionRate: THREE.MathUtils.clamp(area * 1.15, 14, 92),
    flyingEmissionRate: THREE.MathUtils.clamp(area * 0.46, 5, 30),
    surfaceSpawnCarry: 0,
    flyingSpawnCarry: 0,
    chunk: null,
  };

  emitterRegions.push(region);
  ensureRegionChunk(region);
}

export function registerEmberPointEmitter(config: {
  id: string;
  position: Vec3;
  radius?: number;
  heightJitter?: number;
  surfaceEmissionRate?: number;
  flyingEmissionRate?: number;
}): void {
  const emitter: EmberPointEmitter = {
    id: config.id,
    origin: { ...config.position },
    position: { ...config.position },
    radius: config.radius ?? 0.18,
    heightJitter: config.heightJitter ?? 0.08,
    surfaceEmissionRate: config.surfaceEmissionRate ?? 30,
    flyingEmissionRate: config.flyingEmissionRate ?? 16,
    surfaceSpawnCarry: 0,
    flyingSpawnCarry: 0,
    chunk: null,
  };

  pointEmitters.set(config.id, emitter);
  ensurePointEmitterChunk(emitter);
}

export function updateEmberPointEmitter(id: string, position: Vec3): void {
  const emitter = pointEmitters.get(id);
  if (!emitter) return;
  emitter.position = { ...position };
}

export function unregisterEmberPointEmitter(id: string): void {
  pointEmitters.delete(id);
}

export function updateLavaEmbers(delta: number, time: number, spinnerInfluence?: SpinnerInfluence): void {
  currentTime = time;
  if (!material) return;

  material.uniforms.uTime.value = time;
  if (emitterRegions.length === 0 && pointEmitters.size === 0) return;

  for (const region of emitterRegions) {
    const chunk = ensureRegionChunk(region);
    if (!chunk) continue;

    let changed = false;
    region.surfaceSpawnCarry = Math.min(
      region.surfaceSpawnCarry + region.surfaceEmissionRate * delta,
      region.surfaceEmissionRate * 2,
    );
    let surfaceSpawnCount = Math.floor(region.surfaceSpawnCarry);
    surfaceSpawnCount = Math.min(surfaceSpawnCount, MAX_SPAWNS_PER_REGION_PER_FRAME);
    region.surfaceSpawnCarry -= surfaceSpawnCount;

    for (let i = 0; i < surfaceSpawnCount; i++) {
      const point = samplePointInRegion(region);
      if (!point) continue;
      emitEmber(chunk, { x: point.x, y: SURFACE_Y, z: point.z }, SURFACE_KIND);
      changed = true;
    }

    region.flyingSpawnCarry = Math.min(
      region.flyingSpawnCarry + region.flyingEmissionRate * delta,
      Math.max(1, region.flyingEmissionRate * 3),
    );
    let flyingSpawnCount = Math.floor(region.flyingSpawnCarry);
    flyingSpawnCount = Math.min(flyingSpawnCount, MAX_FLYING_SPAWNS_PER_REGION_PER_FRAME);
    region.flyingSpawnCarry -= flyingSpawnCount;

    for (let i = 0; i < flyingSpawnCount; i++) {
      const point = samplePointInRegion(region);
      if (!point) continue;
      emitEmber(chunk, { x: point.x, y: SURFACE_Y, z: point.z }, FLYING_KIND);
      changed = true;
    }

    if (changed) updateChunkAttributes(chunk);
  }

  for (const emitter of pointEmitters.values()) {
    const chunk = ensurePointEmitterChunk(emitter);
    if (!chunk) continue;

    let changed = false;
    emitter.surfaceSpawnCarry = Math.min(
      emitter.surfaceSpawnCarry + emitter.surfaceEmissionRate * delta,
      emitter.surfaceEmissionRate * 2,
    );
    let surfaceSpawnCount = Math.floor(emitter.surfaceSpawnCarry);
    surfaceSpawnCount = Math.min(surfaceSpawnCount, MAX_SPAWNS_PER_REGION_PER_FRAME);
    emitter.surfaceSpawnCarry -= surfaceSpawnCount;

    for (let i = 0; i < surfaceSpawnCount; i++) {
      emitEmber(chunk, {
        x: emitter.position.x,
        y: emitter.position.y + Math.random() * emitter.heightJitter,
        z: emitter.position.z,
      }, SURFACE_KIND, Math.max(0.75, emitter.radius / 0.16));
      changed = true;
    }

    emitter.flyingSpawnCarry = Math.min(
      emitter.flyingSpawnCarry + emitter.flyingEmissionRate * delta,
      Math.max(1, emitter.flyingEmissionRate * 3),
    );
    let flyingSpawnCount = Math.floor(emitter.flyingSpawnCarry);
    flyingSpawnCount = Math.min(flyingSpawnCount, MAX_FLYING_SPAWNS_PER_REGION_PER_FRAME);
    emitter.flyingSpawnCarry -= flyingSpawnCount;

    for (let i = 0; i < flyingSpawnCount; i++) {
      emitEmber(chunk, {
        x: emitter.position.x,
        y: emitter.position.y + Math.random() * emitter.heightJitter,
        z: emitter.position.z,
      }, FLYING_KIND, Math.max(0.9, emitter.radius / 0.16));
      changed = true;
    }

    if (changed) updateChunkAttributes(chunk);
  }

  if (spinnerInfluence) applySpinnerInfluence(spinnerInfluence);
}

export function resetLavaEmbers(): void {
  for (const chunk of emberChunks) {
    chunk.birthTimes.fill(DEAD_TIME);
    chunk.freeHead = 0;
    chunk.geometry.attributes.aBirthTime.needsUpdate = true;
  }

  currentTime = 0;
  for (const region of emitterRegions) {
    region.surfaceSpawnCarry = 0;
    region.flyingSpawnCarry = 0;
  }
  for (const emitter of pointEmitters.values()) {
    emitter.surfaceSpawnCarry = 0;
    emitter.flyingSpawnCarry = 0;
  }
}

export function clearLavaEmbers(): void {
  emitterRegions.length = 0;
  pointEmitters.clear();
  resetLavaEmbers();
  destroyChunks();
}
