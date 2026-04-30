import { camera } from './renderer';
import type { Vec2 } from './physics';

// ─── Camera Constants ────────────────────────────────────────────────────────

const FOLLOW_SPEED = 3.0;   // lerp speed — lower = heavier lag
const LOOK_AHEAD   = 0.35;  // velocity offset fraction (anticipation)
const MAX_LAG      = 7.0;   // max distance camera can fall behind spinner
const SHAKE_DECAY  = 3.4;   // trauma decay per second
const SHAKE_FREQ_X = 32.0;
const SHAKE_FREQ_Z = 47.0;
const SHAKE_OFFSET = 0.95;  // max world-space offset at full trauma

// Camera height and depth offset — mirrors the original fixed position
const CAM_Y        = 30;
const CAM_Z_OFFSET = 10;

// ─── Internal State ──────────────────────────────────────────────────────────

let camX = 0;
let camZ = 0;
let shakeTrauma = 0;
let shakeTime = 0;

// ─── Public API ──────────────────────────────────────────────────────────────

export function initCamera(): void {
  camX = 0;
  camZ = 0;
  shakeTrauma = 0;
  shakeTime = 0;
  camera.position.set(camX, CAM_Y, camZ + CAM_Z_OFFSET);
  camera.lookAt(camX, 0, camZ);
}

export function resetCameraShake(): void {
  shakeTrauma = 0;
  shakeTime = 0;
}

export function triggerCameraShake(intensity: number): void {
  if (intensity <= 0) return;
  shakeTrauma = Math.min(1, shakeTrauma + intensity);
}

export function updateCamera(pos: Vec2, vel: Vec2, delta: number, snapToPlayer = false): void {
  if (snapToPlayer) {
    camX = pos.x;
    camZ = pos.z;
  } else {
    // 1. Look-ahead target — offset toward movement direction
    const targetX = pos.x + vel.x * LOOK_AHEAD;
    const targetZ = pos.z + vel.z * LOOK_AHEAD;

    // 2. Exponential lerp (framerate-independent)
    const t = 1 - Math.exp(-FOLLOW_SPEED * delta);
    camX += (targetX - camX) * t;
    camZ += (targetZ - camZ) * t;

    // 3. Max-lag clamp — if spinner outruns the camera, slide to restore limit
    const dx   = pos.x - camX;
    const dz   = pos.z - camZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > MAX_LAG) {
      const over = dist - MAX_LAG;
      const invDist = 1 / dist;
      camX += dx * invDist * over;
      camZ += dz * invDist * over;
    }
  }

  shakeTime += delta;
  shakeTrauma = Math.max(0, shakeTrauma - SHAKE_DECAY * delta);
  const shakePower = shakeTrauma;
  const shakeX = Math.sin(shakeTime * SHAKE_FREQ_X) * SHAKE_OFFSET * shakePower;
  const shakeZ = Math.cos(shakeTime * SHAKE_FREQ_Z) * SHAKE_OFFSET * shakePower;

  // 4. Apply to Three.js camera with additive shake offset
  camera.position.set(camX + shakeX, CAM_Y, camZ + CAM_Z_OFFSET + shakeZ);
  camera.lookAt(camX + shakeX, 0, camZ + shakeZ);
}
