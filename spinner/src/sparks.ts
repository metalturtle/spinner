import * as THREE from 'three';
import type { Collidable } from './physics';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_SPARKS      = 600;
const DEAD_TIME       = -9999;
const VERTS_PER_SPARK = 2;   // tail vertex + tip vertex

// ─── State ──────────────────────────────────────────────────────────────────

let positions:  Float32Array;  // MAX_SPARKS * VERTS_PER_SPARK * 3  (birth pos, same for both verts)
let velocities: Float32Array;  // MAX_SPARKS * VERTS_PER_SPARK * 3
let birthTimes: Float32Array;  // MAX_SPARKS * VERTS_PER_SPARK
let lifetimes:  Float32Array;  // MAX_SPARKS * VERTS_PER_SPARK
let endpoints:  Float32Array;  // MAX_SPARKS * VERTS_PER_SPARK  (0 = tail, 1 = tip — static)
let colors:     Float32Array;  // MAX_SPARKS * VERTS_PER_SPARK * 3

let geometry: THREE.BufferGeometry;
let material: THREE.ShaderMaterial;
let freeHead    = 0;
let currentTime = 0;

// ─── Shaders ────────────────────────────────────────────────────────────────

const VERTEX_SHADER = /* glsl */ `
uniform float uTime;
uniform vec3  uGravity;

attribute vec3  aVelocity;
attribute float aBirthTime;
attribute float aLifetime;
attribute float aEndpoint;   // 0 = tail, 1 = tip
attribute vec3  aColor;

varying vec3  vColor;
varying float vLifeRatio;
varying float vEndpoint;

void main() {
  float age = uTime - aBirthTime;
  float lr  = age / aLifetime;

  if (lr > 1.0 || lr < 0.0) {
    gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    return;
  }

  // Tip: current physics position
  vec3 tipPos = position + aVelocity * age + 0.5 * uGravity * age * age;
  tipPos.y = max(0.05, tipPos.y);

  // Tail: long streak behind tip, along initial velocity direction
  float speed  = length(aVelocity);
  vec3  velDir = (speed > 0.001) ? (aVelocity / speed) : vec3(0.0, 1.0, 0.0);
  float trail  = min(speed * 0.12, 3.0) * (1.0 - lr * 0.4);
  vec3 tailPos = tipPos - velDir * trail;
  tailPos.y = max(0.05, tailPos.y);

  vec3 pos = mix(tailPos, tipPos, aEndpoint);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

  vColor     = aColor;
  vLifeRatio = lr;
  vEndpoint  = aEndpoint;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
varying vec3  vColor;
varying float vLifeRatio;
varying float vEndpoint;

void main() {
  float fade   = 1.0 - vLifeRatio;
  float bright = vEndpoint * vEndpoint * vEndpoint;  // cubic: tail nearly invisible, tip sharp
  // tip stays white-hot; trail ages to deep orange
  vec3  tipCol = mix(vColor, vec3(0.7, 0.15, 0.0), vLifeRatio);
  vec3  col    = mix(tipCol * 0.15, tipCol, vEndpoint);  // within-streak: dimmer at tail
  float alpha  = fade * bright;
  gl_FragColor = vec4(col, alpha);
}
`;

// ─── Color palettes ─────────────────────────────────────────────────────────

type Palette = [number, number, number][];

const SPARK_PALETTE: Palette = [
  [1.0, 1.0,  1.0 ],  // white-hot (triple-weighted — most sparks start white)
  [1.0, 1.0,  1.0 ],
  [1.0, 1.0,  1.0 ],
  [1.0, 0.95, 0.5 ],  // bright yellow
  [1.0, 0.6,  0.15],  // orange
  [1.0, 0.3,  0.0 ],  // deep orange (rare)
];

const PLASMA_PALETTE: Palette = [
  [0.4, 0.9,  1.0 ],  // cyan-white
  [0.5, 0.95, 1.0 ],  // bright cyan
  [0.3, 0.7,  1.0 ],  // blue-cyan
  [1.0, 0.6,  0.2 ],  // hot orange (fewer — secondary splash)
  [1.0, 0.3,  0.1 ],  // deep orange
];

const RED_SPARK_PALETTE: Palette = [
  [1.0, 0.9,  0.75],  // white-hot
  [1.0, 0.18, 0.04],  // hot red
  [1.0, 0.05, 0.0 ],  // pure red
  [0.75, 0.0,  0.0 ],  // deep red
  [1.0, 0.35, 0.02],  // orange-red
];

const GOO_PALETTE: Palette = [
  [0.1, 0.6,  0.05],  // dark green (dominant)
  [0.1, 0.6,  0.05],
  [0.1, 0.6,  0.05],
  [0.2, 0.8,  0.1 ],  // bright slime green
  [0.4, 0.15, 0.05],  // dark brownish-red (blood)
  [0.6, 0.1,  0.05],  // deep red gore
  [0.3, 0.5,  0.0 ],  // olive goo
];

