import * as THREE from 'three';

// ─── Config ─────────────────────────────────────────────────────────────────

const MAX_DECALS_NORMAL = 280;   // goo, blood-wet highlights, blood-drag smears
const MAX_DECALS_MULTIPLY = 200;  // dark blood base layer
const VERTS_PER_DECAL = 4;
const TRIS_PER_DECAL = 2;
const DEAD_BIRTH_TIME = -9999;
const DECAL_Y = 0.04;
const GOO_SPLAT_MIN_RADIUS = 0.15;
const GOO_SPLAT_MAX_RADIUS = 0.6;
const BLOOD_SPLAT_MIN_RADIUS = 0.28;
const BLOOD_SPLAT_MAX_RADIUS = 0.95;
const FADE_START = 25.0;
const FADE_DURATION = 10.0;
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

// Decal kinds — drives the spinnerTouchingBlood filter only.
// 0 = goo, 1 = blood (counts as a pool), 2 = blood_drag (must NOT count, or
// the spinner picks up its own trail and refills load forever).
const KIND_GOO = 0;
const KIND_BLOOD = 1;
const KIND_BLOOD_DRAG = 2;

// ─── Shaders ────────────────────────────────────────────────────────────────

const VERT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uFadeStart;
uniform float uFadeDuration;

// position holds the per-vertex world corner (already rotated/scaled at spawn
// time). The shader just transforms it.
attribute vec2 aUV;          // 0..1 within the quad — for the fragment shader
attribute vec3 aColor;
attribute float aBaseAlpha;
attribute float aBirthTime;

varying vec2 vUV;
varying vec3 vColor;
varying float vAlpha;

