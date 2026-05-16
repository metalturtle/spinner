import * as THREE from 'three';
import { renderer, scene } from './renderer';
import nightSkyVertexShader from './nightSky.vert.glsl?raw';
import nightSkyFragmentShader from './nightSky.frag.glsl?raw';

export type SpaceBackgroundMode = 'day_cloudy' | 'night_moon';

const textureLoader = new THREE.TextureLoader();
const cloudyTextureUrl = new URL('../../water/public/cloudy.jpeg', import.meta.url).href;
const nightSkyRenderSize = new THREE.Vector2();
const DEFAULT_MODE: SpaceBackgroundMode = new URL(window.location.href).searchParams.get('sky') === 'day'
  ? 'day_cloudy'
  : 'night_moon';

let initialized = false;
let currentMode: SpaceBackgroundMode = DEFAULT_MODE;
let currentReflectionTexture: THREE.Texture | null = null;
let currentNightBlend = currentMode === 'night_moon' ? 1 : 0;
let cloudyTexture: THREE.Texture | null = null;
let nightSkyTarget: THREE.WebGLRenderTarget | null = null;
let nightSkyScene: THREE.Scene | null = null;
let nightSkyCamera: THREE.Camera | null = null;
let nightSkyMaterial: THREE.ShaderMaterial | null = null;
let renderedNightSky = false;
let nightOverlayRoot: HTMLDivElement | null = null;
let nightOverlayCanvas: HTMLCanvasElement | null = null;

function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function ensureNightOverlay(): HTMLDivElement {
  if (nightOverlayRoot && nightOverlayCanvas) return nightOverlayRoot;

  const root = document.createElement('div');
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'pointer-events:none',
    'z-index:0',
    'overflow:hidden',
    'background:linear-gradient(180deg, #05070c 0%, #070b12 38%, #030507 100%)',
  ].join(';');

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  root.appendChild(canvas);
  document.body.appendChild(root);

  nightOverlayRoot = root;
  nightOverlayCanvas = canvas;
  drawNightOverlay();
  return root;
}

