import { getArenaBounds } from './arena';
import type { Collidable, Vec2 } from './physics';

export type SpinnerDuelAiState = 'orbit' | 'windup' | 'dash' | 'recover';

export interface SpinnerDuelConfig {
  maxSpeed: number;
  acceleration: number;
  chargeBoost: number;
  recoveryTime: number;
  wallAvoidDist: number;
  orbitRange: number;
  orbitStrafeStrength: number;
  cutInDuration: number;
  cutInCooldown: number;
  orbitFlipInterval: number;
  dashWindupDuration: number;
  dashSpeedMult: number;
}

export interface SpinnerDuelState {
  id: number;
  aiState: SpinnerDuelAiState;
  recoveryTimer: number;
  orbitDir: -1 | 1;
  orbitFlipTimer: number;
  windupTimer: number;
  cutInTimer: number;
  dashCooldown: number;
  dashDirX: number;
  dashDirZ: number;
}

export interface OrbitSteerOptions {
  desiredRangeMultiplier?: number;
  playerIdleInwardBias?: number;
  playerIdleStrafeMultiplier?: number;
  closePushDistance?: number;
  closePushStrength?: number;
}

export interface DashUpdateOptions {
  accelMultiplier?: number;
  retainedForwardRatio?: number;
  lateralDampRate?: number;
  closeEnoughPadding?: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeDir(x: number, z: number): Vec2 {
  const len = Math.hypot(x, z);
  if (len <= 0.001) return { x: 0, z: 1 };
  return { x: x / len, z: z / len };
}

export function resetSpinnerOrbitTimer(state: Pick<SpinnerDuelState, 'orbitFlipTimer'>, config: Pick<SpinnerDuelConfig, 'orbitFlipInterval'>): void {
  const variance = 0.72 + Math.random() * 0.56;
  state.orbitFlipTimer = config.orbitFlipInterval * variance;
}

export function resetSpinnerDuelState(
  state: SpinnerDuelState,
  config: SpinnerDuelConfig,
  setMaxSpeed: (id: number, maxSpeed: number) => void,
): void {
  state.aiState = 'orbit';
  state.recoveryTimer = 0;
  state.windupTimer = 0;
  state.cutInTimer = 0;
  state.dashCooldown = 0;
  state.dashDirX = 0;
  state.dashDirZ = 1;
  resetSpinnerOrbitTimer(state, config);
  setMaxSpeed(state.id, config.maxSpeed);
}

export function tickSpinnerOrbitFlip(
  state: Pick<SpinnerDuelState, 'orbitDir' | 'orbitFlipTimer'>,
  config: Pick<SpinnerDuelConfig, 'orbitFlipInterval'>,
  delta: number,
): void {
  state.orbitFlipTimer -= delta;
  if (state.orbitFlipTimer > 0) return;
  state.orbitDir = state.orbitDir === 1 ? -1 : 1;
  resetSpinnerOrbitTimer(state, config);
}

export function applySpinnerWallAvoidance(
  state: Pick<SpinnerDuelState, 'aiState'>,
  body: Collidable,
  config: Pick<SpinnerDuelConfig, 'wallAvoidDist' | 'acceleration'>,
  delta: number,
): void {
  const bounds = getArenaBounds();
  const minX = bounds.minX + config.wallAvoidDist;
  const maxX = bounds.maxX - config.wallAvoidDist;
  const minZ = bounds.minZ + config.wallAvoidDist;
  const maxZ = bounds.maxZ - config.wallAvoidDist;
  const wallAvoidAccel = config.acceleration * (state.aiState === 'dash' ? 0.72 : 0.5);
  if (body.pos.x > maxX) body.vel.x -= wallAvoidAccel * delta;
  if (body.pos.x < minX) body.vel.x += wallAvoidAccel * delta;
  if (body.pos.z > maxZ) body.vel.z -= wallAvoidAccel * delta;
  if (body.pos.z < minZ) body.vel.z += wallAvoidAccel * delta;
}

export function beginSpinnerWindup(
  state: SpinnerDuelState,
  body: Collidable,
  config: Pick<SpinnerDuelConfig, 'dashWindupDuration' | 'maxSpeed'>,
  setMaxSpeed: (id: number, maxSpeed: number) => void,
  dirX: number,
  dirZ: number,
  velocityDamp = 0.22,
): void {
  const dir = normalizeDir(dirX, dirZ);
  state.aiState = 'windup';
  state.windupTimer = config.dashWindupDuration;
  state.cutInTimer = 0;
  state.dashDirX = dir.x;
  state.dashDirZ = dir.z;
  setMaxSpeed(state.id, config.maxSpeed);
  body.vel.x *= velocityDamp;
  body.vel.z *= velocityDamp;
}

export function beginSpinnerBurst(
  state: SpinnerDuelState,
  body: Collidable,
  config: Pick<SpinnerDuelConfig, 'maxSpeed' | 'dashSpeedMult' | 'cutInDuration'>,
  setMaxSpeed: (id: number, maxSpeed: number) => void,
): void {
  const burstSpeed = config.maxSpeed * config.dashSpeedMult;
  state.aiState = 'dash';
  state.cutInTimer = config.cutInDuration;
  setMaxSpeed(state.id, burstSpeed);
  body.vel.x = state.dashDirX * burstSpeed;
  body.vel.z = state.dashDirZ * burstSpeed;
}

export function updateSpinnerRecoverState(
  state: SpinnerDuelState,
  config: Pick<SpinnerDuelConfig, 'recoveryTime'>,
  delta: number,
  onRecovered: () => void,
): boolean {
  if (state.aiState !== 'recover') return false;
  state.recoveryTimer -= delta;
  if (state.recoveryTimer <= 0) {
    onRecovered();
  }
  return true;
}

export function updateSpinnerWindupState(
  state: SpinnerDuelState,
  body: Collidable,
  config: Pick<SpinnerDuelConfig, 'maxSpeed' | 'dashSpeedMult' | 'cutInDuration'> & Pick<SpinnerDuelConfig, 'dashWindupDuration'>,
  delta: number,
  setMaxSpeed: (id: number, maxSpeed: number) => void,
  options?: {
    velocityDamp?: number;
    pauseTimer?: number;
  },
): boolean {
  if (state.aiState !== 'windup') return false;
  if ((options?.pauseTimer ?? 0) > 0) {
    const damp = Math.max(0, 1 - delta * 10);
    body.vel.x *= damp;
    body.vel.z *= damp;
    return true;
  }

  state.windupTimer -= delta;
  const damp = Math.max(0, 1 - delta * (options?.velocityDamp ?? 12));
  body.vel.x *= damp;
  body.vel.z *= damp;

  if (state.windupTimer <= 0) {
    beginSpinnerBurst(state, body, config, setMaxSpeed);
  }
  return true;
}

export function updateSpinnerDashState(
  state: SpinnerDuelState,
  body: Collidable,
  playerPos: Vec2,
  combinedRadius: number,
  config: Pick<SpinnerDuelConfig, 'acceleration' | 'chargeBoost' | 'maxSpeed' | 'dashSpeedMult'>,
  delta: number,
  options?: DashUpdateOptions,
): boolean {
  if (state.aiState !== 'dash') return false;

  state.cutInTimer -= delta;
  const accel = config.acceleration * config.chargeBoost * (options?.accelMultiplier ?? 1.25);
  const burstSpeed = config.maxSpeed * config.dashSpeedMult;
  const forwardSpeed = body.vel.x * state.dashDirX + body.vel.z * state.dashDirZ;
  const lateralX = body.vel.x - state.dashDirX * forwardSpeed;
  const lateralZ = body.vel.z - state.dashDirZ * forwardSpeed;
  const retainedForward = Math.max(forwardSpeed, burstSpeed * (options?.retainedForwardRatio ?? 0.82));
  const lateralDamp = Math.max(0, 1 - delta * (options?.lateralDampRate ?? 13));

  body.vel.x = state.dashDirX * retainedForward + lateralX * lateralDamp;
  body.vel.z = state.dashDirZ * retainedForward + lateralZ * lateralDamp;
  body.vel.x += state.dashDirX * accel * delta;
  body.vel.z += state.dashDirZ * accel * delta;

  const along = (playerPos.x - body.pos.x) * state.dashDirX + (playerPos.z - body.pos.z) * state.dashDirZ;
  return state.cutInTimer <= 0 || along <= combinedRadius + (options?.closeEnoughPadding ?? 0.5);
}

export function steerSpinnerOrbit(
  state: Pick<SpinnerDuelState, 'orbitDir'>,
  body: Collidable,
  playerPos: Vec2,
  combinedRadius: number,
  config: Pick<SpinnerDuelConfig, 'orbitRange' | 'orbitStrafeStrength' | 'acceleration'>,
  delta: number,
  playerIdle: boolean,
  options?: OrbitSteerOptions,
): void {
  const dx = playerPos.x - body.pos.x;
  const dz = playerPos.z - body.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= 0.1) return;

  const dirX = dx / dist;
  const dirZ = dz / dist;
  const tangentX = -dirZ * state.orbitDir;
  const tangentZ = dirX * state.orbitDir;
  const desiredRange = config.orbitRange * (playerIdle ? (options?.desiredRangeMultiplier ?? 0.7) : 1);
  const radialError = dist - desiredRange;
  const radialPull = clamp(radialError / Math.max(desiredRange, 0.001), -0.95, 0.95);
  const closePushDistance = options?.closePushDistance ?? 1.0;
  const closePushStrength = options?.closePushStrength ?? -0.9;
  const closePush = dist < combinedRadius + closePushDistance ? closePushStrength : 0;
  const inwardBias = radialPull + closePush + (playerIdle ? (options?.playerIdleInwardBias ?? 0) : 0);
  const strafeStrength = playerIdle
    ? config.orbitStrafeStrength * (options?.playerIdleStrafeMultiplier ?? 0.28)
    : config.orbitStrafeStrength;

  body.vel.x += (tangentX * strafeStrength + dirX * inwardBias) * config.acceleration * delta;
  body.vel.z += (tangentZ * strafeStrength + dirZ * inwardBias) * config.acceleration * delta;
}
