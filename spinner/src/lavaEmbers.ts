import * as THREE from 'three';
import { lvZ, type LevelPolygon } from './levelLoader';

const MAX_EMBERS = 2400;
const VERTS_PER_EMBER = 2;
const DEAD_TIME = -9999;
const SURFACE_Y = 0.08;
const MAX_SAMPLE_ATTEMPTS = 32;
const MAX_SPAWNS_PER_REGION_PER_FRAME = 28;
const MAX_FLYING_SPAWNS_PER_REGION_PER_FRAME = 12;

const SURFACE_KIND = 0;
const FLYING_KIND = 1;

type Vec2 = { x: number; z: number };
type Vec3 = { x: number; y: number; z: number };

interface LavaEmitterRegion {
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
}

interface EmberPointEmitter {
  id: string;
  position: Vec3;
  radius: number;
  heightJitter: number;
  surfaceEmissionRate: number;
  flyingEmissionRate: number;
  surfaceSpawnCarry: number;
  flyingSpawnCarry: number;
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

let positions: Float32Array | null = null;
let velocities: Float32Array | null = null;
let birthTimes: Float32Array | null = null;
let lifetimes: Float32Array | null = null;
let endpoints: Float32Array | null = null;
let seeds: Float32Array | null = null;
let kinds: Float32Array | null = null;
let colors: Float32Array | null = null;

let geometry: THREE.BufferGeometry | null = null;
let material: THREE.ShaderMaterial | null = null;
let lines: THREE.LineSegments | null = null;
let freeHead = 0;
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

function computeTipPosition(
  px: number,
  py: number,
  pz: number,
  vx: number,
  vy: number,
  vz: number,
  seed: number,
  kind: number,
  age: number,
  lifetime: number,
): Vec3 {
  const lifeRatio = age / lifetime;
  const driftRatio = kind === FLYING_KIND ? Math.sqrt(lifeRatio) : lifeRatio;
  const swirl = seed * Math.PI * 2 + age * (1.6 + seed * 2.1);

  return {
    x: px + vx * age + Math.sin(swirl) * (kind === FLYING_KIND ? 0.38 : 0.09) * driftRatio,
    y: py + vy * age + (kind === FLYING_KIND ? Math.sin(swirl * 0.65) * 0.08 * driftRatio : 0),
    z: pz + vz * age + Math.cos(swirl * 1.13) * (kind === FLYING_KIND ? 0.31 : 0.07) * driftRatio,
  };
}

function emitEmber(point: Vec3, kind: number, spreadMultiplier = 1): void {
  if (!positions || !velocities || !birthTimes || !lifetimes || !seeds || !kinds || !colors) return;

  const i = freeHead;
  freeHead = (freeHead + 1) % MAX_EMBERS;

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

  positions[v0_3] = bx; positions[v0_3 + 1] = by; positions[v0_3 + 2] = bz;
  positions[v1_3] = bx; positions[v1_3 + 1] = by; positions[v1_3 + 2] = bz;

  velocities[v0_3] = vx; velocities[v0_3 + 1] = vy; velocities[v0_3 + 2] = vz;
  velocities[v1_3] = vx; velocities[v1_3 + 1] = vy; velocities[v1_3 + 2] = vz;

  birthTimes[v0] = currentTime; birthTimes[v1] = currentTime;
  const lifetime = isFlying ? (1.95 + Math.random() * 1.25) : (0.82 + Math.random() * 0.62);
  lifetimes[v0] = lifetime; lifetimes[v1] = lifetime;
  const seed = Math.random();
  seeds[v0] = seed; seeds[v1] = seed;
  kinds[v0] = kind; kinds[v1] = kind;

  const palette = isFlying ? FLYING_EMBER_PALETTE : SURFACE_EMBER_PALETTE;
  const color = palette[Math.floor(Math.random() * palette.length)];
  colors[v0_3] = color[0]; colors[v0_3 + 1] = color[1]; colors[v0_3 + 2] = color[2];
  colors[v1_3] = color[0]; colors[v1_3 + 1] = color[1]; colors[v1_3 + 2] = color[2];
}

function applySpinnerInfluence(influence: SpinnerInfluence): boolean {
  if (!positions || !velocities || !birthTimes || !lifetimes || !seeds || !kinds) return false;
  if (influence.rpm <= 0 || influence.rpmCapacity <= 0) return false;

  let changedAny = false;
  const rpmRatio = THREE.MathUtils.clamp(influence.rpm / influence.rpmCapacity, 0, 1.5);
  if (rpmRatio <= 0.02) return false;

  const zoneRadius = influence.radius + 0.65 + rpmRatio * 0.95;
  const zoneRadiusSq = zoneRadius * zoneRadius;
  const spinSign = influence.spinSign >= 0 ? 1 : -1;

  for (let i = 0; i < MAX_EMBERS; i++) {
    const v0 = i * VERTS_PER_EMBER;
    const v1 = v0 + 1;
    const age = currentTime - birthTimes[v0];
    const lifetime = lifetimes[v0];
    if (age <= 0 || age >= lifetime) continue;

    const v0_3 = v0 * 3;
    const v1_3 = v1 * 3;
    const kind = kinds[v0];
    const tipPos = computeTipPosition(
      positions[v0_3], positions[v0_3 + 1], positions[v0_3 + 2],
      velocities[v0_3], velocities[v0_3 + 1], velocities[v0_3 + 2],
      seeds[v0], kind, age, lifetime,
    );

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

    const curVx = velocities[v0_3];
    const curVy = velocities[v0_3 + 1];
    const curVz = velocities[v0_3 + 2];

    const nextVx = curVx * 0.72 + tx * tangentialSpeed + nx * outwardSpeed;
    const nextVy = Math.max(curVy * 0.82 + upwardBoost, kind === FLYING_KIND ? 1.1 : 0.75);
    const nextVz = curVz * 0.72 + tz * tangentialSpeed + nz * outwardSpeed;

    const remainingLifetime = lifetime - age;
    if (remainingLifetime <= 0.03) continue;

    positions[v0_3] = tipPos.x; positions[v0_3 + 1] = tipPos.y; positions[v0_3 + 2] = tipPos.z;
    positions[v1_3] = tipPos.x; positions[v1_3 + 1] = tipPos.y; positions[v1_3 + 2] = tipPos.z;

    velocities[v0_3] = nextVx; velocities[v0_3 + 1] = nextVy; velocities[v0_3 + 2] = nextVz;
    velocities[v1_3] = nextVx; velocities[v1_3 + 1] = nextVy; velocities[v1_3 + 2] = nextVz;

    birthTimes[v0] = currentTime; birthTimes[v1] = currentTime;
    lifetimes[v0] = remainingLifetime; lifetimes[v1] = remainingLifetime;
    changedAny = true;
  }

  return changedAny;
}

export function initLavaEmbers(scene: THREE.Scene): void {
  if (lines) return;

  const vertexCount = MAX_EMBERS * VERTS_PER_EMBER;
  positions = new Float32Array(vertexCount * 3);
  velocities = new Float32Array(vertexCount * 3);
  birthTimes = new Float32Array(vertexCount).fill(DEAD_TIME);
  lifetimes = new Float32Array(vertexCount).fill(1);
  endpoints = new Float32Array(vertexCount);
  seeds = new Float32Array(vertexCount).fill(0);
  kinds = new Float32Array(vertexCount).fill(0);
  colors = new Float32Array(vertexCount * 3);

  for (let i = 0; i < MAX_EMBERS; i++) {
    endpoints[i * 2] = 0.0;
    endpoints[i * 2 + 1] = 1.48;
  }

  geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
  geometry.setAttribute('aBirthTime', new THREE.BufferAttribute(birthTimes, 1));
  geometry.setAttribute('aLifetime', new THREE.BufferAttribute(lifetimes, 1));
  geometry.setAttribute('aEndpoint', new THREE.BufferAttribute(endpoints, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

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

  lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 2;
  scene.add(lines);
}

export function registerLavaEmitter(poly: LevelPolygon): void {
  if (poly.vertices.length < 3) return;

  const vertices = poly.vertices.map((v) => ({ x: v.x, z: lvZ(v.y) }));
  const holes = (poly.holes ?? []).map((hole) => hole.map((v) => ({ x: v.x, z: lvZ(v.y) })));

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minZ = Math.min(minZ, vertex.z);
    maxZ = Math.max(maxZ, vertex.z);
  }

  const holeArea = holes.reduce((sum, hole) => sum + Math.abs(signedPolygonArea(hole)), 0);
  const area = Math.abs(signedPolygonArea(vertices)) - holeArea;
  if (area <= 0.05 || !Number.isFinite(area)) return;

  emitterRegions.push({
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
  });
}

export function registerEmberPointEmitter(config: {
  id: string;
  position: Vec3;
  radius?: number;
  heightJitter?: number;
  surfaceEmissionRate?: number;
  flyingEmissionRate?: number;
}): void {
  pointEmitters.set(config.id, {
    id: config.id,
    position: { ...config.position },
    radius: config.radius ?? 0.18,
    heightJitter: config.heightJitter ?? 0.08,
    surfaceEmissionRate: config.surfaceEmissionRate ?? 30,
    flyingEmissionRate: config.flyingEmissionRate ?? 16,
    surfaceSpawnCarry: 0,
    flyingSpawnCarry: 0,
  });
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
  if (!geometry || !material) return;

  material.uniforms.uTime.value = time;
  if (emitterRegions.length === 0 && pointEmitters.size === 0) return;

  let changedAny = false;

  for (const region of emitterRegions) {
    region.surfaceSpawnCarry = Math.min(
      region.surfaceSpawnCarry + region.surfaceEmissionRate * delta,
      region.surfaceEmissionRate * 2
    );
    let surfaceSpawnCount = Math.floor(region.surfaceSpawnCarry);
    surfaceSpawnCount = Math.min(surfaceSpawnCount, MAX_SPAWNS_PER_REGION_PER_FRAME);
    region.surfaceSpawnCarry -= surfaceSpawnCount;

    for (let i = 0; i < surfaceSpawnCount; i++) {
      const point = samplePointInRegion(region);
      if (!point) continue;
      emitEmber({ x: point.x, y: SURFACE_Y, z: point.z }, SURFACE_KIND);
      changedAny = true;
    }

    region.flyingSpawnCarry = Math.min(
      region.flyingSpawnCarry + region.flyingEmissionRate * delta,
      Math.max(1, region.flyingEmissionRate * 3)
    );
    let flyingSpawnCount = Math.floor(region.flyingSpawnCarry);
    flyingSpawnCount = Math.min(flyingSpawnCount, MAX_FLYING_SPAWNS_PER_REGION_PER_FRAME);
    region.flyingSpawnCarry -= flyingSpawnCount;

    for (let i = 0; i < flyingSpawnCount; i++) {
      const point = samplePointInRegion(region);
      if (!point) continue;
      emitEmber({ x: point.x, y: SURFACE_Y, z: point.z }, FLYING_KIND);
      changedAny = true;
    }
  }

  for (const emitter of pointEmitters.values()) {
    emitter.surfaceSpawnCarry = Math.min(
      emitter.surfaceSpawnCarry + emitter.surfaceEmissionRate * delta,
      emitter.surfaceEmissionRate * 2
    );
    let surfaceSpawnCount = Math.floor(emitter.surfaceSpawnCarry);
    surfaceSpawnCount = Math.min(surfaceSpawnCount, MAX_SPAWNS_PER_REGION_PER_FRAME);
    emitter.surfaceSpawnCarry -= surfaceSpawnCount;

    for (let i = 0; i < surfaceSpawnCount; i++) {
      emitEmber({
        x: emitter.position.x,
        y: emitter.position.y + Math.random() * emitter.heightJitter,
        z: emitter.position.z,
      }, SURFACE_KIND, Math.max(0.75, emitter.radius / 0.16));
      changedAny = true;
    }

    emitter.flyingSpawnCarry = Math.min(
      emitter.flyingSpawnCarry + emitter.flyingEmissionRate * delta,
      Math.max(1, emitter.flyingEmissionRate * 3)
    );
    let flyingSpawnCount = Math.floor(emitter.flyingSpawnCarry);
    flyingSpawnCount = Math.min(flyingSpawnCount, MAX_FLYING_SPAWNS_PER_REGION_PER_FRAME);
    emitter.flyingSpawnCarry -= flyingSpawnCount;

    for (let i = 0; i < flyingSpawnCount; i++) {
      emitEmber({
        x: emitter.position.x,
        y: emitter.position.y + Math.random() * emitter.heightJitter,
        z: emitter.position.z,
      }, FLYING_KIND, Math.max(0.9, emitter.radius / 0.16));
      changedAny = true;
    }
  }

  if (spinnerInfluence) {
    changedAny = applySpinnerInfluence(spinnerInfluence) || changedAny;
  }

  if (!changedAny) return;

  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.aVelocity.needsUpdate = true;
  geometry.attributes.aBirthTime.needsUpdate = true;
  geometry.attributes.aLifetime.needsUpdate = true;
  geometry.attributes.aSeed.needsUpdate = true;
  geometry.attributes.aKind.needsUpdate = true;
  geometry.attributes.aColor.needsUpdate = true;
}

export function resetLavaEmbers(): void {
  if (!birthTimes || !geometry) return;
  birthTimes.fill(DEAD_TIME);
  geometry.attributes.aBirthTime.needsUpdate = true;
  freeHead = 0;
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
  resetLavaEmbers();
}
