import * as THREE from 'three';

export const scene = new THREE.Scene();
scene.background = null;

const MAX_RENDER_PIXEL_RATIO = 1.25;
const SHADOW_MAP_SIZE = 1024;

function getRenderPixelRatio(): number {
  return Math.min(window.devicePixelRatio, MAX_RENDER_PIXEL_RATIO);
}

export const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
// Initial position set by camera.ts initCamera()

export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(getRenderPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const container = document.getElementById('canvas-container')!;
container.appendChild(renderer.domElement);

// ─── Lights ──────────────────────────────────────────────────────────────────

const ambientLight = new THREE.AmbientLight(0xffffff, 0.00);
scene.add(ambientLight);
//0xffffff
//0x111111
const dirLight = new THREE.DirectionalLight(0xcccccc, 1.2);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = SHADOW_MAP_SIZE;
dirLight.shadow.mapSize.height = SHADOW_MAP_SIZE;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 100;
dirLight.shadow.camera.left = -25;
dirLight.shadow.camera.right = 25;
dirLight.shadow.camera.top = 25;
dirLight.shadow.camera.bottom = -25;
scene.add(dirLight);

export interface GlobalLightingState {
  ambientColor: THREE.ColorRepresentation;
  ambientIntensity: number;
  directionalColor: THREE.ColorRepresentation;
  directionalIntensity: number;
}

const DEFAULT_GLOBAL_LIGHTING: Readonly<GlobalLightingState> = {
  ambientColor: 0xffffff,
  ambientIntensity: 0,
  directionalColor: 0xcccccc,
  directionalIntensity: 1.2,
};

const currentGlobalLighting = {
  ambientColor: new THREE.Color(DEFAULT_GLOBAL_LIGHTING.ambientColor),
  ambientIntensity: DEFAULT_GLOBAL_LIGHTING.ambientIntensity,
  directionalColor: new THREE.Color(DEFAULT_GLOBAL_LIGHTING.directionalColor),
  directionalIntensity: DEFAULT_GLOBAL_LIGHTING.directionalIntensity,
};

const targetGlobalLighting = {
  ambientColor: new THREE.Color(DEFAULT_GLOBAL_LIGHTING.ambientColor),
  ambientIntensity: DEFAULT_GLOBAL_LIGHTING.ambientIntensity,
  directionalColor: new THREE.Color(DEFAULT_GLOBAL_LIGHTING.directionalColor),
  directionalIntensity: DEFAULT_GLOBAL_LIGHTING.directionalIntensity,
};

let globalLightingTransitionSeconds = 0.7;

function clampNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function applyGlobalLightingState(
  state: {
    ambientColor: THREE.Color;
    ambientIntensity: number;
    directionalColor: THREE.Color;
    directionalIntensity: number;
  },
): void {
  ambientLight.color.copy(state.ambientColor);
  ambientLight.intensity = clampNonNegative(state.ambientIntensity);
  dirLight.color.copy(state.directionalColor);
  dirLight.intensity = clampNonNegative(state.directionalIntensity);
}

function copyLightingTarget(
  target: GlobalLightingState,
  destination: {
    ambientColor: THREE.Color;
    ambientIntensity: number;
    directionalColor: THREE.Color;
    directionalIntensity: number;
  },
): void {
  destination.ambientColor.set(target.ambientColor);
  destination.ambientIntensity = clampNonNegative(target.ambientIntensity);
  destination.directionalColor.set(target.directionalColor);
  destination.directionalIntensity = clampNonNegative(target.directionalIntensity);
}

export function getDefaultGlobalLightingState(): GlobalLightingState {
  return {
    ambientColor: DEFAULT_GLOBAL_LIGHTING.ambientColor,
    ambientIntensity: DEFAULT_GLOBAL_LIGHTING.ambientIntensity,
    directionalColor: DEFAULT_GLOBAL_LIGHTING.directionalColor,
    directionalIntensity: DEFAULT_GLOBAL_LIGHTING.directionalIntensity,
  };
}

export function setGlobalLightingTarget(
  target: GlobalLightingState,
  transitionSeconds = 0.7,
  immediate = false,
): void {
  globalLightingTransitionSeconds = Math.max(0.001, transitionSeconds);
  copyLightingTarget(target, targetGlobalLighting);
  if (immediate) {
    copyLightingTarget(target, currentGlobalLighting);
    applyGlobalLightingState(currentGlobalLighting);
  }
}

export function resetGlobalLightingTarget(transitionSeconds = 0.7, immediate = false): void {
  setGlobalLightingTarget(getDefaultGlobalLightingState(), transitionSeconds, immediate);
}

export function updateGlobalLighting(delta: number): void {
  const duration = Math.max(0.001, globalLightingTransitionSeconds);
  const t = duration <= 0.001 ? 1 : 1 - Math.exp(-delta / duration);

  currentGlobalLighting.ambientColor.lerp(targetGlobalLighting.ambientColor, t);
  currentGlobalLighting.directionalColor.lerp(targetGlobalLighting.directionalColor, t);
  currentGlobalLighting.ambientIntensity += (targetGlobalLighting.ambientIntensity - currentGlobalLighting.ambientIntensity) * t;
  currentGlobalLighting.directionalIntensity += (targetGlobalLighting.directionalIntensity - currentGlobalLighting.directionalIntensity) * t;

  applyGlobalLightingState(currentGlobalLighting);
}

applyGlobalLightingState(currentGlobalLighting);

// ─── Resize ──────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(getRenderPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
});
