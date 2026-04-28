import { camera } from './renderer';
import type { Vec2 } from './physics';

// ─── Camera Constants ────────────────────────────────────────────────────────

const FOLLOW_SPEED = 3.0;   // lerp speed — lower = heavier lag
const LOOK_AHEAD   = 0.35;  // velocity offset fraction (anticipation)
const MAX_LAG      = 7.0;   // max distance camera can fall behind spinner

// Camera height and depth offset — mirrors the original fixed position
const CAM_Y        = 30;
const CAM_Z_OFFSET = 10;

// ─── Internal State ──────────────────────────────────────────────────────────

let camX = 0;
let camZ = 0;

// ─── Public API ──────────────────────────────────────────────────────────────

export function initCamera(): void {
  camX = 0;
  camZ = 0;
  camera.position.set(camX, CAM_Y, camZ + CAM_Z_OFFSET);
  camera.lookAt(camX, 0, camZ);
}

export function updateCamera(pos: Vec2, vel: Vec2, delta: number, snapToPlayer = false): void {
  if (snapToPlayer) {
    camX = pos.x;
    camZ = pos.z;
    camera.position.set(camX, CAM_Y, camZ + CAM_Z_OFFSET);
    camera.lookAt(camX, 0, camZ);
    return;
  }

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

  // 4. Apply to Three.js camera
  camera.position.set(camX, CAM_Y, camZ + CAM_Z_OFFSET);
  camera.lookAt(camX, 0, camZ);
}
