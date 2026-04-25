import * as THREE from 'three';

// ─── Config ─────────────────────────────────────────────────────────────────

const MAX_DECALS       = 200;
const DECAL_Y          = 0.02;  // just above floor to avoid z-fight
const SPLAT_MIN_RADIUS = 0.15;
const SPLAT_MAX_RADIUS = 0.6;
const FADE_START       = 25.0;  // seconds before decals start fading
const FADE_DURATION    = 10.0;  // seconds to fully disappear

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

void main() {
  vec2  c = vUV - 0.5;
  float d = length(c) * 2.0;

  // Organic splat shape: distort the circle with noise-like wobble
  float angle = atan(c.y, c.x);
  float wobble = 0.85 + 0.15 * sin(angle * 5.0) * sin(angle * 3.0 + 1.5);
  d /= wobble;

  if (d > 1.0) discard;

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
  new THREE.Color(0x4a1508),  // dark blood
  new THREE.Color(0x6b1a0a),  // red gore
  new THREE.Color(0x3d5c00),  // olive
];

// ─── State ──────────────────────────────────────────────────────────────────

interface Decal {
  mesh:     THREE.Mesh;
  material: THREE.ShaderMaterial;
  birthTime: number;
  alive:    boolean;
}

let decals: Decal[] = [];
let sceneRef: THREE.Scene;
let freeHead = 0;

// ─── Init ───────────────────────────────────────────────────────────────────

export function initGooDecals(scn: THREE.Scene): void {
  sceneRef = scn;
}

// ─── Spawn ──────────────────────────────────────────────────────────────────

/** Splatter a cluster of goo decals on the floor around a point. */
export function spawnGooSplat(
  pos: { x: number; z: number },
  count: number,
  time: number,
): void {
  for (let i = 0; i < count; i++) {
    const angle  = Math.random() * Math.PI * 2;
    const spread = Math.random() * 1.8;  // how far from center
    const x = pos.x + Math.cos(angle) * spread;
    const z = pos.z + Math.sin(angle) * spread;
    const radius = SPLAT_MIN_RADIUS + Math.random() * (SPLAT_MAX_RADIUS - SPLAT_MIN_RADIUS);

    const color = GOO_COLORS[Math.floor(Math.random() * GOO_COLORS.length)];

    // Reuse or create
    let decal: Decal;
    if (freeHead < decals.length) {
      decal = decals[freeHead];
      if (decal.alive) {
        // Recycle oldest
        decal.alive = false;
      }
    } else {
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
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.frustumCulled = false;
      sceneRef.add(mesh);
      decal = { mesh, material: mat, birthTime: 0, alive: false };
      decals.push(decal);
    }

    decal.mesh.position.set(x, DECAL_Y, z);
    decal.mesh.rotation.z = Math.random() * Math.PI * 2; // random rotation
    decal.mesh.scale.set(radius * 2, radius * 2, 1);
    decal.mesh.visible = true;
    decal.material.uniforms.uColor.value.set(color.r, color.g, color.b);
    decal.material.uniforms.uAlpha.value = 1.0;
    decal.birthTime = time;
    decal.alive = true;

    freeHead = (freeHead + 1) % MAX_DECALS;
  }
}

// ─── Update (fade old decals) ───────────────────────────────────────────────

export function updateGooDecals(time: number): void {
  for (const d of decals) {
    if (!d.alive) continue;
    const age = time - d.birthTime;
    if (age > FADE_START + FADE_DURATION) {
      d.alive = false;
      d.mesh.visible = false;
      continue;
    }
    if (age > FADE_START) {
      d.material.uniforms.uAlpha.value = 1.0 - (age - FADE_START) / FADE_DURATION;
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
}