function drawNightOverlay(): void {
  if (!nightOverlayCanvas) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const width = Math.max(1, Math.floor(window.innerWidth * dpr));
  const height = Math.max(1, Math.floor(window.innerHeight * dpr));
  if (nightOverlayCanvas.width !== width || nightOverlayCanvas.height !== height) {
    nightOverlayCanvas.width = width;
    nightOverlayCanvas.height = height;
  }

  const ctx = nightOverlayCanvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, '#060913');
  skyGradient.addColorStop(0.42, '#0a0f1a');
  skyGradient.addColorStop(1, '#020305');
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  const starCount = Math.floor((width * height) / 12000);
  for (let i = 0; i < starCount; i += 1) {
    const px = Math.floor(hash01(i * 3.17 + 11.0) * width);
    const py = Math.floor(hash01(i * 7.91 + 23.0) * height * 0.86);
    const size = hash01(i * 13.7 + 5.0) > 0.82 ? 3 : (hash01(i * 19.3 + 8.0) > 0.55 ? 2 : 1);
    const alpha = 0.45 + hash01(i * 29.1 + 2.0) * 0.55;
    ctx.fillStyle = `rgba(214, 228, 255, ${alpha.toFixed(3)})`;
    ctx.fillRect(px, py, size, size);
  }

  for (let i = 0; i < 18; i += 1) {
    const px = Math.floor(hash01(i * 41.7 + 91.0) * width);
    const py = Math.floor(hash01(i * 57.1 + 37.0) * height * 0.72);
    const ray = 2 + (i % 3);
    ctx.fillStyle = 'rgba(236, 242, 255, 0.9)';
    ctx.fillRect(px - ray, py, ray * 2 + 1, 1);
    ctx.fillRect(px, py - ray, 1, ray * 2 + 1);
    ctx.fillRect(px - 1, py - 1, 3, 3);
  }

  const moonRadius = Math.min(width, height) * 0.09;
  const moonX = width * 0.58;
  const moonY = height * 0.2;

  const glow = ctx.createRadialGradient(moonX, moonY, moonRadius * 0.25, moonX, moonY, moonRadius * 2.1);
  glow.addColorStop(0, 'rgba(216, 228, 255, 0.22)');
  glow.addColorStop(0.4, 'rgba(118, 140, 210, 0.12)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonRadius * 2.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#eef4ff';
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
  ctx.clip();
  const craterColor = 'rgba(166, 182, 214, 0.34)';
  const craters = [
    [-0.32, -0.08, 0.22],
    [0.22, -0.2, 0.16],
    [0.08, 0.18, 0.2],
    [-0.18, 0.28, 0.13],
    [0.34, 0.26, 0.1],
  ] as const;
  ctx.fillStyle = craterColor;
  for (const [ox, oy, rr] of craters) {
    ctx.beginPath();
    ctx.arc(moonX + ox * moonRadius, moonY + oy * moonRadius, rr * moonRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function configureTexture(texture: THREE.Texture): THREE.Texture {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

function ensureCloudyTexture(): THREE.Texture {
  if (cloudyTexture) return cloudyTexture;
  cloudyTexture = configureTexture(textureLoader.load(cloudyTextureUrl));
  return cloudyTexture;
}

function ensureNightSkyResources(): THREE.Texture {
  if (!nightSkyTarget) {
    nightSkyTarget = new THREE.WebGLRenderTarget(4096, 2048, {
      depthBuffer: false,
      stencilBuffer: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearMipmapLinearFilter,
      colorSpace: THREE.SRGBColorSpace,
    });
    nightSkyTarget.samples = renderer.capabilities.isWebGL2 ? 8 : 0;
    nightSkyTarget.texture.mapping = THREE.EquirectangularReflectionMapping;
    nightSkyTarget.texture.colorSpace = THREE.SRGBColorSpace;
    nightSkyTarget.texture.generateMipmaps = true;
    nightSkyTarget.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  if (!nightSkyScene) {
    nightSkyScene = new THREE.Scene();
    nightSkyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    nightSkyMaterial = new THREE.ShaderMaterial({
      vertexShader: nightSkyVertexShader,
      fragmentShader: nightSkyFragmentShader,
      uniforms: {
        iTime: { value: 0 },
      },
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), nightSkyMaterial);
    nightSkyScene.add(quad);
  }

  return nightSkyTarget.texture;
}

function ensureNightSkyTargetSize(): void {
  ensureNightSkyResources();
  if (!nightSkyTarget) return;

  renderer.getDrawingBufferSize(nightSkyRenderSize);
  const targetWidth = THREE.MathUtils.clamp(
    Math.ceil(nightSkyRenderSize.x * 1.35 / 256) * 256,
    3072,
    4096,
  );
  const targetHeight = targetWidth / 2;

  if (nightSkyTarget.width !== targetWidth || nightSkyTarget.height !== targetHeight) {
    nightSkyTarget.setSize(targetWidth, targetHeight);
  }
}

function renderNightSky(time = 0): void {
  ensureNightSkyTargetSize();
  if (!nightSkyTarget || !nightSkyScene || !nightSkyCamera || !nightSkyMaterial) return;

  nightSkyMaterial.uniforms.iTime.value = time;
  const previousTarget = renderer.getRenderTarget();
  const previousAutoClear = renderer.autoClear;
  renderer.autoClear = true;
  renderer.setRenderTarget(nightSkyTarget);
  renderer.render(nightSkyScene, nightSkyCamera);
  renderer.setRenderTarget(previousTarget);
  renderer.autoClear = previousAutoClear;
  renderedNightSky = true;
}

function applyCurrentBackground(): void {
  const overlay = ensureNightOverlay();
  const texture = currentMode === 'night_moon'
    ? ensureNightSkyResources()
    : ensureCloudyTexture();
  currentReflectionTexture = texture;
  currentNightBlend = currentMode === 'night_moon' ? 1 : 0;
  overlay.style.display = 'none';
  scene.background = texture;
}

export function initSpaceBackground(): void {
  if (initialized) return;
  initialized = true;

  ensureCloudyTexture();
  ensureNightSkyResources();
  ensureNightOverlay();
  renderNightSky(0);
  applyCurrentBackground();
  window.addEventListener('resize', drawNightOverlay);
}

export function setSpaceBackgroundMode(mode: SpaceBackgroundMode): void {
  if (currentMode === mode && currentReflectionTexture) return;
  currentMode = mode;
  currentNightBlend = currentMode === 'night_moon' ? 1 : 0;
  if (currentMode === 'night_moon' && !renderedNightSky) {
    renderNightSky(0);
  }
  applyCurrentBackground();
}

export function getSpaceBackgroundMode(): SpaceBackgroundMode {
  return currentMode;
}

export function getSpaceBackgroundReflectionTexture(): THREE.Texture {
  if (!initialized) initSpaceBackground();
  if (!currentReflectionTexture) applyCurrentBackground();
  return currentReflectionTexture!;
}

export function getSpaceBackgroundNightBlend(): number {
  return currentNightBlend;
}

export function updateSpaceBackground(time: number): void {
  if (!initialized) return;
  if (currentMode === 'night_moon') {
    renderNightSky(time);
  }
}
