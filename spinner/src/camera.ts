import * as THREE from 'three';
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
const CAMERA_DIR_EPSILON = 0.12;

export type CameraViewMode = 'third_person' | 'top_down';

interface CameraViewConfig {
  height: number;
  backOffset: number;
  lookAhead: number;
  lookHeight: number;
}

const CAMERA_VIEWS: Record<CameraViewMode, CameraViewConfig> = {
  third_person: {
    height: 11.5,
    backOffset: 12.5,
    lookAhead: 5.5,
    lookHeight: 1.35,
  },
  top_down: {
    height: 34,
    backOffset: 0.001,
    lookAhead: 0,
    lookHeight: 0,
  },
};

// ─── Internal State ──────────────────────────────────────────────────────────

let camX = 0;
let camZ = 0;
let shakeTrauma = 0;
let shakeTime = 0;
let cameraViewMode: CameraViewMode = 'top_down';
let followDirX = 0;
let followDirZ = -1;

// ─── Cinematic state ─────────────────────────────────────────────────────────

type CinematicPhase = 'delay' | 'pan_to' | 'hold' | 'pan_back';

interface CinematicState {
  phase: CinematicPhase;
  phaseTimer: number;
  startX: number;
  startZ: number;
  targetX: number;
  targetZ: number;
  delayDur: number;
  panToDur: number;
  holdDur: number;
  panBackDur: number;
  onPanArrive: (() => void) | undefined;
  onComplete: (() => void) | undefined;
}

let cinematic: CinematicState | null = null;
const ndcScratch = new THREE.Vector3();

// ─── Public API ──────────────────────────────────────────────────────────────