const BLOOD_PALETTE: Palette = [
  [0.95, 0.18, 0.06], // hot blood red
  [0.78, 0.06, 0.02], // deep red
  [0.55, 0.03, 0.01], // dark gore
  [0.35, 0.02, 0.01], // dried brown-red
  [0.85, 0.32, 0.1 ], // orange-red mist
];

// ─── Spark style config ─────────────────────────────────────────────────────

export interface SparkStyle {
  spreadAngle:  number;   // half-angle in radians (±spread from normal)
  speedMin:     number;   // base speed before intensity multiplier
  speedRange:   number;   // random range added to speedMin
  upMin:        number;   // minimum upward velocity
  upRange:      number;   // random range added to upMin
  lifetimeMin:  number;   // minimum lifetime (seconds)
  lifetimeRange: number;  // random range added to lifetimeMin
  jitter:       number;   // birth position jitter radius
  palette:      Palette;
}

export const SPARK_STYLE: SparkStyle = {
  spreadAngle:   Math.PI / 4,   // ±22°
  speedMin:      22,
  speedRange:    30,
  upMin:         0.2,
  upRange:       1.2,
  lifetimeMin:   0.08,
  lifetimeRange: 0.14,
  jitter:        0.08,
  palette:       SPARK_PALETTE,
};

export const PLASMA_STYLE: SparkStyle = {
  spreadAngle:   Math.PI * 0.8, // ±72° — wide radial burst
  speedMin:      6,
  speedRange:    10,
  upMin:         3.0,
  upRange:       6.0,
  lifetimeMin:   0.18,
  lifetimeRange: 0.25,
  jitter:        0.15,
  palette:       PLASMA_PALETTE,
};

export const RED_SPARK_STYLE: SparkStyle = {
  spreadAngle:   Math.PI * 0.85,
  speedMin:      16,
  speedRange:    24,
  upMin:         0.05,
  upRange:       0.45,
  lifetimeMin:   0.1,
  lifetimeRange: 0.16,
  jitter:        0.08,
  palette:       RED_SPARK_PALETTE,
};

export const GOO_STYLE: SparkStyle = {
  spreadAngle:   Math.PI * 0.95, // nearly full hemisphere — chaotic splatter
  speedMin:      8,
  speedRange:    18,
  upMin:         2.0,
  upRange:       8.0,
  lifetimeMin:   0.25,
  lifetimeRange: 0.35,
  jitter:        0.3,
  palette:       GOO_PALETTE,
};

export const BLOOD_STYLE: SparkStyle = {
  spreadAngle:   Math.PI * 0.95,
  speedMin:      9,
  speedRange:    20,
  upMin:         1.5,
  upRange:       6.5,
  lifetimeMin:   0.2,
  lifetimeRange: 0.32,
  jitter:        0.22,
  palette:       BLOOD_PALETTE,
};

// ─── Init ───────────────────────────────────────────────────────────────────

