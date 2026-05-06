import * as THREE from 'three';
import { getRefractionDisabled, getShadowsDisabled } from './settings';

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
// shadowMap.enabled stays on so materials keep compiling shadow code
// paths; we control whether the shadow pass actually runs by toggling
// dirLight.castShadow in applyShadowsDisabledState below. Disabling
// shadowMap.enabled directly leaves materials sampling a never-rendered
// shadow texture, which on Mac/Chrome shows up as a black floor.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

/** Apply the current shadowsDisabled setting. Toggles `dirLight.castShadow`
 *  — when false, Three.js skips the shadow render pass for that light and
 *  rebuilds material shaders without shadow code. */
export function applyShadowsDisabledState(): void {
  const disabled = getShadowsDisabled();
  dirLight.castShadow = !disabled;
  // Material shaders embed shadow-related defines based on the lights
  // present at compile time. After flipping castShadow we have to mark
  // affected materials dirty so they recompile without (or with) shadow
  // code on the next render.
  scene.traverse((obj) => {
    const mat = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    if (Array.isArray(mat)) {
      for (const m of mat) m.needsUpdate = true;
    } else {
      mat.needsUpdate = true;
    }
  });
}
// Skip per-frame getProgramInfoLog calls — those force a GPU pipeline sync
// and showed up as 2.3s on a 1.8min trace. Re-enable when debugging shaders.
renderer.debug.checkShaderErrors = false;

// ─── Shader compile diagnostic ───────────────────────────────────────────────
// Logs each new shader compile + the program's cacheKey, which identifies the
// material+lights combination that triggered it. The cacheKey looks like:
//   "MeshStandardMaterial,...,numPointLights:2,numDirLights:1,..."
// so we can tell whether it's a new material or just a light-count variant.
if (import.meta.env.DEV) {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const origLink = gl.linkProgram.bind(gl);
  let compileCount = 0;
  let loadPhaseEndedAt = 0;
  let lastSeenProgramCount = 0;
  gl.linkProgram = function (program: WebGLProgram): void {
    compileCount += 1;
    const now = performance.now();
    const duringGameplay = loadPhaseEndedAt > 0 && (now - loadPhaseEndedAt) > 500;

    // Capture the attached shader sources BEFORE linkProgram — sources are
    // available pre-link via getAttachedShaders + getShaderSource. We surface
    // them only for stutter compiles so we can match them against the
    // codebase and find the lazy material.
    let stutterShaderSources: { vertex: string; fragment: string } | null = null;
    if (duringGameplay) {
      const shaders = gl.getAttachedShaders(program);
      if (shaders) {
        let vertexSrc = '';
        let fragmentSrc = '';
        for (const s of shaders) {
          const src = gl.getShaderSource(s) ?? '';
          const type = gl.getShaderParameter(s, gl.SHADER_TYPE);
          if (type === gl.VERTEX_SHADER) vertexSrc = src;
          else if (type === gl.FRAGMENT_SHADER) fragmentSrc = src;
        }
        stutterShaderSources = { vertex: vertexSrc, fragment: fragmentSrc };
      }
    }

    origLink(program);

    // The new program is added to renderer.info.programs *after* this call
    // returns, so peek on a microtask.
    queueMicrotask(() => {
      const programs = renderer.info.programs ?? [];
      // Pull every program added since the last log so we don't miss any.
      for (let i = lastSeenProgramCount; i < programs.length; i++) {
        const p = programs[i] as { cacheKey?: string };
        const key = p.cacheKey ?? '<unknown>';
        // Trim — cacheKey can be very long. Keep the material name + the bits
        // that change between variants.
        const summary = key
          .split(',')
          .filter((part) => /^(numPointLights|numDirLights|numSpotLights|numHemiLights|MeshStandardMaterial|MeshBasicMaterial|ShaderMaterial|MeshPhysicalMaterial|MeshLambertMaterial|MeshPhongMaterial|map|envMap|skinning|morphTargets|fog|toneMapping)/.test(part))
          .join(',');
        const tag = duringGameplay ? '⚠ STUTTER COMPILE' : '[startup compile]';
        console.log(`${tag} #${compileCount} ${summary || key.slice(0, 200)}`);
        if (stutterShaderSources) {
          // The first ~1KB of each shader is three.js's standard prelude
          // (precision qualifiers, #define USE_*, etc.) — the user-defined
          // body is at the END. Print the tail so we can grep-match it
          // against the codebase.
          const vertTail = stutterShaderSources.vertex.slice(-600).replace(/\s+/g, ' ').trim();
          const fragTail = stutterShaderSources.fragment.slice(-600).replace(/\s+/g, ' ').trim();
          console.log(`  └─ vert tail: ${vertTail}`);
          console.log(`  └─ frag tail: ${fragTail}`);
        }
      }
      lastSeenProgramCount = programs.length;
    });
  };
  // Mark the end of the load phase so post-load compiles get the warning tag.
  (window as unknown as { __markGameplayStart: () => void }).__markGameplayStart = () => {
    loadPhaseEndedAt = performance.now();
    console.log(`[diag] gameplay started — compiles after this point are stutters. Total at load: ${compileCount}`);
  };
}

const refractionCaptureTarget = new THREE.WebGLRenderTarget(1, 1, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: true,
  stencilBuffer: false,
});

/**
 * Run a callback while the refraction render target is bound. Used at
 * level-load to pre-compile shaders for the linear-output variant. Three's
 * WebGLRenderer hardcodes LinearSRGBColorSpace for non-XR render targets, so
 * any material rendered through this target gets a srgb-linear shader variant
 * in addition to the canvas's srgb one. Without warming both, every visible
 * material compiles its second variant on the first frame the mirror is on
 * screen — a multi-program stall.
 */
export async function compileForRefractionTarget(
  scene: THREE.Scene,
  cam: THREE.Camera,
): Promise<void> {
  // Skip the second compile pass entirely when refraction is off — its
  // sole purpose is to prewarm the srgb-linear shader variants used while
  // rendering to the refraction target, which we never enter in that mode.
  if (getRefractionDisabled()) return;
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(refractionCaptureTarget);
  try {
    await renderer.compileAsync(scene, cam);
  } finally {
    renderer.setRenderTarget(previous);
  }
}
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
  // If refraction is disabled at the time the mesh registers (level start),
  // hide it. This makes the renderScene short-circuit kick in (no second
  // render pass when no mirror is visible).
  if (getRefractionDisabled()) mesh.visible = false;
  const material = mesh.material;
  if (Array.isArray(material)) {
    for (const entry of material) {
      if (isRefractionMaterial(entry)) refractionMaterials.add(entry);
    }
    return;
  }
  if (isRefractionMaterial(material)) refractionMaterials.add(material);
}

/**
 * Apply the current refractionDisabled setting to every registered mirror
 * mesh. Called from the menu toggle so the change takes effect immediately
 * without a level reload.
 */
export function applyRefractionDisabledState(): void {
  const disabled = getRefractionDisabled();
  for (const mesh of refractionMeshes) {
    mesh.visible = !disabled;
  }
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

  // Even when meshes are registered, skip the second scene render if none of
  // them is currently visible — the refraction room is far cheaper to enter
  // than to keep paying for every frame of the level.
  let anyVisible = false;
  for (const mesh of refractionMeshes) {
    if (mesh.visible) { anyVisible = true; break; }
  }
  if (!anyVisible) {
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
// Honor the persisted shadows-disabled setting at module load. Materials
// inspecting the light during their first compile will see this state.
dirLight.castShadow = !getShadowsDisabled();
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
