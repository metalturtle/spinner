import * as THREE from 'three';

// ─── Config ─────────────────────────────────────────────────────────────────

const MAX_DECALS       = 400;
const DECAL_Y          = 0.04;  // slightly above floor to avoid z-fighting
const GOO_SPLAT_MIN_RADIUS = 0.15;
const GOO_SPLAT_MAX_RADIUS = 0.6;
const BLOOD_SPLAT_MIN_RADIUS = 0.28;
const BLOOD_SPLAT_MAX_RADIUS = 0.95;
const FADE_START       = 25.0;  // seconds before decals start fading
const FADE_DURATION    = 10.0;  // seconds to fully disappear
const BLOOD_DRAG_MIN_SPEED = 1.5;
const BLOOD_DRAG_INTERVAL = 0.03;
const BLOOD_DRAG_RADIUS_PADDING = 0.45;
const BLOOD_DRAG_STROKES_MIN = 1;
const BLOOD_DRAG_STROKES_MAX = 2;
const BLOOD_DRAG_SEGMENTS = 4;
const BLOOD_DRAG_HEAD_WIDTH_MIN = 0.09;
const BLOOD_DRAG_HEAD_WIDTH_MAX = 0.24;
const BLOOD_DRAG_TAIL_WIDTH_MIN = 0.018;
const BLOOD_DRAG_TAIL_WIDTH_MAX = 0.05;
const BLOOD_DRAG_LENGTH_MIN = 0.55;
const BLOOD_DRAG_LENGTH_MAX = 1.45;
const BLOOD_DRAG_LOAD_GAIN_ON_ENTRY = 1.0;
const BLOOD_DRAG_LOAD_GAIN_WHILE_TOUCHING = 0.08;
const BLOOD_DRAG_LOAD_DECAY_ON_SPAWN = 0.2;