export function initCamera(): void {
  camX = 0;
  camZ = 0;
  shakeTrauma = 0;
  shakeTime = 0;
  followDirX = 0;
  followDirZ = -1;
  applyCameraTransform(0, 0);
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
  if (cinematic) {
    advanceCinematic(pos, delta);
  } else if (snapToPlayer) {
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

  updateFollowDirection(vel, delta);

  shakeTime += delta;
  shakeTrauma = Math.max(0, shakeTrauma - SHAKE_DECAY * delta);
  const shakePower = shakeTrauma;
  const shakeX = Math.sin(shakeTime * SHAKE_FREQ_X) * SHAKE_OFFSET * shakePower;
  const shakeZ = Math.cos(shakeTime * SHAKE_FREQ_Z) * SHAKE_OFFSET * shakePower;

  applyCameraTransform(shakeX, shakeZ);
}

// ─── Cinematic API ───────────────────────────────────────────────────────────

export interface DoorCinematicOptions {
  delaySec?: number;
  panToSec?: number;
  holdSec?: number;
  panBackSec?: number;
  onPanArrive?: () => void;
  onComplete?: () => void;
}

export function startDoorCinematic(target: Vec2, options: DoorCinematicOptions = {}): void {
  cinematic = {
    phase: 'delay',
    phaseTimer: 0,
    startX: camX,
    startZ: camZ,
    targetX: target.x,
    targetZ: target.z,
    delayDur:    options.delaySec    ?? 0.8,
    panToDur:    options.panToSec    ?? 0.5,
    holdDur:     options.holdSec     ?? 0.7,
    panBackDur:  options.panBackSec  ?? 0.5,
    onPanArrive: options.onPanArrive,
    onComplete:  options.onComplete,
  };
}

export function isCameraInCinematic(): boolean {
  return cinematic !== null;
}

/**
 * Aborts any active cinematic. Fires the deferred onPanArrive (so doors don't
 * stay frozen mid-sequence) and onComplete callbacks before clearing state.
 */
export function cancelCameraCinematic(): void {
  if (!cinematic) return;
  const pending = cinematic;
  cinematic = null;
  pending.onPanArrive?.();
  pending.onComplete?.();
}

export function toggleCameraView(): CameraViewMode {
  cameraViewMode = cameraViewMode === 'top_down' ? 'third_person' : 'top_down';
  return cameraViewMode;
}

export function getCameraViewMode(): CameraViewMode {
  return cameraViewMode;
}

export function isWorldPointOnScreen(x: number, z: number, marginNDC = 0.85): boolean {
  ndcScratch.set(x, 0, z).project(camera);
  return Math.abs(ndcScratch.x) <= marginNDC && Math.abs(ndcScratch.y) <= marginNDC;
}

function advanceCinematic(playerPos: Vec2, delta: number): void {
  const c = cinematic;
  if (!c) return;
  c.phaseTimer += delta;

  switch (c.phase) {
    case 'delay': {
      // Camera keeps following the player during the pause so the kill reads.
      const t = 1 - Math.exp(-FOLLOW_SPEED * delta);
      camX += (playerPos.x - camX) * t;
      camZ += (playerPos.z - camZ) * t;
      if (c.phaseTimer >= c.delayDur) {
        c.phase = 'pan_to';
        c.phaseTimer = 0;
        c.startX = camX;
        c.startZ = camZ;
      }
      break;
    }
    case 'pan_to': {
      const u = c.panToDur > 0 ? Math.min(1, c.phaseTimer / c.panToDur) : 1;
      const e = easeInOutCubic(u);
      camX = c.startX + (c.targetX - c.startX) * e;
      camZ = c.startZ + (c.targetZ - c.startZ) * e;
      if (u >= 1) {
        c.phase = 'hold';
        c.phaseTimer = 0;
        const cb = c.onPanArrive;
        c.onPanArrive = undefined;
        cb?.();
      }
      break;
    }
    case 'hold': {
      camX = c.targetX;
      camZ = c.targetZ;
      if (c.phaseTimer >= c.holdDur) {
        c.phase = 'pan_back';
        c.phaseTimer = 0;
        c.startX = camX;
        c.startZ = camZ;
      }
      break;
    }
    case 'pan_back': {
      const u = c.panBackDur > 0 ? Math.min(1, c.phaseTimer / c.panBackDur) : 1;
      const e = easeInOutCubic(u);
      // Track the player's *current* position so we land on them, not where they were.
      camX = c.startX + (playerPos.x - c.startX) * e;
      camZ = c.startZ + (playerPos.z - c.startZ) * e;
      if (u >= 1) {
        const onComplete = c.onComplete;
        cinematic = null;
        onComplete?.();
      }
      break;
    }
  }
}

function easeInOutCubic(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

function updateFollowDirection(vel: Vec2, delta: number): void {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed <= CAMERA_DIR_EPSILON) return;

  const targetDirX = vel.x / speed;
  const targetDirZ = vel.z / speed;
  const alignT = 1 - Math.exp(-10 * delta);
  followDirX += (targetDirX - followDirX) * alignT;
  followDirZ += (targetDirZ - followDirZ) * alignT;

  const followLen = Math.hypot(followDirX, followDirZ);
  if (followLen <= 0.0001) {
    followDirX = targetDirX;
    followDirZ = targetDirZ;
    return;
  }

  followDirX /= followLen;
  followDirZ /= followLen;
}

function applyCameraTransform(shakeX: number, shakeZ: number): void {
  const view = CAMERA_VIEWS[cameraViewMode];
  const cameraPosX = cameraViewMode === 'third_person'
    ? camX - followDirX * view.backOffset + shakeX
    : camX + shakeX;
  const cameraPosY = view.height;
  const cameraPosZ = cameraViewMode === 'third_person'
    ? camZ - followDirZ * view.backOffset + shakeZ
    : camZ + view.backOffset + shakeZ;
  const lookX = cameraViewMode === 'third_person'
    ? camX + followDirX * view.lookAhead + shakeX * 0.2
    : camX + shakeX * 0.2;
  const lookY = view.lookHeight;
  const lookZ = cameraViewMode === 'third_person'
    ? camZ + followDirZ * view.lookAhead + shakeZ * 0.2
    : camZ + shakeZ * 0.2;

  camera.position.set(cameraPosX, cameraPosY, cameraPosZ);
  camera.lookAt(lookX, lookY, lookZ);
}
