import * as THREE from 'three';
import type { Vec2 } from './physics';

const MAX_DROPLETS = 2020;
const TAU = Math.PI * 2;
// const GRAVITY = 11.5;
const GRAVITY = 0;
const HIDDEN_SCALE = 0.0001;

const tempPosition = new THREE.Vector3(0, -1000, 0);
const tempScale = new THREE.Vector3(HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE);
const tempMatrix = new THREE.Matrix4();
const tempColor = new THREE.Color(0x000000);
const identityRotation = new THREE.Quaternion();
const upAxis = new THREE.Vector3(0, 1, 0);

let mesh: THREE.InstancedMesh | null = null;
let geometry: THREE.BoxGeometry | null = null;
let material: THREE.MeshBasicMaterial | null = null;
let spawnCursor = 0;

const posX = new Float32Array(MAX_DROPLETS);
const posY = new Float32Array(MAX_DROPLETS);
const posZ = new Float32Array(MAX_DROPLETS);
const velX = new Float32Array(MAX_DROPLETS);
const velY = new Float32Array(MAX_DROPLETS);
const velZ = new Float32Array(MAX_DROPLETS);
const age = new Float32Array(MAX_DROPLETS);
const lifetime = new Float32Array(MAX_DROPLETS);
const size = new Float32Array(MAX_DROPLETS);
const stretch = new Float32Array(MAX_DROPLETS);
const brightness = new Float32Array(MAX_DROPLETS);
const active = new Uint8Array(MAX_DROPLETS);
const carries = new Map<number, number>();
const colors = Array.from({ length: MAX_DROPLETS }, () => new THREE.Color(0x8fdcff));

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function hideDroplet(index: number): void {
  if (!mesh) return;
  tempPosition.set(0, -1000, 0);
  tempScale.set(HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE);
  tempMatrix.compose(tempPosition, identityRotation, tempScale);
  mesh.setMatrixAt(index, tempMatrix);
  mesh.setColorAt(index, tempColor.setRGB(0, 0, 0));
}

function spawnDroplet(
  origin: { x: number; y: number; z: number },
  vel: Vec2,
  radius: number,
  strength: number,
  color: THREE.Color,
  spinSign: number,
): void {
  const index = spawnCursor;
  spawnCursor = (spawnCursor + 1) % MAX_DROPLETS;
  const moveSpeed = Math.hypot(vel.x, vel.z);

  const handedness = spinSign >= 0 ? 1 : -1;
  const angle = Math.random() * TAU;
  const radialX = Math.cos(angle);
  const radialZ = Math.sin(angle);
  let tangentX = -radialZ * handedness;
  let tangentZ = radialX * handedness;

  // Keep the spray tangential, with only a tiny angular wobble so it reads
  // like many water streaks peeling off the rim rather than a perfect wheel.
  const tangentWobble = randRange(-0.08, 0.08);
  const wobbleX = tangentX + radialX * tangentWobble;
  const wobbleZ = tangentZ + radialZ * tangentWobble;
  const tangentLen = Math.hypot(wobbleX, wobbleZ) || 1;
  tangentX = wobbleX / tangentLen;
  tangentZ = wobbleZ / tangentLen;

  const tangentialSpeed = randRange(2.8, 5.2)
    * (0.82 + strength * 0.3)
    * (1 + Math.min(1.35, moveSpeed * 0.28));
  velX[index] = tangentX * tangentialSpeed + vel.x;
  velZ[index] = tangentZ * tangentialSpeed + vel.z;

  const rimOffset = radius * randRange(0.88, 0.98);
  const tangentOffset = radius * randRange(-0.015, 0.015);

  posX[index] = origin.x + radialX * rimOffset + tangentX * tangentOffset;
  posY[index] = origin.y + randRange(-0.03, 0.03);
  posZ[index] = origin.z + radialZ * rimOffset + tangentZ * tangentOffset;
  velY[index] = randRange(0.85, 1.45) + strength * 0.16;
  age[index] = 0;
  lifetime[index] = randRange(0.68, 0.92);
  size[index] = randRange(0.03, 0.045) * (0.9 + strength * 0.08);
  stretch[index] = randRange(0.14, 0.22) * (0.92 + strength * 0.16);
  brightness[index] = randRange(0.95, 1.28);
  active[index] = 1;
  colors[index].copy(color);
}

export function initSpinnerRainSplash(scene: THREE.Scene): void {
  geometry = new THREE.BoxGeometry(1, 1, 1);
  material = new THREE.MeshBasicMaterial({
    color: 0x8fdcff,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  mesh = new THREE.InstancedMesh(geometry, material, MAX_DROPLETS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;

  for (let i = 0; i < MAX_DROPLETS; i += 1) {
    hideDroplet(i);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor!.needsUpdate = true;
  scene.add(mesh);
}

export function emitSpinnerRainSplash(
  emitterId: number,
  origin: { x: number; y: number; z: number },
  vel: Vec2,
  radius: number,
  strength: number,
  color: THREE.Color,
  delta: number,
  spinSign = 1,
): void {
  if (!mesh || strength <= 0.01 || delta <= 0) return;

  const spawnRate = (18 + radius * 5.5) * Math.min(1.75, strength);
  const carry = Math.min(10, (carries.get(emitterId) ?? 0) + spawnRate * delta);
  let count = Math.floor(carry);
  carries.set(emitterId, carry - count);
  count = Math.min(count, 7);

  for (let i = 0; i < count; i += 1) {
    spawnDroplet(origin, vel, radius, strength, color, spinSign);
  }
}

export function updateSpinnerRainSplash(delta: number): void {
  if (!mesh) return;

  for (let i = 0; i < MAX_DROPLETS; i += 1) {
    if (active[i] === 0) continue;

    age[i] += delta;
    if (age[i] >= lifetime[i]) {
      active[i] = 0;
      hideDroplet(i);
      continue;
    }

    velY[i] -= GRAVITY * delta;
    posX[i] += velX[i] * delta;
    posY[i] = Math.max(0.05, posY[i] + velY[i] * delta);
    posZ[i] += velZ[i] * delta;

    const life = 1 - age[i] / lifetime[i];
    const currentWidth = size[i] * (0.72 + life * 0.32);
    const currentLength = stretch[i] * (0.9 + life * 0.38);
    tempPosition.set(posX[i], posY[i], posZ[i]);
    const yaw = Math.atan2(velX[i], velZ[i]);
    identityRotation.setFromAxisAngle(upAxis, yaw);
    tempScale.set(currentWidth, currentWidth * 0.55, currentLength);
    tempMatrix.compose(tempPosition, identityRotation, tempScale);
    mesh.setMatrixAt(i, tempMatrix);

    tempColor.copy(colors[i]).multiplyScalar(life * brightness[i]);
    mesh.setColorAt(i, tempColor);
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor!.needsUpdate = true;
}

export function resetSpinnerRainSplash(): void {
  carries.clear();
  spawnCursor = 0;
  for (let i = 0; i < MAX_DROPLETS; i += 1) {
    active[i] = 0;
    age[i] = 0;
    hideDroplet(i);
  }
  if (mesh) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  }
}
