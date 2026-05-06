import * as THREE from 'three';
import { scene } from './renderer';
import { playExplosionSound } from './sound';

// ─── Constants ───────────────────────────────────────────────────────────────

const EXPLOSION_DURATION   = 0.8;   // seconds — total lifetime
const EXPLOSION_MAX_RADIUS = 3.2;   // world units at peak expansion
const ENERGY_EXPLOSION_DURATION   = 1.0;
const ENERGY_EXPLOSION_MAX_RADIUS = 3.6;
const ROBOT_EXPLOSION_DURATION    = 1.0;
const ROBOT_EXPLOSION_MAX_RADIUS  = 4.2;

// ─── Energy Explosion Shader ────────────────────────────────────────────────

const ENERGY_EXPLOSION_VERT = /* glsl */ `
uniform float uTime;
uniform float uLife;
uniform float uSeed;

varying vec3  vNormalW;
varying vec3  vWorldPos;
varying float vNoise;

float gyroid(vec3 p) {
  return dot(cos(p), sin(p.yzx));
}

float fbm(vec3 p) {
  float result = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    p.z += result * 0.1;
    result += abs(gyroid(p / a) * a);
    a /= 1.7;
  }
  return result;
}

void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);

  vec3 flow = normal * 5.0 + vec3(uSeed, uTime * 2.4, uLife * 6.0);
  vNoise = fbm(flow);

  float punch = smoothstep(0.0, 0.2, uLife) * (1.0 - smoothstep(0.55, 1.0, uLife));
  vec3 displaced = position + normal * (vNoise - 0.7) * 0.22 * punch;

  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const ENERGY_EXPLOSION_FRAG = /* glsl */ `
uniform float uTime;
uniform float uLife;
uniform float uSeed;
uniform float uOpacity;

varying vec3  vNormalW;
varying vec3  vWorldPos;
varying float vNoise;

float gyroid(vec3 p) {
  return dot(cos(p), sin(p.yzx));
}

float fbm(vec3 p) {
  float result = 0.0;
  float a = 0.5;
  for (int i = 0; i < 8; i++) {
    p.z += result * 0.1;
    result += abs(gyroid(p / a) * a);
    a /= 1.7;
  }
  return result;
}

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - abs(dot(normalize(vNormalW), viewDir)), 2.0);

  vec3 p = normalize(vNormalW) * (5.5 + uLife * 4.0);
  p += vec3(uSeed * 1.7, uTime * 2.6, -uTime * 1.4);
  float n = fbm(p);

  float burn = 1.0 - pow(uLife, 0.42);
  float smoke = smoothstep(0.45 + burn * 0.75, 1.8, n + vNoise * 0.28);
  float hot = smoothstep(1.15, 2.05, n + burn * 0.9);
  float core = smoothstep(0.92, 0.0, uLife) * smoothstep(0.35, 1.6, n);

  vec3 cyan = vec3(0.18, 0.9, 1.0);
  vec3 whiteHot = vec3(1.0, 0.98, 0.82);
  vec3 orange = vec3(1.0, 0.34, 0.04);
  vec3 ember = vec3(0.18, 0.04, 0.015);

  vec3 color = mix(cyan, whiteHot, core);
  color = mix(color, orange, hot * (0.55 + burn * 0.45));
  color = mix(color, ember, smoke * smoothstep(0.22, 0.95, uLife));
  color += cyan * fresnel * (1.5 - uLife);

  float shell = smoothstep(0.0, 0.12, uLife) * (1.0 - smoothstep(0.72, 1.0, uLife));
  float alpha = (0.28 + hot * 0.45 + fresnel * 0.75) * shell * uOpacity;

  gl_FragColor = vec4(color, alpha);
}
`;

// ─── Fireball Explosion Shader ──────────────────────────────────────────────

const FIREBALL_EXPLOSION_VERT = /* glsl */ `
uniform float uTime;
uniform float uLife;
uniform float uSeed;

varying vec3  vNormalW;
varying vec3  vWorldPos;
varying float vNoise;

float gyroid(vec3 p) {
  return dot(cos(p), sin(p.yzx));
}

float fbm(vec3 p) {
  float result = 0.0;
  float a = 0.52;
  for (int i = 0; i < 7; i++) {
    p.z += result * 0.12;
    result += abs(gyroid(p / a) * a);
    a /= 1.65;
  }
  return result;
}

