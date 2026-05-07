import * as THREE from 'three';
import vertexShader from './water.vert.glsl?raw';
import fragmentShader from './water.frag.glsl?raw';

type RipplePoint = { x: number; z: number };

const waterRippleMaterials = new Set<THREE.ShaderMaterial>();
const disposedWaterRippleMaterials = new WeakSet<THREE.Material>();
const textureLoader = new THREE.TextureLoader();
const waterRippleTextureCache = new Map<string, THREE.Texture>();
const waterRipplePending = new Map<string, Promise<THREE.Texture>>();
const movementRippleCarry = new Map<number, number>();
let currentWaterRippleTime = 0;

interface WaterRippleRegion {
  material: THREE.ShaderMaterial;
  contains: (point: RipplePoint) => boolean;
  uvScale: number;
}

const waterRippleRegions: WaterRippleRegion[] = [];

const reflectionTextureUrl = new URL('../../water/public/goldensky.jpg', import.meta.url).href;
const noiseTextureUrl = new URL('../../water/public/noise.jpg', import.meta.url).href;

const whiteTexture = new THREE.DataTexture(
  new Uint8Array([255, 255, 255, 255]),
  1,
  1,
  THREE.RGBAFormat,
);
whiteTexture.colorSpace = THREE.SRGBColorSpace;
whiteTexture.needsUpdate = true;