void main() {
  if (aBirthTime < -1000.0) {
    gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    return;
  }
  float age = uTime - aBirthTime;
  if (age < 0.0 || age > uFadeStart + uFadeDuration) {
    gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    return;
  }
  float fadeMul = age > uFadeStart
    ? 1.0 - (age - uFadeStart) / uFadeDuration
    : 1.0;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vUV = aUV;
  vColor = aColor;
  vAlpha = aBaseAlpha * fadeMul;
}
`;

const FRAG_COMMON = /* glsl */ `
varying vec2 vUV;
varying vec3 vColor;
varying float vAlpha;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 computeDecal() {
  vec2 c = vUV - 0.5;
  float d = length(c) * 2.0;
  float angle = atan(c.y, c.x);
  float wobble = 0.85 + 0.15 * sin(angle * 5.0) * sin(angle * 3.0 + 1.5);
  d /= wobble;
  if (d > 1.0) discard;

  float breakup = hash12(vUV * 22.0 + vec2(0.37, 0.11));
  if (breakup < smoothstep(0.82, 1.0, d) * 0.3) discard;

  float darken = 1.0 - d * 0.4;
  vec3 col = vColor * darken;
  float edge = 1.0 - smoothstep(0.7, 1.0, d);
  float a = edge * vAlpha * 0.85;
  return vec4(col, a);
}
`;

// Premultiplied output — works correctly with both NormalBlending and
// AdditiveBlending when the material has premultipliedAlpha = true.
const FRAG_NORMAL = /* glsl */ `
${FRAG_COMMON}
void main() {
  vec4 cd = computeDecal();
  gl_FragColor = vec4(cd.rgb * cd.a, cd.a);
}
`;

// MultiplyBlending in Three.js uses the blend factors (ZERO, SRC_COLOR), so
// the source color IS the multiplier. We want unaffected pixels (a=0) to
// produce 1.0 (i.e. no change to the floor), and opaque decal pixels to
// produce the decal color directly. Hence mix(white, col, a).
const FRAG_MULTIPLY = /* glsl */ `
${FRAG_COMMON}
void main() {
  vec4 cd = computeDecal();
  gl_FragColor = vec4(mix(vec3(1.0), cd.rgb, cd.a), 1.0);
}
`;

// ─── Palette ────────────────────────────────────────────────────────────────

const GOO_COLORS = [
  new THREE.Color(0x1a6b0a),
  new THREE.Color(0x0d4a06),
  new THREE.Color(0x2d8a15),
  new THREE.Color(0x3d5c00),
];

const BLOOD_COLORS = [
  new THREE.Color(0x56110d),
  new THREE.Color(0x6b1611),
  new THREE.Color(0x7a1913),
  new THREE.Color(0x48100c),
  new THREE.Color(0x861f17),
];

const BLOOD_WET_COLORS = [
  new THREE.Color(0xc51f1a),
  new THREE.Color(0xdc261f),
  new THREE.Color(0xb31a16),
  new THREE.Color(0xf03029),
  new THREE.Color(0xff3d35),
];

// ─── Splat styles ───────────────────────────────────────────────────────────

interface DecalSplatStyle {
  minRadius: number;
  maxRadius: number;
  spread: number;
  stretchMin: number;
  stretchMax: number;
  alphaMin: number;
  alphaMax: number;
  system: 'normal' | 'multiply';
}

const GOO_SPLAT_STYLE: DecalSplatStyle = {
  minRadius: GOO_SPLAT_MIN_RADIUS,
  maxRadius: GOO_SPLAT_MAX_RADIUS,
  spread: 1.8,
  stretchMin: 0.92,
  stretchMax: 1.12,
  alphaMin: 0.8,
  alphaMax: 1.0,
  system: 'normal',
};

const BLOOD_SPLAT_STYLE: DecalSplatStyle = {
  minRadius: BLOOD_SPLAT_MIN_RADIUS,
  maxRadius: BLOOD_SPLAT_MAX_RADIUS * 1.25,
  spread: 3.1,
  stretchMin: 0.7,
  stretchMax: 1.55,
  alphaMin: 0.86,
  alphaMax: 1.0,
  system: 'multiply',
};

const BLOOD_WET_SPLAT_STYLE: DecalSplatStyle = {
  minRadius: BLOOD_SPLAT_MIN_RADIUS * 0.45,
  maxRadius: BLOOD_SPLAT_MAX_RADIUS * 0.78,
  spread: 2.35,
  stretchMin: 0.72,
  stretchMax: 1.48,
  alphaMin: 0.72,
  alphaMax: 0.98,
  system: 'normal',
};

// ─── Batched render system ──────────────────────────────────────────────────

interface DecalSystem {
  capacity: number;

  // Per-vertex attribute arrays (capacity × 4 verts).
  positions: Float32Array;   // vec3, world-space corner positions (rotated+scaled at spawn)
  colors: Float32Array;
  alphas: Float32Array;
  birthTimes: Float32Array;

  // Per-decal metadata for spinnerTouchingBlood proximity check.
  decalKind: Uint8Array;
  decalCenterX: Float32Array;
  decalCenterZ: Float32Array;
  decalRadius: Float32Array;
  decalBirthTime: Float32Array;

  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  freeHead: number;

  // Track which buffer attributes are dirty since the last frame so we only
  // flag what was actually written.
  dirty: boolean;
}

let normalSystem: DecalSystem | null = null;
let multiplySystem: DecalSystem | null = null;
let sceneRef: THREE.Scene;
let nextBloodDragTime = 0;
let bloodDragLoad = 0;
let wasTouchingBlood = false;

function createDecalSystem(blending: THREE.Blending, capacity: number, fragShader: string): DecalSystem {
  const vertCount = capacity * VERTS_PER_DECAL;

  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const colors = new Float32Array(vertCount * 3);
  const alphas = new Float32Array(vertCount);
  const birthTimes = new Float32Array(vertCount).fill(DEAD_BIRTH_TIME);

  // Per-vert UV pattern (0,0) (1,0) (1,1) (0,1) — fed straight to the fragment
  // shader for the splat-shape math.
  for (let i = 0; i < capacity; i++) {
    const v0 = i * VERTS_PER_DECAL;
    uvs[(v0 + 0) * 2 + 0] = 0; uvs[(v0 + 0) * 2 + 1] = 0;
    uvs[(v0 + 1) * 2 + 0] = 1; uvs[(v0 + 1) * 2 + 1] = 0;
    uvs[(v0 + 2) * 2 + 0] = 1; uvs[(v0 + 2) * 2 + 1] = 1;
    uvs[(v0 + 3) * 2 + 0] = 0; uvs[(v0 + 3) * 2 + 1] = 1;
  }

  // Wind CCW when viewed from above (+Y looking down) so the camera sees the
  // front face. Going BL → TR → BR (and BL → TL → TR) is CCW from above.
  const indices = new (vertCount > 65535 ? Uint32Array : Uint16Array)(capacity * TRIS_PER_DECAL * 3);
  for (let i = 0; i < capacity; i++) {
    const v = i * VERTS_PER_DECAL;
    const idx = i * TRIS_PER_DECAL * 3;
    indices[idx + 0] = v + 0; indices[idx + 1] = v + 2; indices[idx + 2] = v + 1;
    indices[idx + 3] = v + 0; indices[idx + 4] = v + 3; indices[idx + 5] = v + 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute('position',   new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aUV',        new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('aColor',     new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aBaseAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('aBirthTime', new THREE.BufferAttribute(birthTimes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime:         { value: 0 },
      uFadeStart:    { value: FADE_START },
      uFadeDuration: { value: FADE_DURATION },
    },
    vertexShader:       VERT_SHADER,
    fragmentShader:     fragShader,
    transparent:        true,
    // Three.js demands premultipliedAlpha=true for MultiplyBlending. The blend
    // factors (ZERO, SRC_COLOR) are unchanged, so the multiply shader's
    // mix(white, col, a) output still produces dst*srcColor as intended.
    premultipliedAlpha: true,
    depthWrite:         false,
    blending,
    polygonOffset:      true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;

  return {
    capacity,
    positions,
    colors,
    alphas,
    birthTimes,
    decalKind:      new Uint8Array(capacity),
    decalCenterX:   new Float32Array(capacity),
    decalCenterZ:   new Float32Array(capacity),
    decalRadius:    new Float32Array(capacity),
    decalBirthTime: new Float32Array(capacity).fill(DEAD_BIRTH_TIME),
    geometry,
    material,
    mesh,
    freeHead: 0,
    dirty: false,
  };
}

function ensureSystems(): void {
  if (normalSystem || !sceneRef) return;
  normalSystem = createDecalSystem(THREE.NormalBlending, MAX_DECALS_NORMAL, FRAG_NORMAL);
  multiplySystem = createDecalSystem(THREE.MultiplyBlending, MAX_DECALS_MULTIPLY, FRAG_MULTIPLY);
  sceneRef.add(normalSystem.mesh);
  sceneRef.add(multiplySystem.mesh);
}

// Corner offsets in the local quad's frame, matching the (0,0)/(1,0)/(1,1)/(0,1)
// UV pattern set up in createDecalSystem.
const CORNER_X = [-0.5, 0.5, 0.5, -0.5];
const CORNER_Z = [-0.5, -0.5, 0.5, 0.5];

function writeDecal(
  sys: DecalSystem,
  slot: number,
  x: number,
  z: number,
  scaleX: number,
  scaleY: number,
  rotation: number,
  color: THREE.Color,
  alpha: number,
  birthTime: number,
  kindCode: number,
): void {
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const v0 = slot * VERTS_PER_DECAL;

  for (let v = 0; v < VERTS_PER_DECAL; v++) {
    const localX = CORNER_X[v] * scaleX;
    const localZ = CORNER_Z[v] * scaleY;
    const worldX = x + localX * cosR - localZ * sinR;
    const worldZ = z + localX * sinR + localZ * cosR;

    const vidx = v0 + v;
    sys.positions[vidx * 3 + 0] = worldX;
    sys.positions[vidx * 3 + 1] = DECAL_Y;
    sys.positions[vidx * 3 + 2] = worldZ;
    sys.colors[vidx * 3 + 0] = color.r;
    sys.colors[vidx * 3 + 1] = color.g;
    sys.colors[vidx * 3 + 2] = color.b;
    sys.alphas[vidx] = alpha;
    sys.birthTimes[vidx] = birthTime;
  }

  sys.decalKind[slot] = kindCode;
  sys.decalCenterX[slot] = x;
  sys.decalCenterZ[slot] = z;
  sys.decalRadius[slot] = Math.max(Math.abs(scaleX), Math.abs(scaleY)) * 0.5;
  sys.decalBirthTime[slot] = birthTime;
  sys.dirty = true;
}

function flushDirty(sys: DecalSystem): void {
  if (!sys.dirty) return;
  sys.geometry.attributes.position.needsUpdate   = true;
  sys.geometry.attributes.aColor.needsUpdate     = true;
  sys.geometry.attributes.aBaseAlpha.needsUpdate = true;
  sys.geometry.attributes.aBirthTime.needsUpdate = true;
  sys.dirty = false;
}

function acquireSlot(sys: DecalSystem): number {
  const slot = sys.freeHead;
  sys.freeHead = (sys.freeHead + 1) % sys.capacity;
  return slot;
}

// ─── Init ───────────────────────────────────────────────────────────────────

export function initGooDecals(scn: THREE.Scene): void {
  sceneRef = scn;
  ensureSystems();
}

// ─── Spawn ──────────────────────────────────────────────────────────────────

function spawnDecalSplat(
  pos: { x: number; z: number },
  count: number,
  time: number,
  palette: THREE.Color[],
  style: DecalSplatStyle,
  kindCode: number,
): void {
  ensureSystems();
  const sys = style.system === 'multiply' ? multiplySystem : normalSystem;
  if (!sys) return;

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spread = Math.random() * style.spread;
    const x = pos.x + Math.cos(angle) * spread;
    const z = pos.z + Math.sin(angle) * spread;
    const radius = style.minRadius + Math.random() * (style.maxRadius - style.minRadius);
    const alpha = style.alphaMin + Math.random() * (style.alphaMax - style.alphaMin);
    const stretch = style.stretchMin + Math.random() * (style.stretchMax - style.stretchMin);
    const stretchX = Math.random() < 0.5 ? stretch : 1 / Math.max(stretch, 0.001);
    const stretchZ = stretchX === stretch ? 1 / Math.max(stretch, 0.001) : stretch;
    const color = palette[Math.floor(Math.random() * palette.length)];
    const slot = acquireSlot(sys);
    writeDecal(
      sys, slot,
      x, z,
      radius * 2 * stretchX,
      radius * 2 * stretchZ,
      Math.random() * Math.PI * 2,
      color, alpha, time, kindCode,
    );
  }
}

/** Splatter a cluster of goo decals on the floor around a point. */
export function spawnGooSplat(
  pos: { x: number; z: number },
  count: number,
  time: number,
): void {
  spawnDecalSplat(pos, count, time, GOO_COLORS, GOO_SPLAT_STYLE, KIND_GOO);
}

/** Splatter a cluster of blood decals on the floor around a point. */
export function spawnBloodSplat(
  pos: { x: number; z: number },
  count: number,
  time: number,
): void {
  spawnDecalSplat(pos, Math.max(1, Math.floor(count * 1.25)), time, BLOOD_COLORS, BLOOD_SPLAT_STYLE, KIND_BLOOD);
  spawnDecalSplat(pos, Math.max(1, Math.floor(count * 0.85)), time, BLOOD_WET_COLORS, BLOOD_WET_SPLAT_STYLE, KIND_BLOOD);
}

// ─── Blood drag ─────────────────────────────────────────────────────────────

export interface BloodDragInput {
  pos: { x: number; z: number };
  vel: { x: number; z: number };
  radius: number;
}

function spinnerTouchingBlood(input: BloodDragInput, time: number): boolean {
  const checkRadius = input.radius + BLOOD_DRAG_RADIUS_PADDING;
  const fadeOutAt = FADE_START + FADE_DURATION;

  const systems: DecalSystem[] = [];
  if (multiplySystem) systems.push(multiplySystem);
  if (normalSystem) systems.push(normalSystem);

  for (const sys of systems) {
    for (let i = 0; i < sys.capacity; i++) {
      if (sys.decalKind[i] !== KIND_BLOOD) continue;
      const birth = sys.decalBirthTime[i];
      if (birth < -1000) continue;
      if (time - birth > fadeOutAt) continue;
      const dx = input.pos.x - sys.decalCenterX[i];
      const dz = input.pos.z - sys.decalCenterZ[i];
      const r = checkRadius + sys.decalRadius[i];
      if (dx * dx + dz * dz <= r * r) return true;
    }
  }
  return false;
}

function maybeSpawnBloodDragTrail(time: number, input: BloodDragInput): void {
  const touchingBlood = spinnerTouchingBlood(input, time);
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
  ensureSystems();
  const sys = normalSystem;
  if (!sys) return;

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
      const slot = acquireSlot(sys);
      writeDecal(
        sys, slot,
        x, z,
        segmentLength * (1.08 - t * 0.2),
        width,
        angle + (Math.random() * 2 - 1) * 0.08,
        color, alpha, time, KIND_BLOOD_DRAG,
      );
    }
  }
}

// ─── Update ─────────────────────────────────────────────────────────────────

export function updateGooDecals(time: number, bloodDragInput?: BloodDragInput): void {
  if (bloodDragInput) maybeSpawnBloodDragTrail(time, bloodDragInput);

  if (normalSystem) {
    normalSystem.material.uniforms.uTime.value = time;
    flushDirty(normalSystem);
  }
  if (multiplySystem) {
    multiplySystem.material.uniforms.uTime.value = time;
    flushDirty(multiplySystem);
  }
}

// ─── Reset ──────────────────────────────────────────────────────────────────

function resetSystem(sys: DecalSystem): void {
  sys.birthTimes.fill(DEAD_BIRTH_TIME);
  sys.decalBirthTime.fill(DEAD_BIRTH_TIME);
  sys.decalKind.fill(0);
  sys.freeHead = 0;
  sys.geometry.attributes.aBirthTime.needsUpdate = true;
}

export function resetGooDecals(): void {
  if (normalSystem) resetSystem(normalSystem);
  if (multiplySystem) resetSystem(multiplySystem);
  nextBloodDragTime = 0;
  bloodDragLoad = 0;
  wasTouchingBlood = false;
}
