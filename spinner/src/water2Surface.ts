import * as THREE from 'three';
import vertexShader from './water.vert.glsl?raw';
import fragmentShader from './water2.frag.glsl?raw';

type RipplePoint = { x: number; z: number };
type WorldBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

const SIM_WIDTH = 256;
const SIM_HEIGHT = 256;
const FIXED_STEP = 1 / 60;
const SIM_TIME_SCALE = 0.08;
const PROPAGATION = 0.42;
const DAMPING = 0.965;
const WATER2_RIPPLE_CLICK_TEXTURE_SCALE = 3.1;
const AMBIENT_RATE_PER_WORLD_UNIT = 0.005;
const AMBIENT_RATE_MIN = 0.06;
const AMBIENT_BURST_CAP = 1;

const water2Materials = new Set<THREE.ShaderMaterial>();
const disposedWater2Materials = new WeakSet<THREE.Material>();
const movementCarry = new Map<number, number>();

interface Water2Region {
  contains: (point: RipplePoint) => boolean;
  sampleRandomPoint: () => RipplePoint;
  area: number;
  ambientCarry: number;
}

const water2Regions: Water2Region[] = [];
const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();
const texturePending = new Map<string, Promise<THREE.Texture>>();
const reflectionTextureUrl = new URL('../../water/public/goldensky.jpg', import.meta.url).href;

const whiteTexture = new THREE.DataTexture(
  new Uint8Array([255, 255, 255, 255]),
  1,
  1,
  THREE.RGBAFormat,
);
whiteTexture.colorSpace = THREE.SRGBColorSpace;
whiteTexture.needsUpdate = true;

let simAccumulator = 0;
let worldMin = new THREE.Vector2(-20, -20);
let worldSize = new THREE.Vector2(40, 40);

let prevState = new Float32Array(SIM_WIDTH * SIM_HEIGHT);
let currState = new Float32Array(SIM_WIDTH * SIM_HEIGHT);
let nextState = new Float32Array(SIM_WIDTH * SIM_HEIGHT);
const rippleData = new Uint8Array(SIM_WIDTH * SIM_HEIGHT * 4);
const rippleTexture = new THREE.DataTexture(rippleData, SIM_WIDTH, SIM_HEIGHT, THREE.RGBAFormat);
rippleTexture.colorSpace = THREE.NoColorSpace;
rippleTexture.wrapS = THREE.ClampToEdgeWrapping;
rippleTexture.wrapT = THREE.ClampToEdgeWrapping;
rippleTexture.minFilter = THREE.LinearFilter;
rippleTexture.magFilter = THREE.LinearFilter;
rippleTexture.needsUpdate = true;

