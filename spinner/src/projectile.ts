import * as THREE from 'three';
import { scene } from './renderer';
import type { Segment, Vec2 } from './physics';
import { walls } from './physics';
import { emitSparks, RED_SPARK_STYLE } from './sparks';
import { emitRicochetBubbles } from './ricochetBubbles';
import { playProjectileLaserSound } from './sound';

// ─── Constants ───────────────────────────────────────────────────────────────

const PROJECTILE_RADIUS   = 0.12;
const PROJECTILE_LIFETIME = 6.0;

// ─── Helpers ────────────────────────────────────────────────────────────────

function projectileWallHit(pos: Vec2, seg: Segment): { point: Vec2; normal: Vec2 } | null {
  const dx = seg.p2.x - seg.p1.x;
  const dz = seg.p2.z - seg.p1.z;
  const segLenSq = dx * dx + dz * dz;
  if (segLenSq === 0) return null;

  const t = Math.max(0, Math.min(1,
    ((pos.x - seg.p1.x) * dx + (pos.z - seg.p1.z) * dz) / segLenSq
  ));

  const closestX = seg.p1.x + t * dx;
  const closestZ = seg.p1.z + t * dz;
  const nx = pos.x - closestX;
  const nz = pos.z - closestZ;
  const distSq = nx * nx + nz * nz;
  if (distSq >= PROJECTILE_RADIUS * PROJECTILE_RADIUS) return null;

  const dist = Math.sqrt(distSq);
  if (dist > 0.0001) {
    return {
      point:  { x: closestX, z: closestZ },
      normal: { x: nx / dist, z: nz / dist },
    };
  }

  const len = Math.sqrt(segLenSq);
  return {
    point:  { x: closestX, z: closestZ },
    normal: { x: -dz / len, z: dx / len },
  };
}

function sweepProjectileWallHit(start: Vec2, end: Vec2, seg: Segment): { point: Vec2; normal: Vec2 } | null {
  const initialHit = projectileWallHit(start, seg);
  if (initialHit) return initialHit;

  const moveX = end.x - start.x;
  const moveZ = end.z - start.z;
  const moveDist = Math.hypot(moveX, moveZ);
  if (moveDist <= 0.0001) return null;

  const steps = Math.max(1, Math.ceil(moveDist / Math.max(0.04, PROJECTILE_RADIUS * 0.4)));
  let lastSafeT = 0;

  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const sample = {
      x: start.x + moveX * t,
      z: start.z + moveZ * t,
    };
    const hit = projectileWallHit(sample, seg);
    if (!hit) {
      lastSafeT = t;
      continue;
    }

    let low = lastSafeT;
    let high = t;
    let best = hit;
    for (let i = 0; i < 5; i += 1) {
      const mid = (low + high) * 0.5;
      const midSample = {
        x: start.x + moveX * mid,
        z: start.z + moveZ * mid,
      };
      const midHit = projectileWallHit(midSample, seg);
      if (midHit) {
        best = midHit;
        high = mid;
      } else {
        low = mid;
      }
    }

    return best;
  }

  return null;
}