void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);

  vec3 flow = normal * 4.4 + vec3(uSeed * 0.8, -uTime * 1.8, uLife * 7.0);
  vNoise = fbm(flow);

  float earlyPunch = 1.0 - smoothstep(0.42, 1.0, uLife);
  float ragged = (vNoise - 0.78) * 0.42 * earlyPunch;
  vec3 displaced = position + normal * ragged;

  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const FIREBALL_EXPLOSION_FRAG = /* glsl */ `
uniform float uTime;
uniform float uLife;
uniform float uSeed;
uniform float uOpacity;

varying vec3  vNormalW;
varying vec3  vWorldPos;
varying float vNoise;

float gyroid(vec3 p) {
  return dot(cos(p), sin(p.yzx));
}

float fbm(vec3 p) {
  float result = 0.0;
  float a = 0.5;
  for (int i = 0; i < 8; i++) {
    p.z += result * 0.1;
    result += abs(gyroid(p / a) * a);
    a /= 1.7;
  }
  return result;
}

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - abs(dot(normalize(vNormalW), viewDir)), 1.8);

  vec3 p = normalize(vNormalW) * (4.0 + uLife * 6.5);
  p += vec3(uSeed, -uTime * 2.2, uTime * 1.5);
  float n = fbm(p);

  vec3 sootP = normalize(vNormalW) * 2.15 + vec3(uSeed * 0.31, uTime * 0.45, -uTime * 0.25);
  float sootNoise = fbm(sootP);

  float heat = 1.0 - uLife;
  float turbulence = n + vNoise * 0.35;
  float core = smoothstep(0.75, 1.95, turbulence + heat * 0.95);
  float flame = smoothstep(0.42, 1.55, turbulence + heat * 0.35);
  float smoke = smoothstep(0.78, 1.7, turbulence - heat * 0.3);
  float ember = smoothstep(1.35, 2.25, turbulence + heat * 0.15);
  float sootWindow = smoothstep(0.16, 0.36, uLife) * (1.0 - smoothstep(0.82, 1.0, uLife));
  float soot = smoothstep(0.92, 1.62, sootNoise + vNoise * 0.18 - heat * 0.05) * sootWindow;

  vec3 smokeCol = vec3(0.035, 0.028, 0.022);
  vec3 sootCol = vec3(0.012, 0.009, 0.006);
  vec3 deepRed = vec3(0.42, 0.035, 0.0);
  vec3 orange = vec3(1.0, 0.24, 0.015);
  vec3 yellow = vec3(1.0, 0.72, 0.08);
  vec3 whiteHot = vec3(1.0, 0.96, 0.72);

  vec3 color = mix(deepRed, orange, flame);
  color = mix(color, yellow, core * (0.55 + heat * 0.25));
  color = mix(color, whiteHot, core * heat * 0.8);
  color = mix(color, smokeCol, smoke * smoothstep(0.28, 0.95, uLife));
  color = mix(color, sootCol, soot * (0.58 + smoothstep(0.34, 0.8, uLife) * 0.28));
  color += orange * fresnel * (0.25 + heat * 0.45);
  color += deepRed * ember * smoothstep(0.35, 1.0, uLife);

  float birth = smoothstep(0.0, 0.08, uLife);
  float fade = 1.0 - smoothstep(0.74, 1.0, uLife);
  float raggedMask = smoothstep(0.15, 0.95, turbulence + heat * 0.25);
  float alpha = (0.35 + flame * 0.4 + core * 0.35 + fresnel * 0.18 + soot * 0.32)
    * birth * fade * raggedMask * uOpacity;

  gl_FragColor = vec4(color, alpha);
}
`;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Explosion {
  mesh:      THREE.Mesh;
  elapsed:   number;
  alive:     boolean;
  duration:  number;
  maxRadius: number;
  kind:      'energy' | 'fireball';
}

// ─── Factory ─────────────────────────────────────────────────────────────────

function createFireballExplosion(
  pos: { x: number; z: number },
  duration: number,
  maxRadius: number,
  height = 0.75,
): Explosion {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime:    { value: 0 },
      uLife:    { value: 0 },
      uSeed:    { value: Math.random() * 100 },
      uOpacity: { value: 1 },
    },
    vertexShader:   FIREBALL_EXPLOSION_VERT,
    fragmentShader: FIREBALL_EXPLOSION_FRAG,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.NormalBlending,
    side:           THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 28),
    material,
  );
  mesh.position.set(pos.x, height, pos.z);
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    mesh,
    elapsed: 0,
    alive: true,
    duration,
    maxRadius,
    kind: 'fireball',
  };
}