// ─── Shaders ────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
varying vec2 vUV;
void main() {
  vUV = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3  uColor;
uniform float uAlpha;
varying vec2  vUV;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2  c = vUV - 0.5;
  float d = length(c) * 2.0;

  // Organic splat shape: distort the circle with noise-like wobble
  float angle = atan(c.y, c.x);
  float wobble = 0.85 + 0.15 * sin(angle * 5.0) * sin(angle * 3.0 + 1.5);
  d /= wobble;

  if (d > 1.0) discard;

  // Small breakup noise prevents "perfect sticker" edges.
  float breakup = hash12(vUV * 22.0 + vec2(0.37, 0.11));
  if (breakup < smoothstep(0.82, 1.0, d) * 0.3) discard;

  // Darker at center, lighter at edges
  float darken = 1.0 - d * 0.4;
  vec3 col = uColor * darken;

  // Soft edge
  float edge = 1.0 - smoothstep(0.7, 1.0, d);

  gl_FragColor = vec4(col, edge * uAlpha * 0.85);
}
`;

// ─── Palette ────────────────────────────────────────────────────────────────

const GOO_COLORS = [
  new THREE.Color(0x1a6b0a),  // dark green slime
  new THREE.Color(0x0d4a06),  // very dark green
  new THREE.Color(0x2d8a15),  // bright slime
  new THREE.Color(0x3d5c00),  // olive
];

const BLOOD_COLORS = [
  new THREE.Color(0x56110d),  // saturated dark blood
  new THREE.Color(0x6b1611),  // deep crimson
  new THREE.Color(0x7a1913),  // richer red base
  new THREE.Color(0x48100c),  // dark clot shadow
  new THREE.Color(0x861f17),  // hot crimson base
];

const BLOOD_WET_COLORS = [
  new THREE.Color(0xc51f1a),  // bright wet crimson
  new THREE.Color(0xdc261f),  // hotline red
  new THREE.Color(0xb31a16),  // rich dark-red accent
  new THREE.Color(0xf03029),  // bright splatter pop
  new THREE.Color(0xff3d35),  // neon highlight flecks
];

// ─── State ──────────────────────────────────────────────────────────────────

interface Decal {
  mesh:     THREE.Mesh;
  material: THREE.ShaderMaterial;
  kind:     'goo' | 'blood';
  baseAlpha: number;
  birthTime: number;
  alive:    boolean;
}

interface DecalSplatStyle {
  minRadius: number;
  maxRadius: number;
  spread: number;
  stretchMin: number;
  stretchMax: number;
  alphaMin: number;
  alphaMax: number;
  blending: THREE.Blending;
}

let decals: Decal[] = [];
let sceneRef: THREE.Scene;
let freeHead = 0;
let nextBloodDragTime = 0;
let bloodDragLoad = 0;
let wasTouchingBlood = false;

const GOO_SPLAT_STYLE: DecalSplatStyle = {
  minRadius: GOO_SPLAT_MIN_RADIUS,
  maxRadius: GOO_SPLAT_MAX_RADIUS,
  spread: 1.8,
  stretchMin: 0.92,
  stretchMax: 1.12,
  alphaMin: 0.8,
  alphaMax: 1.0,
  blending: THREE.NormalBlending,
};

const BLOOD_SPLAT_STYLE: DecalSplatStyle = {
  minRadius: BLOOD_SPLAT_MIN_RADIUS,
  maxRadius: BLOOD_SPLAT_MAX_RADIUS * 1.25,
  spread: 3.1,
  stretchMin: 0.7,
  stretchMax: 1.55,
  alphaMin: 0.86,
  alphaMax: 1.0,
  blending: THREE.MultiplyBlending,
};

const BLOOD_WET_SPLAT_STYLE: DecalSplatStyle = {
  minRadius: BLOOD_SPLAT_MIN_RADIUS * 0.45,
  maxRadius: BLOOD_SPLAT_MAX_RADIUS * 0.78,
  spread: 2.35,
  stretchMin: 0.72,
  stretchMax: 1.48,
  alphaMin: 0.72,
  alphaMax: 0.98,
  blending: THREE.NormalBlending,
};

// ─── Init ───────────────────────────────────────────────────────────────────

export function initGooDecals(scn: THREE.Scene): void {
  sceneRef = scn;
}

// ─── Spawn ──────────────────────────────────────────────────────────────────

function spawnDecalSplat(
  pos: { x: number; z: number },
  count: number,
  time: number,
  palette: THREE.Color[],
  style: DecalSplatStyle,
  kind: 'goo' | 'blood',
): void {
  for (let i = 0; i < count; i++) {
    const angle  = Math.random() * Math.PI * 2;
    const spread = Math.random() * style.spread;  // how far from center
    const x = pos.x + Math.cos(angle) * spread;
    const z = pos.z + Math.sin(angle) * spread;
    const radius = style.minRadius + Math.random() * (style.maxRadius - style.minRadius);
    const alpha = style.alphaMin + Math.random() * (style.alphaMax - style.alphaMin);
    const stretch = style.stretchMin + Math.random() * (style.stretchMax - style.stretchMin);
    const stretchAxis = Math.random() < 0.5
      ? { x: stretch, z: 1 / Math.max(stretch, 0.001) }
      : { x: 1 / Math.max(stretch, 0.001), z: stretch };

    const color = palette[Math.floor(Math.random() * palette.length)];

    const decal = acquireDecal();

    decal.mesh.position.set(x, DECAL_Y, z);
    decal.mesh.rotation.z = Math.random() * Math.PI * 2; // random rotation
    decal.mesh.scale.set(radius * 2 * stretchAxis.x, radius * 2 * stretchAxis.z, 1);
    decal.mesh.visible = true;
    if (decal.material.blending !== style.blending) {
      decal.material.blending = style.blending;
      decal.material.needsUpdate = true;
    }
    decal.material.uniforms.uColor.value.set(color.r, color.g, color.b);
    decal.material.uniforms.uAlpha.value = alpha;
    decal.kind = kind;
    decal.baseAlpha = alpha;
    decal.birthTime = time;
    decal.alive = true;

    freeHead = (freeHead + 1) % MAX_DECALS;
  }
}

function acquireDecal(): Decal {
  let decal: Decal;
  if (freeHead < decals.length) {
    decal = decals[freeHead];
    if (decal.alive) decal.alive = false;
    return decal;
  }

  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Vector3() },
      uAlpha: { value: 1.0 },
    },
    vertexShader:   VERT,
    fragmentShader: FRAG,
    transparent:    true,
    depthWrite:     false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  sceneRef.add(mesh);
  decal = { mesh, material: mat, kind: 'goo', baseAlpha: 1.0, birthTime: 0, alive: false };
  decals.push(decal);
  return decal;
}

/** Splatter a cluster of goo decals on the floor around a point. */
export function spawnGooSplat(
  pos: { x: number; z: number },
  count: number,
  time: number,
): void {
  spawnDecalSplat(pos, count, time, GOO_COLORS, GOO_SPLAT_STYLE, 'goo');
}

/** Splatter a cluster of blood decals on the floor around a point. */
export function spawnBloodSplat(
  pos: { x: number; z: number },
  count: number,
  time: number,
): void {
  // Layered blood: dark soaked base + wetter red highlights.
  spawnDecalSplat(pos, Math.max(1, Math.floor(count * 1.25)), time, BLOOD_COLORS, BLOOD_SPLAT_STYLE, 'blood');
  spawnDecalSplat(pos, Math.max(1, Math.floor(count * 0.85)), time, BLOOD_WET_COLORS, BLOOD_WET_SPLAT_STYLE, 'blood');
}

// ─── Update (fade old decals) ───────────────────────────────────────────────

export interface BloodDragInput {
  pos: { x: number; z: number };
  vel: { x: number; z: number };
  radius: number;
}

function spinnerTouchingBlood(input: BloodDragInput): boolean {
  const checkRadius = input.radius + BLOOD_DRAG_RADIUS_PADDING;
  for (const d of decals) {
    if (!d.alive || d.kind !== 'blood') continue;
    const age = d.birthTime;
    if (!Number.isFinite(age)) continue;
    const dx = input.pos.x - d.mesh.position.x;
    const dz = input.pos.z - d.mesh.position.z;
    const decalRadius = Math.max(d.mesh.scale.x, d.mesh.scale.y) * 0.5;
    const r = checkRadius + decalRadius;
    if (dx * dx + dz * dz <= r * r) return true;
  }
  return false;
}

function maybeSpawnBloodDragTrail(time: number, input: BloodDragInput): void {
  const touchingBlood = spinnerTouchingBlood(input);
  if (touchingBlood) {
    if (!wasTouchingBlood) {
      bloodDragLoad = BLOOD_DRAG_LOAD_GAIN_ON_ENTRY;
    } else {
      bloodDragLoad = Math.min(1, bloodDragLoad + BLOOD_DRAG_LOAD_GAIN_WHILE_TOUCHING);
    }
  }
  wasTouchingBlood = touchingBlood;

  const speed = Math.hypot(input.vel.x, input.vel.z);
  if (speed < BLOOD_DRAG_MIN_SPEED) return;
  if (time < nextBloodDragTime) return;
  if (!touchingBlood && bloodDragLoad <= 0.03) return;

  const invSpeed = 1 / Math.max(speed, 0.0001);
  const dirX = input.vel.x * invSpeed;
  const dirZ = input.vel.z * invSpeed;
  spawnBloodDragSmear(time, input, dirX, dirZ, speed, bloodDragLoad);
  bloodDragLoad = Math.max(0, bloodDragLoad - BLOOD_DRAG_LOAD_DECAY_ON_SPAWN);
  nextBloodDragTime = time + BLOOD_DRAG_INTERVAL;
}

function spawnBloodDragSmear(
  time: number,
  input: BloodDragInput,
  dirX: number,
  dirZ: number,
  speed: number,
  load: number,
): void {
  const perpX = -dirZ;
  const perpZ = dirX;
  const angle = Math.atan2(dirZ, dirX);
  const speedBoost = Math.min(0.35, speed * 0.025);
  const strokes = BLOOD_DRAG_STROKES_MIN + Math.floor(Math.random() * (BLOOD_DRAG_STROKES_MAX - BLOOD_DRAG_STROKES_MIN + 1));
  const clampedLoad = Math.max(0, Math.min(1, load));
  const totalLengthBase = BLOOD_DRAG_LENGTH_MIN + Math.random() * (BLOOD_DRAG_LENGTH_MAX - BLOOD_DRAG_LENGTH_MIN);
  const totalLength = totalLengthBase * (0.65 + clampedLoad * 0.85) + speedBoost;
  const headWidth = BLOOD_DRAG_HEAD_WIDTH_MIN + (BLOOD_DRAG_HEAD_WIDTH_MAX - BLOOD_DRAG_HEAD_WIDTH_MIN) * clampedLoad;
  const tailWidth = BLOOD_DRAG_TAIL_WIDTH_MIN + Math.random() * (BLOOD_DRAG_TAIL_WIDTH_MAX - BLOOD_DRAG_TAIL_WIDTH_MIN);
  const segmentLength = totalLength / BLOOD_DRAG_SEGMENTS;

  for (let stroke = 0; stroke < strokes; stroke++) {
    const rearOffset = input.radius * 0.76 + 0.14 + Math.random() * 0.28;
    const lateralOffset = (Math.random() * 2 - 1) * (input.radius * 0.28);
    for (let seg = 0; seg < BLOOD_DRAG_SEGMENTS; seg++) {
      const t = seg / Math.max(1, BLOOD_DRAG_SEGMENTS - 1);
      const width = THREE.MathUtils.lerp(headWidth, tailWidth, t);
      const dist = rearOffset + t * totalLength;
      const x = input.pos.x - dirX * dist + perpX * (lateralOffset * (1.0 - t * 0.35));
      const z = input.pos.z - dirZ * dist + perpZ * (lateralOffset * (1.0 - t * 0.35));
      const alpha = (0.9 - t * 0.45) * (0.5 + clampedLoad * 0.5);
      const colorPool = t < 0.4 ? BLOOD_WET_COLORS : BLOOD_COLORS;
      const color = colorPool[Math.floor(Math.random() * colorPool.length)];
      const decal = acquireDecal();

      decal.mesh.position.set(x, DECAL_Y, z);
      decal.mesh.rotation.z = angle + (Math.random() * 2 - 1) * 0.08;
      decal.mesh.scale.set(segmentLength * (1.08 - t * 0.2), width, 1);
      decal.mesh.visible = true;
      if (decal.material.blending !== THREE.NormalBlending) {
        decal.material.blending = THREE.NormalBlending;
        decal.material.needsUpdate = true;
      }
      decal.material.uniforms.uColor.value.set(color.r, color.g, color.b);
      decal.material.uniforms.uAlpha.value = alpha;
      decal.kind = 'blood';
      decal.baseAlpha = alpha;
      decal.birthTime = time;
      decal.alive = true;

      freeHead = (freeHead + 1) % MAX_DECALS;
    }
  }
}

export function updateGooDecals(time: number, bloodDragInput?: BloodDragInput): void {
  if (bloodDragInput) maybeSpawnBloodDragTrail(time, bloodDragInput);

  for (const d of decals) {
    if (!d.alive) continue;
    const age = time - d.birthTime;
    if (age > FADE_START + FADE_DURATION) {
      d.alive = false;
      d.mesh.visible = false;
      continue;
    }
    if (age > FADE_START) {
      d.material.uniforms.uAlpha.value = d.baseAlpha * (1.0 - (age - FADE_START) / FADE_DURATION);
    }
  }
}

// ─── Reset ──────────────────────────────────────────────────────────────────

export function resetGooDecals(): void {
  for (const d of decals) {
    d.alive = false;
    d.mesh.visible = false;
  }
  freeHead = 0;
  nextBloodDragTime = 0;
  bloodDragLoad = 0;
  wasTouchingBlood = false;
}