export function initSparks(scn: THREE.Scene): void {
  const vCount = MAX_SPARKS * VERTS_PER_SPARK;

  positions  = new Float32Array(vCount * 3);
  velocities = new Float32Array(vCount * 3);
  birthTimes = new Float32Array(vCount).fill(DEAD_TIME);
  lifetimes  = new Float32Array(vCount).fill(1);
  endpoints  = new Float32Array(vCount);
  colors     = new Float32Array(vCount * 3);

  // Endpoint pattern is fixed: 0, 1, 0, 1, … (tail, tip, tail, tip, …)
  for (let i = 0; i < MAX_SPARKS; i++) {
    endpoints[i * 2]     = 0.0; // tail
    endpoints[i * 2 + 1] = 1.5; // tip
  }

  geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',   new THREE.BufferAttribute(positions,  3));
  geometry.setAttribute('aVelocity',  new THREE.BufferAttribute(velocities, 3));
  geometry.setAttribute('aBirthTime', new THREE.BufferAttribute(birthTimes, 1));
  geometry.setAttribute('aLifetime',  new THREE.BufferAttribute(lifetimes,  1));
  geometry.setAttribute('aEndpoint',  new THREE.BufferAttribute(endpoints,  1));
  geometry.setAttribute('aColor',     new THREE.BufferAttribute(colors,     3));

  material = new THREE.ShaderMaterial({
    uniforms: {
      uTime:    { value: 0 },
      uGravity: { value: new THREE.Vector3(0, -30, 0) },
    },
    vertexShader:   VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.AdditiveBlending,
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  scn.add(lines);
}

// ─── Emit ───────────────────────────────────────────────────────────────────

export function emitSparks(
  point:     { x: number; y: number; z: number },
  normal:    { x: number; y: number; z: number },
  count:     number,
  intensity: number,
  style:     SparkStyle = SPARK_STYLE,
): void {
  const { spreadAngle, speedMin, speedRange, upMin, upRange,
          lifetimeMin, lifetimeRange, jitter, palette } = style;

  const perpX = -normal.z;
  const perpZ =  normal.x;

  for (let n = 0; n < count; n++) {
    const i    = freeHead;
    freeHead   = (freeHead + 1) % MAX_SPARKS;
    const v0   = i * 2;
    const v1   = i * 2 + 1;
    const v0_3 = v0 * 3;
    const v1_3 = v1 * 3;

    const spread = (Math.random() - 0.5) * spreadAngle;
    const cosS   = Math.cos(spread);
    const sinS   = Math.sin(spread);
    const dirX   = normal.x * cosS + perpX * sinS;
    const dirZ   = normal.z * cosS + perpZ * sinS;

    const speed   = (speedMin + Math.random() * speedRange) * intensity;
    const upSpeed = upMin + Math.random() * upRange;

    const bx = point.x + (Math.random() - 0.5) * jitter;
    const by = point.y + (Math.random() - 0.5) * jitter * 0.4;
    const bz = point.z + (Math.random() - 0.5) * jitter;

    const vx = dirX * speed;
    const vy = upSpeed;
    const vz = dirZ * speed;

    positions[v0_3]     = bx; positions[v0_3 + 1] = by; positions[v0_3 + 2] = bz;
    positions[v1_3]     = bx; positions[v1_3 + 1] = by; positions[v1_3 + 2] = bz;

    velocities[v0_3]     = vx; velocities[v0_3 + 1] = vy; velocities[v0_3 + 2] = vz;
    velocities[v1_3]     = vx; velocities[v1_3 + 1] = vy; velocities[v1_3 + 2] = vz;

    const lt = lifetimeMin + Math.random() * lifetimeRange;
    birthTimes[v0] = currentTime; birthTimes[v1] = currentTime;
    lifetimes[v0]  = lt;          lifetimes[v1]  = lt;

    const c = palette[Math.floor(Math.random() * palette.length)];
    colors[v0_3]     = c[0]; colors[v0_3 + 1] = c[1]; colors[v0_3 + 2] = c[2];
    colors[v1_3]     = c[0]; colors[v1_3 + 1] = c[1]; colors[v1_3 + 2] = c[2];
  }

  const attrs = geometry.attributes;
  attrs.position.needsUpdate   = true;
  attrs.aVelocity.needsUpdate  = true;
  attrs.aBirthTime.needsUpdate = true;
  attrs.aLifetime.needsUpdate  = true;
  attrs.aColor.needsUpdate     = true;
}

/** Plasma splash — wide radial burst of slow cyan-orange blobs. */
export function emitPlasma(
  point: { x: number; y: number; z: number },
  count: number,
  intensity: number,
): void {
  // Upward normal — plasma bursts radially from impact point
  emitSparks(point, { x: 0, y: 1, z: 0 }, count, intensity, PLASMA_STYLE);
}

/** Goo/blood splatter — dramatic chainsaw-style burst. */
export function emitGoo(
  point: { x: number; y: number; z: number },
  count: number,
  intensity: number,
): void {
  emitSparks(point, { x: 0, y: 1, z: 0 }, count, intensity, GOO_STYLE);
}

/** Blood burst — red-only gore spray. */
export function emitBlood(
  point: { x: number; y: number; z: number },
  count: number,
  intensity: number,
): void {
  emitSparks(point, { x: 0, y: 1, z: 0 }, count, intensity, BLOOD_STYLE);
}

// ─── Update (one uniform per frame) ─────────────────────────────────────────

export function updateSparks(time: number): void {
  currentTime = time;
  material.uniforms.uTime.value = time;
}

// ─── Reset ──────────────────────────────────────────────────────────────────

export function resetSparks(): void {
  birthTimes.fill(DEAD_TIME);
  geometry.attributes.aBirthTime.needsUpdate = true;
  freeHead    = 0;
  currentTime = 0;
}

// ─── Contact Info Helper ────────────────────────────────────────────────────

/** Derive a 3D contact point + outward normal from two colliding circles. */
export function computeContactInfo(
  colA: Collidable, colB: Collidable,
): { point: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } } {
  const dx = colB.pos.x - colA.pos.x;
  const dz = colB.pos.z - colA.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;
  const nx = dx / dist;
  const nz = dz / dist;
  return {
    point:  { x: colA.pos.x + nx * colA.radius, y: 0.5, z: colA.pos.z + nz * colA.radius },
    normal: { x: nx, y: 0, z: nz },
  };
}