function configureWaterTexture(texture: THREE.Texture, isColor: boolean): THREE.Texture {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function getWaterTexture(url: string, isColor: boolean): THREE.Texture {
  const key = `${isColor ? 'color' : 'data'}:${url}`;
  const existing = waterRippleTextureCache.get(key);
  if (existing) return existing;
  const texture = configureWaterTexture(textureLoader.load(url), isColor);
  waterRippleTextureCache.set(key, texture);
  return texture;
}

async function preloadWaterTexture(url: string, isColor: boolean): Promise<THREE.Texture> {
  const key = `${isColor ? 'color' : 'data'}:${url}`;
  const existing = waterRippleTextureCache.get(key);
  if (existing) return existing;
  const pending = waterRipplePending.get(key);
  if (pending) return pending;
  const promise = textureLoader.loadAsync(url).then((texture) => {
    const configured = configureWaterTexture(texture, isColor);
    waterRippleTextureCache.set(key, configured);
    waterRipplePending.delete(key);
    return configured;
  }).catch((error) => {
    waterRipplePending.delete(key);
    throw error;
  });
  waterRipplePending.set(key, promise);
  return promise;
}

// const vertexShader = `
// varying vec2 vUv;
// varying vec3 vWorldPos;

// void main() {
//   vUv = uv;
//   vec4 worldPos = modelMatrix * vec4(position, 1.0);
//   vWorldPos = worldPos.xyz;
//   gl_Position = projectionMatrix * viewMatrix * worldPos;
// }
// `;

// const fragmentShader = `
// precision highp float;

// uniform sampler2D uReflectTex;
// uniform sampler2D uNoiseTex;
// uniform sampler2D uBaseMap;
// uniform float uHasBaseMap;
// uniform vec3 uTint;
// uniform float uTime;
// uniform float uRippleScale;

// varying vec2 vUv;
// varying vec3 vWorldPos;

// #define PI 3.1415927
// #define DIVS 6

// vec3 srgbToLinearApprox(vec3 color) {
//   return pow(color, vec3(2.2));
// }

// float biasCurve(float x, float b) {
//   return x / ((1.0 / b - 2.0) * (1.0 - x) + 1.0);
// }

// float computeHeight(vec2 uv, float time) {
//   float h = 0.0;
//   for (int iy = 0; iy < DIVS; iy++) {
//     for (int ix = 0; ix < DIVS * 2; ix++) {
//       vec2 lookupUv = (vec2(float(ix), float(iy)) + 0.5) / vec2(float(DIVS * 2), float(DIVS));
//       vec4 t = texture2D(uNoiseTex, lookupUv);
//       vec2 p = vec2(float(ix), float(iy)) * (1.0 / float(DIVS - 1));
//       p += (0.75 / float(DIVS - 1)) * (t.xy * 2.0 - 1.0);

//       vec2 dVec = uv - p;
//       float d = pow(dot(dVec, dVec), 0.72);
//       float life = 10.0;
//       float n = time * 3.9 * (t.w + 0.22) - t.z * 6.0;
//       n *= 0.14 + t.w;
//       n = mod(n, life + t.z * 3.0 + 10.0);

//       float x = d * 99.0;
//       float mask = x < (2.0 * PI * n) ? 1.0 : 0.0;
//       float envelope = max(1.0 - (n / life), 0.0);
//       float falloff = envelope * x / max(2.0 * PI * n, 0.001);
//       float wave = sin(x - (2.0 * PI * n) - PI * 0.5);
//       wave = wave * 0.5 + 0.5;
//       wave = biasCurve(wave, 0.6);
//       wave = (falloff * wave) / (x + 1.1) * mask;
//       h += wave * 75.0 * (0.45 + t.w);
//     }
//   }
//   return h;
// }

// void main() {
//   vec2 rippleUv = fract(vWorldPos.xz * uRippleScale);
//   rippleUv = vec2(rippleUv.x * 2.0, 1.0 - rippleUv.y);
//   float h = computeHeight(rippleUv, uTime);
//   float eps = 0.02;
//   float hx = computeHeight(rippleUv + vec2(eps, 0.0), uTime);
//   float hz = computeHeight(rippleUv + vec2(0.0, eps), uTime);
//   vec2 grad = vec2(hx - h, hz - h) / eps;

//   vec3 normal = normalize(vec3(grad.x * 0.11, 1.0, grad.y * 0.11));
//   vec2 distortedUv = vUv + grad * 0.012;

//   vec3 texColor = srgbToLinearApprox(texture2D(uBaseMap, distortedUv).rgb);
//   vec3 baseColor = mix(vec3(1.0), texColor, uHasBaseMap);
//   baseColor *= uTint;

//   vec3 viewDir = normalize(cameraPosition - vWorldPos);
//   vec3 reflectDir = reflect(-viewDir, normal);
//   vec2 reflectUv = vec2(
//     atan(reflectDir.z, reflectDir.x) / (2.0 * PI) + 0.5,
//     asin(clamp(reflectDir.y, -1.0, 1.0)) / PI + 0.5
//   );
//   reflectUv += grad * 0.0025;
//   vec3 reflectColor = srgbToLinearApprox(texture2D(uReflectTex, reflectUv).rgb);

//   float foam = clamp(h * 0.08, 0.0, 1.0);
//   vec3 color = baseColor;

//   vec3 lightDir = normalize(vec3(0.35, 1.0, 0.28));
//   float diffuse = max(dot(normal, lightDir), 0.0);
//   float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.2);
//   float spec = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), 26.0);

//   color *= 0.9 + diffuse * 0.24;
//   color = mix(color, reflectColor, fresnel * 0.22);
//   color += vec3(0.8, 0.93, 1.0) * spec * 0.28;
//   color += vec3(0.08, 0.12, 0.16) * fresnel * 0.14;
//   color += vec3(0.12, 0.18, 0.24) * foam * 0.2;
//   color = max(color, baseColor * 0.5);

//   gl_FragColor = vec4(color, 1.0);
// }
// `;

export async function preloadWaterRippleAssets(): Promise<void> {
  await Promise.all([
    preloadWaterTexture(reflectionTextureUrl, true),
    preloadWaterTexture(noiseTextureUrl, false),
  ]);
}

function pushRippleToMaterial(
  material: THREE.ShaderMaterial,
  shaderUvX: number,
  shaderUvY: number,
  time: number,
): void {
  const clicks = material.uniforms.uClicks.value as THREE.Vector3[];
  const nextIndex = ((material.userData.waterRippleClickIndex as number | undefined) ?? 0) % clicks.length;
  clicks[nextIndex].set(shaderUvX, shaderUvY, time);
  material.userData.waterRippleClickIndex = (nextIndex + 1) % clicks.length;
}

function emitWorldRipple(point: RipplePoint, strength = 1): void {
  if (waterRippleRegions.length === 0) return;

  const visited = new Set<THREE.ShaderMaterial>();
  for (const region of waterRippleRegions) {
    if (visited.has(region.material)) continue;
    if (!region.contains(point)) continue;
    visited.add(region.material);

    const baseU = point.x / region.uvScale;
    const baseV = point.z / region.uvScale;
    const jitter = Math.max(0, strength - 1) * 0.018;
    const shaderUvX = baseU + (Math.random() - 0.5) * jitter;
    // Floor UV.y is authored in level-space Y before the mesh is rotated into
    // world-space Z, so matching the shader's `1.0 - vUv.y` path means adding
    // world Z here, not subtracting it.
    const shaderUvY = 1.0 + baseV + (Math.random() - 0.5) * jitter;
    pushRippleToMaterial(region.material, shaderUvX, shaderUvY, currentWaterRippleTime);
  }
}

export function createWaterRippleMaterial(
  color?: string,
  baseMap?: THREE.Texture | null,
): THREE.ShaderMaterial {
  const tint = color ? new THREE.Color(color) : new THREE.Color(0x6ea7b9);
  const effectiveTint = baseMap
    ? new THREE.Color(0xffffff).lerp(tint, 0.18)
    : tint;
  const clicks: THREE.Vector3[] = Array.from(
    { length: 8 },
    () => new THREE.Vector3(0, 0, -1000),
  );
  const uniforms = {
    iTime: { value: 0 },
    iChannel0: { value: baseMap ?? whiteTexture },
    iChannel1: { value: getWaterTexture(noiseTextureUrl, false) },
    iChannel2: { value: getWaterTexture(reflectionTextureUrl, true) },
    uClicks: { value: clicks },
    uAspect: { value: 1 },
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
  material.userData.isWaterRippleMaterial = true;
  waterRippleMaterials.add(material);
  return material;
}

export function updateWaterRippleSurfaces(time: number, cameraPos: THREE.Vector3): void {
  currentWaterRippleTime = time;
  for (const material of waterRippleMaterials) {
    material.uniforms.iTime.value = time;
    material.uniforms.uCameraPos.value.copy(cameraPos);
  }
}

export function clearWaterRippleSurfaceRegions(): void {
  waterRippleRegions.length = 0;
  movementRippleCarry.clear();
}

export function registerWaterRippleSurfaceRegion(region: WaterRippleRegion): void {
  waterRippleRegions.push(region);
}

export function emitMovementWaterRipples(
  emitterId: number,
  pos: RipplePoint,
  speed: number,
  radius: number,
  delta: number,
  time = currentWaterRippleTime,
): void {
  if (speed < 0.4 || delta <= 0) return;
  currentWaterRippleTime = time;

  const emissionRate = Math.max(0, speed - 0.3) * (0.8 + radius * 0.16);
  let carry = Math.min(4, (movementRippleCarry.get(emitterId) ?? 0) + emissionRate * delta);
  let count = Math.floor(carry);
  carry -= count;
  movementRippleCarry.set(emitterId, carry);
  count = Math.min(count, 2);

  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const offset = radius * (0.08 + Math.random() * 0.14);
    emitWorldRipple({
      x: pos.x + Math.cos(angle) * offset,
      z: pos.z + Math.sin(angle) * offset,
    }, 1.0 + Math.min(1.4, speed * 0.08));
  }
}

export function disposeWaterRippleMaterial(material: THREE.Material): void {
  if (!(material instanceof THREE.ShaderMaterial)) return;
  if (disposedWaterRippleMaterials.has(material)) return;
  disposedWaterRippleMaterials.add(material);
  waterRippleMaterials.delete(material);
  material.dispose();
}