function sweepProjectileCircleHit(
  start: Vec2,
  end: Vec2,
  center: Vec2,
  radius: number,
): { point: Vec2 } | null {
  const vx = end.x - start.x;
  const vz = end.z - start.z;
  const sx = start.x - center.x;
  const sz = start.z - center.z;
  const a = vx * vx + vz * vz;
  const c = sx * sx + sz * sz - radius * radius;

  if (c <= 0) {
    return { point: { x: start.x, z: start.z } };
  }
  if (a <= 0.0000001) return null;

  const b = 2 * (sx * vx + sz * vz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const sqrtDisc = Math.sqrt(disc);
  const invDenom = 1 / (2 * a);
  const t1 = (-b - sqrtDisc) * invDenom;
  const t2 = (-b + sqrtDisc) * invDenom;
  const t = t1 >= 0 && t1 <= 1 ? t1 : (t2 >= 0 && t2 <= 1 ? t2 : null);
  if (t === null) return null;

  return {
    point: {
      x: start.x + vx * t,
      z: start.z + vz * t,
    },
  };
}

// ─── Velocity-aligned billboard vertex shader ───────────────────────────────
// Stretches a PlaneGeometry(2,2) in view space, oriented along the projectile's
// velocity direction.  uPerp swaps the axes: 0 = long axis along velocity (bolt),
// 1 = long axis perpendicular (glare streak).

const VERT = /* glsl */ `
uniform vec2  uSize;
uniform vec2  uVelDir;   // world XZ velocity direction (normalised)
uniform float uPerp;     // 0 = along velocity, 1 = perpendicular

varying vec2 vUV;

void main() {
  vec4 mvPos = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);

  // Velocity direction projected into view space
  vec4 velW  = vec4(uVelDir.x, 0.0, uVelDir.y, 0.0);
  vec2 rawVV = (modelViewMatrix * velW).xy;
  float len  = length(rawVV);
  vec2 vv    = (len > 0.001) ? rawVV / len : vec2(1.0, 0.0);
  vec2 pp    = vec2(-vv.y, vv.x);

  vec2 longA  = mix(vv, pp, uPerp);
  vec2 shortA = mix(pp, vv, uPerp);
  mvPos.xy += longA * position.x * uSize.x + shortA * position.y * uSize.y;

  gl_Position = projectionMatrix * mvPos;
  vUV = uv;
}
`;

// ─── Bolt fragment — elongated glow core ────────────────────────────────────

const BOLT_FRAG = /* glsl */ `
varying vec2 vUV;

void main() {
  vec2 uv = vUV - 0.5;

  // Soft edge fade so glow never clips at quad boundary
  float edgeDist = max(abs(uv.x), abs(uv.y));
  float edgeFade = 1.0 - smoothstep(0.35, 0.5, edgeDist);

  // Elongate along the long axis (velocity direction = UV X)
  uv.x *= 0.3;
  float d    = length(uv) * 2.0;
  float core = exp(-d * 10.0);
  float glow = exp(-d * 3.0) * 0.3;
  float alpha = (core + glow) * edgeFade;

  vec3 col = mix(vec3(1.0, 1.0, 0.95), vec3(1.0, 0.2, 0.0), d * 0.7);
  gl_FragColor = vec4(col, alpha);
}
`;

// ─── Glare fragment — anamorphic streak ─────────────────────────────────────

const GLARE_FRAG = /* glsl */ `
varying vec2 vUV;

void main() {
  vec2 uv = vUV - 0.5;

  float edgeFade = 1.0 - smoothstep(0.35, 0.5, abs(uv.x));
  float streakY  = exp(-abs(uv.y) * 80.0);   // very tight vertically
  float streakX  = exp(-uv.x * uv.x * 8.0);  // gradual horizontal fade
  float alpha    = streakY * streakX * 0.45 * edgeFade;

  vec3 col = vec3(1.0, 0.65, 0.35);
  gl_FragColor = vec4(col, alpha);
}
`;

// ─── Shared geometry & materials (one of each, reused by every projectile) ──

const sharedGeo = new THREE.PlaneGeometry(2, 2);

const boltMat = new THREE.ShaderMaterial({
  uniforms: {
    uSize:   { value: new THREE.Vector2(0.5, 0.45) },
    uVelDir: { value: new THREE.Vector2(0, 1) },
    uPerp:   { value: 0.0 },          // long axis along velocity
  },
  vertexShader:   VERT,
  fragmentShader: BOLT_FRAG,
  transparent:    true,
  depthWrite:     false,
  blending:       THREE.AdditiveBlending,
  side:           THREE.DoubleSide,
});

const glareMat = new THREE.ShaderMaterial({
  uniforms: {
    uSize:   { value: new THREE.Vector2(4.5, 0.4) },
    uVelDir: { value: new THREE.Vector2(0, 1) },
    uPerp:   { value: 1.0 },          // long axis perpendicular to velocity
  },
  vertexShader:   VERT,
  fragmentShader: GLARE_FRAG,
  transparent:    true,
  depthWrite:     false,
  blending:       THREE.AdditiveBlending,
  side:           THREE.DoubleSide,
});

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Projectile {
  pos:      Vec2;
  vel:      Vec2;
  lifetime: number;
  mesh:     THREE.Object3D;
  alive:    boolean;
  damage:   number;
}

export interface ProjectileResult {
  rpmDamage: number;
  hitFlash:  boolean;
}

// ─── Poison bolt materials (green) ──────────────────────────────────────────

const poisonBoltMat = new THREE.ShaderMaterial({
  uniforms: {
    uSize:   { value: new THREE.Vector2(0.45, 0.4) },
    uVelDir: { value: new THREE.Vector2(0, 1) },
    uPerp:   { value: 0.0 },
  },
  vertexShader:   VERT,
  fragmentShader: /* glsl */ `
    varying vec2 vUV;
    void main() {
      vec2 uv = vUV - 0.5;
      float edgeDist = max(abs(uv.x), abs(uv.y));
      float edgeFade = 1.0 - smoothstep(0.35, 0.5, edgeDist);
      uv.x *= 0.3;
      float d    = length(uv) * 2.0;
      float core = exp(-d * 10.0);
      float glow = exp(-d * 3.0) * 0.3;
      float alpha = (core + glow) * edgeFade;
      vec3 col = mix(vec3(0.6, 1.0, 0.3), vec3(0.1, 0.4, 0.0), d * 0.7);
      gl_FragColor = vec4(col, alpha);
    }
  `,
  transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});

const poisonGlareMat = new THREE.ShaderMaterial({
  uniforms: {
    uSize:   { value: new THREE.Vector2(3.5, 0.35) },
    uVelDir: { value: new THREE.Vector2(0, 1) },
    uPerp:   { value: 1.0 },
  },
  vertexShader:   VERT,
  fragmentShader: /* glsl */ `
    varying vec2 vUV;
    void main() {
      vec2 uv = vUV - 0.5;
      float edgeFade = 1.0 - smoothstep(0.35, 0.5, abs(uv.x));
      float streakY  = exp(-abs(uv.y) * 80.0);
      float streakX  = exp(-uv.x * uv.x * 8.0);
      float alpha    = streakY * streakX * 0.4 * edgeFade;
      vec3 col = vec3(0.3, 1.0, 0.2);
      gl_FragColor = vec4(col, alpha);
    }
  `,
  transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});

// ─── Web bolt materials (white-blue) ───────────────────────────────────────

const webBoltMat = new THREE.ShaderMaterial({
  uniforms: {
    uSize:   { value: new THREE.Vector2(0.38, 0.34) },
    uVelDir: { value: new THREE.Vector2(0, 1) },
    uPerp:   { value: 0.0 },
  },
  vertexShader:   VERT,
  fragmentShader: /* glsl */ `
    varying vec2 vUV;
    void main() {
      vec2 uv = vUV - 0.5;
      float edgeDist = max(abs(uv.x), abs(uv.y));
      float edgeFade = 1.0 - smoothstep(0.35, 0.5, edgeDist);
      uv.x *= 0.34;
      float d = length(uv) * 2.0;
      float core = exp(-d * 10.0);
      float glow = exp(-d * 3.0) * 0.34;
      float alpha = (core + glow) * edgeFade;
      vec3 col = mix(vec3(0.95, 0.98, 1.0), vec3(0.55, 0.78, 1.0), d * 0.7);
      gl_FragColor = vec4(col, alpha);
    }
  `,
  transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});

const webGlareMat = new THREE.ShaderMaterial({
  uniforms: {
    uSize:   { value: new THREE.Vector2(2.8, 0.28) },
    uVelDir: { value: new THREE.Vector2(0, 1) },
    uPerp:   { value: 1.0 },
  },
  vertexShader:   VERT,
  fragmentShader: /* glsl */ `
    varying vec2 vUV;
    void main() {
      vec2 uv = vUV - 0.5;
      float edgeFade = 1.0 - smoothstep(0.35, 0.5, abs(uv.x));
      float streakY  = exp(-abs(uv.y) * 75.0);
      float streakX  = exp(-uv.x * uv.x * 7.0);
      float alpha    = streakY * streakX * 0.36 * edgeFade;
      vec3 col = vec3(0.85, 0.93, 1.0);
      gl_FragColor = vec4(col, alpha);
    }
  `,
  transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createProjectile(
  pos:    Vec2,
  dir:    Vec2,
  speed:  number,
  damage: number,
): Projectile {
  const group = new THREE.Group();

  const bolt  = new THREE.Mesh(sharedGeo, boltMat);
  const glare = new THREE.Mesh(sharedGeo, glareMat);
  group.add(bolt);
  group.add(glare);

  // Each mesh sets the shared material's uVelDir to its own direction
  // just before it draws — works because Three.js calls onBeforeRender → draw
  // sequentially per object.
  const dx = dir.x;
  const dz = dir.z;
  bolt.onBeforeRender  = () => { boltMat.uniforms.uVelDir.value.set(dx, dz); };
  glare.onBeforeRender = () => { glareMat.uniforms.uVelDir.value.set(dx, dz); };

  const light = new THREE.PointLight(0xff3300, 3.0, 5, 1.5);
  group.add(light);

  group.position.set(pos.x, 0.5, pos.z);
  scene.add(group);
  const speedIntensity = Math.max(0, Math.min(1, (speed - 8) / 24));
  playProjectileLaserSound({ x: pos.x, z: pos.z }, speedIntensity);

  return {
    pos:      { x: pos.x, z: pos.z },
    vel:      { x: dir.x * speed, z: dir.z * speed },
    lifetime: PROJECTILE_LIFETIME,
    mesh:     group,
    alive:    true,
    damage,
  };
}

/** Poison projectile — green glow, used by big slugworm. */
export function createPoisonProjectile(
  pos:    Vec2,
  dir:    Vec2,
  speed:  number,
  damage: number,
): Projectile {
  const group = new THREE.Group();

  const bolt  = new THREE.Mesh(sharedGeo, poisonBoltMat);
  const glare = new THREE.Mesh(sharedGeo, poisonGlareMat);
  group.add(bolt);
  group.add(glare);

  const dx = dir.x;
  const dz = dir.z;
  bolt.onBeforeRender  = () => { poisonBoltMat.uniforms.uVelDir.value.set(dx, dz); };
  glare.onBeforeRender = () => { poisonGlareMat.uniforms.uVelDir.value.set(dx, dz); };

  const light = new THREE.PointLight(0x33ff00, 3.0, 5, 1.5);
  group.add(light);

  group.position.set(pos.x, 0.5, pos.z);
  scene.add(group);

  return {
    pos:      { x: pos.x, z: pos.z },
    vel:      { x: dir.x * speed, z: dir.z * speed },
    lifetime: PROJECTILE_LIFETIME,
    mesh:     group,
    alive:    true,
    damage,
  };
}

export function createWebProjectile(
  pos:    Vec2,
  dir:    Vec2,
  speed:  number,
  damage: number,
): Projectile {
  const group = new THREE.Group();

  const bolt  = new THREE.Mesh(sharedGeo, webBoltMat);
  const glare = new THREE.Mesh(sharedGeo, webGlareMat);
  group.add(bolt);
  group.add(glare);

  const dx = dir.x;
  const dz = dir.z;
  bolt.onBeforeRender  = () => { webBoltMat.uniforms.uVelDir.value.set(dx, dz); };
  glare.onBeforeRender = () => { webGlareMat.uniforms.uVelDir.value.set(dx, dz); };

  const light = new THREE.PointLight(0xbfd8ff, 2.2, 4.5, 1.5);
  group.add(light);

  group.position.set(pos.x, 0.5, pos.z);
  scene.add(group);

  return {
    pos:      { x: pos.x, z: pos.z },
    vel:      { x: dir.x * speed, z: dir.z * speed },
    lifetime: PROJECTILE_LIFETIME,
    mesh:     group,
    alive:    true,
    damage,
  };
}

// ─── Update ──────────────────────────────────────────────────────────────────

export function updateProjectiles(
  projectiles:   Projectile[],
  spinnerPos:    Vec2,
  spinnerRadius: number,
  delta:         number,
  ignorePlayerHits = false,
): ProjectileResult {
  let rpmDamage = 0;
  let hitFlash  = false;

  for (const p of projectiles) {
    if (!p.alive) continue;

    p.lifetime -= delta;
    const prevPos = { x: p.pos.x, z: p.pos.z };
    p.pos.x    += p.vel.x * delta;
    p.pos.z    += p.vel.z * delta;
    p.mesh.position.set(p.pos.x, 0.5, p.pos.z);

    // Despawn on actual wall collision or lifetime expiry
    let wallHit: { point: Vec2; normal: Vec2 } | null = null;
    for (const wall of walls) {
      wallHit = sweepProjectileWallHit(prevPos, p.pos, wall);
      if (wallHit) break;
    }

    if (wallHit || p.lifetime <= 0) {
      if (wallHit) {
        emitSparks(
          { x: wallHit.point.x, y: 0.5, z: wallHit.point.z },
          { x: wallHit.normal.x, y: 0, z: wallHit.normal.z },
          28,
          1.0,
          RED_SPARK_STYLE,
        );
        emitRicochetBubbles(
          { x: wallHit.point.x, y: 0.5, z: wallHit.point.z },
          { x: wallHit.normal.x, y: 0, z: wallHit.normal.z },
          1.0,
        );
      }
      p.alive = false;
      scene.remove(p.mesh);
      continue;
    }

    // Spinner hit
    const spinnerHit = !ignorePlayerHits
      ? sweepProjectileCircleHit(prevPos, p.pos, spinnerPos, spinnerRadius + PROJECTILE_RADIUS)
      : null;
    if (spinnerHit) {
      p.pos.x = spinnerHit.point.x;
      p.pos.z = spinnerHit.point.z;
      p.mesh.position.set(p.pos.x, 0.5, p.pos.z);
      rpmDamage += p.damage;
      hitFlash   = true;
      p.alive    = false;
      scene.remove(p.mesh);
    }
  }

  return { rpmDamage, hitFlash };
}

export function compactProjectiles(projectiles: Projectile[]): void {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    if (!projectiles[i].alive) projectiles.splice(i, 1);
  }
}