export function createExplosion(pos: { x: number; z: number }): Explosion {
  playExplosionSound(0.82);
  return createFireballExplosion(pos, EXPLOSION_DURATION, EXPLOSION_MAX_RADIUS, 0.65);
}

export function createEnergyExplosion(pos: { x: number; z: number }): Explosion {
  playExplosionSound(0.9);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime:    { value: 0 },
      uLife:    { value: 0 },
      uSeed:    { value: Math.random() * 100 },
      uOpacity: { value: 1 },
    },
    vertexShader:   ENERGY_EXPLOSION_VERT,
    fragmentShader: ENERGY_EXPLOSION_FRAG,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.AdditiveBlending,
    side:           THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 40, 24),
    material,
  );
  mesh.position.set(pos.x, 0.65, pos.z);
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    mesh,
    elapsed: 0,
    alive: true,
    duration: ENERGY_EXPLOSION_DURATION,
    maxRadius: ENERGY_EXPLOSION_MAX_RADIUS,
    kind: 'energy',
  };
}

export function createRobotExplosion(pos: { x: number; z: number }): Explosion {
  playExplosionSound(1.0);
  return createFireballExplosion(pos, ROBOT_EXPLOSION_DURATION, ROBOT_EXPLOSION_MAX_RADIUS, 0.75);
}

// ─── Update ──────────────────────────────────────────────────────────────────

export function updateExplosions(explosions: Explosion[], delta: number): void {
  for (const e of explosions) {
    if (!e.alive) continue;

    e.elapsed += delta;
    const t = e.elapsed / e.duration;

    if (t >= 1) {
      e.alive = false;
      scene.remove(e.mesh);
      continue;
    }

    const eased = t * t * (3 - 2 * t);
    e.mesh.scale.setScalar(Math.max(0.01, eased * e.maxRadius));

    const material = e.mesh.material as THREE.ShaderMaterial;
    material.uniforms.uTime.value += delta;
    material.uniforms.uLife.value = t;
    material.uniforms.uOpacity.value = 1 - t;
  }
}

export function compactExplosions(explosions: Explosion[]): void {
  for (let i = explosions.length - 1; i >= 0; i--) {
    if (!explosions[i].alive) explosions.splice(i, 1);
  }
}

/**
 * Add dummy fireball + energy explosion meshes to the scene so their
 * ShaderMaterial programs compile during level-load compileAsync. Without
 * this, the first explosion at gameplay-time triggers a multi-second stall.
 * Returns a disposer that removes the dummies after compilation completes.
 */
export function prewarmExplosionMaterials(): () => void {
  const farY = -200;

  // Fireball variant (also covers createRobotExplosion — same shader).
  const fireballMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:    { value: 0 },
      uLife:    { value: 0 },
      uSeed:    { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader:   FIREBALL_EXPLOSION_VERT,
    fragmentShader: FIREBALL_EXPLOSION_FRAG,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.NormalBlending,
    side:           THREE.DoubleSide,
  });
  const fireballMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 28), fireballMat);
  fireballMesh.position.set(0, farY, 0);
  fireballMesh.frustumCulled = false;
  scene.add(fireballMesh);

  // Energy variant.
  const energyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:    { value: 0 },
      uLife:    { value: 0 },
      uSeed:    { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader:   ENERGY_EXPLOSION_VERT,
    fragmentShader: ENERGY_EXPLOSION_FRAG,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.AdditiveBlending,
    side:           THREE.DoubleSide,
  });
  const energyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), energyMat);
  energyMesh.position.set(0, farY, 0);
  energyMesh.frustumCulled = false;
  scene.add(energyMesh);

  return () => {
    // Remove the meshes from the scene (no draw-call cost during gameplay)
    // but DO NOT call material.dispose() — that triggers WebGLShaderCache
    // to evict the shader stage if usedTimes hits 0, and the next material
    // with the same source gets a fresh shader ID, a fresh cacheKey, and a
    // fresh compile mid-game. Keeping the dummy materials alive holds the
    // shader stage so subsequent createFireballExplosion calls hit the
    // program cache. Geometry is fine to dispose.
    scene.remove(fireballMesh);
    fireballMesh.geometry.dispose();
    scene.remove(energyMesh);
    energyMesh.geometry.dispose();
    keepAlive.push(fireballMat, energyMat);
  };
}

// Holds prewarm dummy materials beyond the disposer so their shader stages
// stay in WebGLShaderCache and their compiled programs in WebGLPrograms.
// Without this, disposing the dummy evicts the stage and the first real
// explosion mid-game compiles its shader from scratch.
const keepAlive: THREE.Material[] = [];