function configureTexture(texture: THREE.Texture, isColor: boolean): THREE.Texture {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function getTexture(url: string, isColor: boolean): THREE.Texture {
  const key = `${isColor ? 'color' : 'data'}:${url}`;
  const existing = textureCache.get(key);
  if (existing) return existing;
  const texture = configureTexture(textureLoader.load(url), isColor);
  textureCache.set(key, texture);
  return texture;
}

async function preloadTexture(url: string, isColor: boolean): Promise<THREE.Texture> {
  const key = `${isColor ? 'color' : 'data'}:${url}`;
  const existing = textureCache.get(key);
  if (existing) return existing;
  const pending = texturePending.get(key);
  if (pending) return pending;
  const promise = textureLoader.loadAsync(url).then((texture) => {
    const configured = configureTexture(texture, isColor);
    textureCache.set(key, configured);
    texturePending.delete(key);
    return configured;
  }).catch((error) => {
    texturePending.delete(key);
    throw error;
  });
  texturePending.set(key, promise);
  return promise;
}

function syncRippleTexture(blend = 1): void {
  const t = THREE.MathUtils.clamp(blend, 0, 1);
  for (let i = 0; i < currState.length; i += 1) {
    const displayHeight = THREE.MathUtils.lerp(prevState[i], currState[i], t);
    const encoded = THREE.MathUtils.clamp(128 + displayHeight * WATER2_RIPPLE_CLICK_TEXTURE_SCALE, 0, 255) | 0;
    const dataIndex = i * 4;
    rippleData[dataIndex] = encoded;
    rippleData[dataIndex + 1] = encoded;
    rippleData[dataIndex + 2] = encoded;
    rippleData[dataIndex + 3] = 255;
  }
  rippleTexture.needsUpdate = true;
}

function resetSimulation(): void {
  prevState.fill(0);
  currState.fill(0);
  nextState.fill(0);
  syncRippleTexture(1);
}

function stepSimulation(): void {
  nextState.fill(0);
  for (let y = 1; y < SIM_HEIGHT - 1; y += 1) {
    const row = y * SIM_WIDTH;
    for (let x = 1; x < SIM_WIDTH - 1; x += 1) {
      const index = row + x;
      let data = (
        currState[index - SIM_WIDTH]
        + currState[index + SIM_WIDTH]
        + currState[index - 1]
        + currState[index + 1]
      ) * PROPAGATION;
      data -= prevState[index];
      data *= DAMPING;
      nextState[index] = data;
    }
  }

  const temp = prevState;
  prevState = currState;
  currState = nextState;
  nextState = temp;
}

function worldToPixel(point: RipplePoint): { px: number; py: number } | null {
  if (worldSize.x <= 0.001 || worldSize.y <= 0.001) return null;
  const u = (point.x - worldMin.x) / worldSize.x;
  const v = (point.z - worldMin.y) / worldSize.y;
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  return {
    px: THREE.MathUtils.clamp(Math.round(u * (SIM_WIDTH - 1)), 1, SIM_WIDTH - 2),
    py: THREE.MathUtils.clamp(Math.round(v * (SIM_HEIGHT - 1)), 1, SIM_HEIGHT - 2),
  };
}

function injectImpulse(point: RipplePoint, strength: number, radiusWorld: number): void {
  const pixel = worldToPixel(point);
  if (!pixel) return;

  const pixelRadius = Math.max(
    1,
    Math.round((radiusWorld / Math.max(worldSize.x, worldSize.y)) * Math.max(SIM_WIDTH, SIM_HEIGHT)),
  );
  const radiusSq = pixelRadius * pixelRadius;

  for (let y = -pixelRadius; y <= pixelRadius; y += 1) {
    const py = pixel.py + y;
    if (py <= 0 || py >= SIM_HEIGHT - 1) continue;
    for (let x = -pixelRadius; x <= pixelRadius; x += 1) {
      const px = pixel.px + x;
      if (px <= 0 || px >= SIM_WIDTH - 1) continue;
      const distSq = x * x + y * y;
      if (distSq > radiusSq) continue;
      const falloff = 1 - distSq / radiusSq;
      currState[py * SIM_WIDTH + px] += strength * falloff;
    }
  }
}

function emitAmbientRipples(delta: number): void {
  if (delta <= 0) return;

  for (const region of water2Regions) {
    const rate = Math.max(AMBIENT_RATE_MIN, region.area * AMBIENT_RATE_PER_WORLD_UNIT);
    region.ambientCarry += rate * delta;
    let count = Math.floor(region.ambientCarry);
    region.ambientCarry -= count;
    count = Math.min(count, AMBIENT_BURST_CAP);

    for (let i = 0; i < count; i += 1) {
      injectImpulse(region.sampleRandomPoint(), 2.6 + Math.random() * 1.6, 0.75 + Math.random() * 0.35);
    }
  }
}

export async function preloadWater2Assets(): Promise<void> {
  await preloadTexture(reflectionTextureUrl, true);
}

export function setWater2WorldBounds(bounds: WorldBounds): void {
  worldMin.set(bounds.minX, bounds.minZ);
  worldSize.set(
    Math.max(1, bounds.maxX - bounds.minX),
    Math.max(1, bounds.maxZ - bounds.minZ),
  );
  for (const material of water2Materials) {
    material.uniforms.uWorldMin.value.copy(worldMin);
    material.uniforms.uWorldSize.value.copy(worldSize);
  }
}

export function createWater2Material(
  color?: string,
  baseMap?: THREE.Texture | null,
): THREE.ShaderMaterial {
  const tint = color ? new THREE.Color(color) : new THREE.Color(0x6ea7b9);
  const effectiveTint = baseMap
    ? new THREE.Color(0xffffff).lerp(tint, 0.18)
    : tint;

  const uniforms = {
    iTime: { value: 0 },
    iChannel0: { value: baseMap ?? whiteTexture },
    iChannel2: { value: getTexture(reflectionTextureUrl, true) },
    uRippleState: { value: rippleTexture },
    uRippleTexel: { value: new THREE.Vector2(1 / SIM_WIDTH, 1 / SIM_HEIGHT) },
    uWorldMin: { value: worldMin.clone() },
    uWorldSize: { value: worldSize.clone() },
    uCameraPos: { value: new THREE.Vector3() },
    uTint: { value: effectiveTint },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    toneMapped: false,
  });
  material.userData.isWater2Material = true;
  water2Materials.add(material);
  return material;
}

export function clearWater2SurfaceRegions(): void {
  water2Regions.length = 0;
  movementCarry.clear();
  simAccumulator = 0;
  resetSimulation();
}

export function registerWater2SurfaceRegion(region: Water2Region): void {
  water2Regions.push(region);
}

export function emitMovementWater2Ripples(
  emitterId: number,
  point: RipplePoint,
  speed: number,
  radius: number,
  delta: number,
): void {
  if (speed < 0.18 || delta <= 0) return;
  let carry = Math.min(3.4, (movementCarry.get(emitterId) ?? 0) + speed * 0.62 * delta);
  let count = Math.floor(carry);
  carry -= count;
  movementCarry.set(emitterId, carry);
  count = Math.min(count, 2);

  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const offset = radius * (0.05 + Math.random() * 0.24);
    injectImpulse(
      {
        x: point.x + Math.cos(angle) * offset,
        z: point.z + Math.sin(angle) * offset,
      },
      5.4 + Math.min(6.8, speed * 0.55),
      Math.max(0.8, radius * 1.35),
    );
  }
}

export function updateWater2Surfaces(time: number, cameraPos: THREE.Vector3, delta = 0): void {
  for (const material of water2Materials) {
    material.uniforms.iTime.value = time;
    material.uniforms.uCameraPos.value.copy(cameraPos);
  }

  emitAmbientRipples(delta);

  simAccumulator += delta * SIM_TIME_SCALE;
  let stepped = false;
  while (simAccumulator >= FIXED_STEP) {
    stepSimulation();
    simAccumulator -= FIXED_STEP;
    stepped = true;
  }
  if (stepped || delta > 0) {
    syncRippleTexture(simAccumulator / FIXED_STEP);
  }
}

export function disposeWater2Material(material: THREE.Material): void {
  if (!(material instanceof THREE.ShaderMaterial)) return;
  if (disposedWater2Materials.has(material)) return;
  disposedWater2Materials.add(material);
  water2Materials.delete(material);
  material.dispose();
}
