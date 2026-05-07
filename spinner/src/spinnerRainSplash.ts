import * as THREE from 'three';
import type { Vec2 } from './physics';

const MAX_DROPLETS = 1020;
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
const brightness = new Float32Array(MAX_DROPLETS);
const spin = new Float32Array(MAX_DROPLETS);
const active = new Uint8Array(MAX_DROPLETS);
const carries = new Map<number, number>();
const colors = Array.from({ length: MAX_DROPLETS }, () => new THREE.Color(0x8fdcff));

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
): void {
  const index = spawnCursor;
  spawnCursor = (spawnCursor + 1) % MAX_DROPLETS;

  const angle = Math.random() * TAU;
  const outwardSpeed = 1 + (2.3 + Math.random() * 3.4) * (0.75 + strength * 0.35);
  const vx = Math.cos(angle) * outwardSpeed + vel.x * 0.22;
  const vz = Math.sin(angle) * outwardSpeed + vel.z * 0.22;
  const radialOffset = radius * (0.15 + Math.random() * 0.28);

  posX[index] = origin.x + Math.cos(angle) * radialOffset;
  posY[index] = origin.y + (Math.random() - 0.5) * 0.08;
  posZ[index] = origin.z + Math.sin(angle) * radialOffset;
  velX[index] = vx;
  velY[index] = 0.7 + Math.random() * 1.2 + strength * 0.18;
  velZ[index] = vz;
  age[index] = 0;
  lifetime[index] = 0.5 + 0.18 + Math.random() * 0.18;
  size[index] = 0.04 + (0.035 + Math.random() * 0.045) * (0.9 + strength * 0.12);
  brightness[index] = 0.72 + Math.random() * 0.38;
  spin[index] = (Math.random() - 0.5) * 4.2;
  active[index] = 1;
  colors[index].copy(color);
}

export function initSpinnerRainSplash(scene: THREE.Scene): void {
  geometry = new THREE.BoxGeometry(1, 1, 1);
  material = new THREE.MeshBasicMaterial({
    color: 0x8fdcff,
    transparent: true,
    opacity: 0.82,
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
): void {
  if (!mesh || strength <= 0.01 || delta <= 0) return;

  const spawnRate = (18 + radius * 5.5) * Math.min(1.75, strength);
  const carry = Math.min(10, (carries.get(emitterId) ?? 0) + spawnRate * delta);
  let count = Math.floor(carry);
  carries.set(emitterId, carry - count);
  count = Math.min(count, 7);

  for (let i = 0; i < count; i += 1) {
    spawnDroplet(origin, vel, radius, strength, color);
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
    const currentSize = size[i] * (0.75 + life * 0.55);
    tempPosition.set(posX[i], posY[i], posZ[i]);
    identityRotation.setFromAxisAngle(upAxis, spin[i] * age[i]);
    tempScale.set(currentSize, currentSize * 0.9, currentSize);
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
