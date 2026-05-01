import * as THREE from 'three';

export const scene = new THREE.Scene();
scene.background = null;

const MAX_RENDER_PIXEL_RATIO = 1.25;
const SHADOW_MAP_SIZE = 1024;
const refractionTargetSize = new THREE.Vector2();
const refractionTexelSize = new THREE.Vector2(1, 1);

interface RefractionUniforms {
  uSceneTexture: { value: THREE.Texture | null };
  uTexelSize: { value: THREE.Vector2 };
}

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
const refractionCaptureTarget = new THREE.WebGLRenderTarget(1, 1, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: true,
  stencilBuffer: false,
});
const refractionMeshes = new Set<THREE.Mesh>();
const refractionMaterials = new Set<THREE.ShaderMaterial>();

function isRefractionMaterial(material: THREE.Material): material is THREE.ShaderMaterial {
  return material instanceof THREE.ShaderMaterial && material.userData.isMirrorRefractionMaterial === true;
}

function ensureRefractionTargetSize(): void {
  renderer.getDrawingBufferSize(refractionTargetSize);
  const width = Math.max(1, Math.floor(refractionTargetSize.x));
  const height = Math.max(1, Math.floor(refractionTargetSize.y));
  if (refractionCaptureTarget.width !== width || refractionCaptureTarget.height !== height) {
    refractionCaptureTarget.setSize(width, height);
  }
  refractionTexelSize.set(1 / width, 1 / height);
}

export function registerRefractionMesh(mesh: THREE.Mesh): void {
  refractionMeshes.add(mesh);
  const material = mesh.material;
  if (Array.isArray(material)) {
    for (const entry of material) {
      if (isRefractionMaterial(entry)) refractionMaterials.add(entry);
    }
    return;
  }
  if (isRefractionMaterial(material)) refractionMaterials.add(material);
}

export function unregisterRefractionMesh(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    refractionMeshes.delete(obj);
    const material = obj.material;
    if (Array.isArray(material)) {
      for (const entry of material) {
        if (isRefractionMaterial(entry)) refractionMaterials.delete(entry);
      }
      return;
    }
    if (isRefractionMaterial(material)) refractionMaterials.delete(material);
  });
}

export function renderScene(activeScene: THREE.Scene, activeCamera: THREE.Camera): void {
  if (refractionMeshes.size === 0) {
    renderer.render(activeScene, activeCamera);
    return;
  }

  ensureRefractionTargetSize();

  const visibility = new Map<THREE.Mesh, boolean>();
  for (const mesh of refractionMeshes) {
    visibility.set(mesh, mesh.visible);
    mesh.visible = false;
  }

  renderer.setRenderTarget(refractionCaptureTarget);
  renderer.clear(true, true, true);
  renderer.render(activeScene, activeCamera);

  for (const [mesh, wasVisible] of visibility) mesh.visible = wasVisible;

  for (const material of refractionMaterials) {
    const uniforms = material.uniforms as unknown as RefractionUniforms;
    uniforms.uSceneTexture.value = refractionCaptureTarget.texture;
    uniforms.uTexelSize.value.copy(refractionTexelSize);
  }

  renderer.setRenderTarget(null);
  renderer.render(activeScene, activeCamera);
}

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
