import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { acquireAuraLight } from './auraLightPool';
import { renderer, scene } from './renderer';

export interface SpinnerMotionVisuals {
  speedHalo: THREE.Mesh;
  speedHaloMat: THREE.MeshBasicMaterial;
  /** Pooled PointLight — lives at scene root, not parented to spinGroup.
   *  Null when the user has set the light-pool size to 0 (or smaller than
   *  the simultaneous spinner count) — visuals must guard before writing. */
  auraLight: THREE.PointLight | null;
  /** Empty Object3D parented at the light's original local position. Each
   *  frame the spinner-visuals update copies its world position to auraLight
   *  so the pooled scene-level light tracks the spinner. */
  auraLightAnchor: THREE.Object3D;
}

export interface TopResult {
  /** Positioned in the world; receives tilt rotations (X/Z). */
  tiltGroup: THREE.Group;
  /** Child of tiltGroup; receives Y-axis spin. */
  spinGroup: THREE.Group;
  /** Body material — exposed so game code can drive hit-flash emissive. */
  bodyMat: THREE.MeshStandardMaterial;
  /** Optional shared visuals animated by spinnerVisuals.ts. */
  motionVisuals?: SpinnerMotionVisuals;
  /** Optional per-top spin speed scale, useful for debug-model variants. */
  getSpinSpeedScale?: () => number;
  /** Optional cleanup for style-specific runtime resources. */
  dispose?: () => void;
}

export interface CreateTopOptions {
  style?: 'default' | 'excalibur' | 'spinner1_fbx';
  coreColor?: THREE.ColorRepresentation;
  auraColor?: THREE.ColorRepresentation;
}

export interface ReflectionPreviewSphere {
  root: THREE.Group;
  config: ReflectionPreviewConfig;
  applyConfig: (next: Partial<ReflectionPreviewConfig>) => void;
  dispose: () => void;
}

export interface ReflectionPreviewConfig {
  reflectionsEnabled: number;
  repeatX: number;
  repeatY: number;
  aoIntensity: number;
  normalScale: number;
  roughness: number;
  metalness: number;
  emissiveIntensity: number;
  keyLightIntensity: number;
  fillLightIntensity: number;
  rimLightIntensity: number;
}

export interface Spinner1ModelConfig {
  rotationXDeg: number;
  rotationYDeg: number;
  rotationZDeg: number;
  spinSpeedScale: number;
}

// Standard spinner top size. Other spinner variants scale relative to this.
export const TOP_BASE_RADIUS = 1.6875;

const WHITE = new THREE.Color(0xffffff);
const CORE_BLUE = new THREE.Color(0xdff7ff);
const EXCALIBUR_EMERALD = new THREE.Color(0x2fff87);
const EXCALIBUR_CHROME_BASE = new THREE.Color(0xbfc7d4);
const EXCALIBUR_CHROME_ACCENT = new THREE.Color(0xe2e8f5);
const BODY_SEGMENTS = 40;
const REFLECTION_PROBE_SIZE = 256;
const ENABLE_REFLECTION_PROBE = true;
const textureLoader = new THREE.TextureLoader();
const SPINNER1_MODEL_URL = new URL('../models/spinner1.fbx', import.meta.url).href;
const spinner1ModelLoader = new FBXLoader();
let cachedSpinner1Model: THREE.Group | null = null;
let spinner1ModelLoadPromise: Promise<THREE.Group> | null = null;
const spinner1OrientationRoots = new Set<THREE.Object3D>();
const spinner1ModelConfig: Spinner1ModelConfig = {
  rotationXDeg: 0,
  rotationYDeg: 180,
  rotationZDeg: 0,
  spinSpeedScale: 0.18,
};

function applySpinner1ModelConfig(target: THREE.Object3D): void {
  target.rotation.set(
    THREE.MathUtils.degToRad(spinner1ModelConfig.rotationXDeg),
    THREE.MathUtils.degToRad(spinner1ModelConfig.rotationYDeg),
    THREE.MathUtils.degToRad(spinner1ModelConfig.rotationZDeg),
  );
}

export function getSpinner1ModelConfig(): Spinner1ModelConfig {
  return { ...spinner1ModelConfig };
}

export function updateSpinner1ModelConfig(next: Partial<Spinner1ModelConfig>): void {
  Object.assign(spinner1ModelConfig, next);
  for (const root of spinner1OrientationRoots) applySpinner1ModelConfig(root);
}

function cloneSpinner1Model(source: THREE.Group): THREE.Group {
  return clone(source) as THREE.Group;
}

function loadSpinner1Model(): Promise<THREE.Group> {
  if (cachedSpinner1Model) return Promise.resolve(cachedSpinner1Model);
  if (spinner1ModelLoadPromise) return spinner1ModelLoadPromise;

  spinner1ModelLoadPromise = new Promise((resolve) => {
    spinner1ModelLoader.load(
      SPINNER1_MODEL_URL,
      (fbx) => {
        fbx.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });
        cachedSpinner1Model = fbx;
        spinner1ModelLoadPromise = null;
        resolve(fbx);
      },
      undefined,
      (err) => {
        console.error('[top] Failed to load spinner1.fbx:', err);
        const fallback = new THREE.Group();
        cachedSpinner1Model = fallback;
        spinner1ModelLoadPromise = null;
        resolve(fallback);
      },
    );
  });

  return spinner1ModelLoadPromise;
}

export async function preloadSpinner1Model(): Promise<void> {
  await loadSpinner1Model();
}

function cloneSpinnerModelMaterial(source: THREE.Material | THREE.Material[] | undefined): THREE.MeshStandardMaterial[] {
  const materials = Array.isArray(source) ? source : (source ? [source] : []);
  if (materials.length === 0) {
    return [new THREE.MeshStandardMaterial({ color: 0xd7dee8, roughness: 0.28, metalness: 0.88 })];
  }

  return materials.map((mat) => {
    const anyMat = mat as THREE.Material & {
      color?: THREE.Color;
      map?: THREE.Texture | null;
      normalMap?: THREE.Texture | null;
      emissive?: THREE.Color;
      emissiveMap?: THREE.Texture | null;
      roughnessMap?: THREE.Texture | null;
      metalnessMap?: THREE.Texture | null;
      transparent?: boolean;
      opacity?: number;
    };
    return new THREE.MeshStandardMaterial({
      color: anyMat.color?.clone() ?? new THREE.Color(0xd7dee8),
      map: anyMat.map ?? null,
      normalMap: anyMat.normalMap ?? null,
      emissiveMap: anyMat.emissiveMap ?? null,
      roughnessMap: anyMat.roughnessMap ?? null,
      metalnessMap: anyMat.metalnessMap ?? null,
      transparent: anyMat.transparent === true,
      opacity: anyMat.opacity ?? 1,
      roughness: 0.26,
      metalness: 0.9,
    });
  });
}

function attachSpinner1Model(
  source: THREE.Group,
  spinnerModelRoot: THREE.Group,
  spinnerModelTintMaterials: Array<{ material: THREE.MeshStandardMaterial; baseColor: THREE.Color }>,
): boolean {
  const model = cloneSpinner1Model(source);
  if (model.children.length === 0) return false;
  const orientationRoot = new THREE.Group();
  spinnerModelRoot.add(orientationRoot);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const dominantRadius = Math.max(size.x, size.z) * 0.5 || 1;
  const modelScale = 1.18 / dominantRadius;
  model.scale.setScalar(modelScale);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
  model.position.x -= scaledCenter.x;
  model.position.z -= scaledCenter.z;
  model.position.y += -0.38 - scaledBox.min.y;

  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = cloneSpinnerModelMaterial(mesh.material);
    materials.forEach((material) => {
      spinnerModelTintMaterials.push({
        material,
        baseColor: material.color.clone(),
      });
    });
    mesh.material = materials.length === 1 ? materials[0] : materials;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  orientationRoot.add(model);
  applySpinner1ModelConfig(orientationRoot);
  spinner1OrientationRoots.add(orientationRoot);
  return true;
}

function loadSurfaceTexture(url: string, color = false): THREE.Texture {
  const texture = textureLoader.load(url);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function configurePreviewTexture(texture: THREE.Texture, repeatX: number, repeatY: number): THREE.Texture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.needsUpdate = true;
  return texture;
}

const previewMetalBaseColorMap = loadSurfaceTexture(
  new URL('../../textures/metal/Poliigon_MetalSteelBrushed_7174_BaseColor.jpg', import.meta.url).href,
  true,
);
const previewMetalAoMap = loadSurfaceTexture(
  new URL('../../textures/metal/Poliigon_MetalSteelBrushed_7174_AmbientOcclusion.jpg', import.meta.url).href,
);
const previewMetalNormalMap = loadSurfaceTexture(
  new URL('../../textures/metal/Poliigon_MetalSteelBrushed_7174_Normal.png', import.meta.url).href,
);
const previewMetalRoughnessMap = loadSurfaceTexture(
  new URL('../../textures/metal/Poliigon_MetalSteelBrushed_7174_Roughness.jpg', import.meta.url).href,
);
const previewMetalMetalnessMap = loadSurfaceTexture(
  new URL('../../textures/metal/Poliigon_MetalSteelBrushed_7174_Metallic.jpg', import.meta.url).href,
);

// configurePreviewTexture(previewMetalBaseColorMap, 0.3, 0.3);
// configurePreviewTexture(previewMetalAoMap, 0.3, 0.3);
// configurePreviewTexture(previewMetalNormalMap, 0.3,0.3);
// configurePreviewTexture(previewMetalRoughnessMap, 0.3, 0.3);
// configurePreviewTexture(previewMetalMetalnessMap, 0.3, 0.3);

const texSize = 0.5;
configurePreviewTexture(previewMetalBaseColorMap, texSize, texSize);
configurePreviewTexture(previewMetalAoMap, texSize, texSize);
configurePreviewTexture(previewMetalNormalMap, texSize,texSize);
configurePreviewTexture(previewMetalRoughnessMap, texSize, texSize);
configurePreviewTexture(previewMetalMetalnessMap, texSize, texSize);

interface ExcaliburReflectionProbe {
  root: THREE.Group;
  camera: THREE.CubeCamera;
  target: THREE.WebGLCubeRenderTarget;
  materials: Array<THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>;
}

const excaliburReflectionProbes = new Set<ExcaliburReflectionProbe>();
const probeWorldPos = new THREE.Vector3();

function registerExcaliburReflectionProbe(
  root: THREE.Group,
  materials: Array<THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>,
): () => void {
  if (!ENABLE_REFLECTION_PROBE) {
    for (const material of materials) {
      material.envMap = null;
      material.needsUpdate = true;
    }
    return () => {};
  }
  const target = new THREE.WebGLCubeRenderTarget(REFLECTION_PROBE_SIZE, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    colorSpace: THREE.SRGBColorSpace,
  });
  const camera = new THREE.CubeCamera(0.1, 80, target);
  const probe: ExcaliburReflectionProbe = { root, camera, target, materials };
  excaliburReflectionProbes.add(probe);
  for (const material of materials) {
    material.envMap = target.texture;
    material.needsUpdate = true;
  }
  return () => {
    excaliburReflectionProbes.delete(probe);
    target.dispose();
  };
}

export function updateExcaliburReflectionProbes(): void {
  for (const probe of excaliburReflectionProbes) {
    probe.root.getWorldPosition(probeWorldPos);
    probe.camera.position.copy(probeWorldPos);
    probe.root.visible = false;
    probe.camera.update(renderer, scene);
    probe.root.visible = true;
  }
}

export function createReflectionPreviewSphere(pos: { x: number; y?: number; z: number }): ReflectionPreviewSphere {
  const root = new THREE.Group();
  root.position.set(pos.x, pos.y ?? 1.55, pos.z);
  scene.add(root);

  const sphereGeometry = new THREE.SphereGeometry(5, 64, 40);
  sphereGeometry.setAttribute('uv2', new THREE.BufferAttribute(
    new Float32Array(sphereGeometry.attributes.uv.array),
    2,
  ));

  const material = new THREE.MeshStandardMaterial({
    color: 0xe8ecef,
    map: previewMetalBaseColorMap,
    aoMap: previewMetalAoMap,
    aoMapIntensity: 0.08,
    normalMap: previewMetalNormalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.34,
    roughnessMap: previewMetalRoughnessMap,
    metalness: 0.72,
    metalnessMap: previewMetalMetalnessMap,
    envMapIntensity: 1.25,
    emissive: new THREE.Color(0x0f1216),
    emissiveIntensity: 0.03,
  });

  const sphere = new THREE.Mesh(
    sphereGeometry,
    material,
  );
  sphere.castShadow = true;
  // root.add(sphere);

  const keyLight = new THREE.PointLight(0xffffff, 18, 14, 2);
  keyLight.position.set(2.4, 2.8, 2.2);
  keyLight.castShadow = false;
  root.add(keyLight);

  const fillLight = new THREE.PointLight(0xbfd8ff, 9, 12, 2);
  fillLight.position.set(-2.8, 1.4, 1.2);
  fillLight.castShadow = false;
  root.add(fillLight);

  const rimLight = new THREE.PointLight(0xffd6a6, 7, 12, 2);
  rimLight.position.set(0.2, 1.6, -3.1);
  rimLight.castShadow = false;
  root.add(rimLight);

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.24, 1.8, 18),
    new THREE.MeshStandardMaterial({
      color: 0x1e2227,
      roughness: 0.42,
      metalness: 0.84,
    }),
  );
  plinth.position.y = -1.2;
  plinth.castShadow = true;
  root.add(plinth);

  const disposeProbe = registerExcaliburReflectionProbe(root, [material]);
  const config: ReflectionPreviewConfig = {
    reflectionsEnabled: 1,
    repeatX: previewMetalBaseColorMap.repeat.x,
    repeatY: previewMetalBaseColorMap.repeat.y,
    aoIntensity: material.aoMapIntensity ?? 0,
    normalScale: material.normalScale?.x ?? 1,
    roughness: material.roughness,
    metalness: material.metalness,
    emissiveIntensity: material.emissiveIntensity,
    keyLightIntensity: keyLight.intensity,
    fillLightIntensity: fillLight.intensity,
    rimLightIntensity: rimLight.intensity,
  };

  const applyConfig = (next: Partial<ReflectionPreviewConfig>): void => {
    Object.assign(config, next);
    configurePreviewTexture(previewMetalBaseColorMap, config.repeatX, config.repeatY);
    configurePreviewTexture(previewMetalAoMap, config.repeatX, config.repeatY);
    configurePreviewTexture(previewMetalNormalMap, config.repeatX, config.repeatY);
    configurePreviewTexture(previewMetalRoughnessMap, config.repeatX, config.repeatY);
    configurePreviewTexture(previewMetalMetalnessMap, config.repeatX, config.repeatY);
    material.aoMapIntensity = config.aoIntensity;
    if (material.normalScale) material.normalScale.setScalar(config.normalScale);
    material.roughness = config.roughness;
    material.metalness = config.metalness;
    material.envMapIntensity = config.reflectionsEnabled > 0.5 ? 1.25 : 0.0;
    material.emissiveIntensity = config.emissiveIntensity;
    keyLight.intensity = config.keyLightIntensity;
    fillLight.intensity = config.fillLightIntensity;
    rimLight.intensity = config.rimLightIntensity;
    material.needsUpdate = true;
  };

  return {
    root,
    config,
    applyConfig,
    dispose: () => {
      disposeProbe();
      scene.remove(root);
      sphereGeometry.dispose();
      material.dispose();
      root.remove(keyLight);
      root.remove(fillLight);
      root.remove(rimLight);
      plinth.geometry.dispose();
      plinth.material.dispose();
    },
  };
}

function createFanBladeGeometry(): THREE.ExtrudeGeometry {
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.16, -0.18);
  bladeShape.lineTo(0.34, -0.2);
  bladeShape.lineTo(0.84, -0.04);
  bladeShape.lineTo(1.02, 0.26);
  bladeShape.lineTo(0.56, 0.32);
  bladeShape.lineTo(0.2, 0.18);
  bladeShape.lineTo(-0.02, 0.06);
  bladeShape.closePath();

  const geometry = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.14,
    bevelEnabled: false,
    curveSegments: 4,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0.14, -0.07);
  return geometry;
}

const SHARED_FAN_BLADE_GEOMETRY = createFanBladeGeometry();

function createExcaliburBladeGeometry(): THREE.ExtrudeGeometry {
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.08, -0.26);
  bladeShape.lineTo(0.14, -0.34);
  bladeShape.quadraticCurveTo(0.82, -0.42, 1.28, -0.04);
  bladeShape.quadraticCurveTo(1.44, 0.2, 1.26, 0.74);
  bladeShape.quadraticCurveTo(0.9, 0.98, 0.56, 0.84);
  bladeShape.lineTo(0.14, 0.44);
  bladeShape.quadraticCurveTo(0.5, 0.32, 0.62, -0.02);
  bladeShape.quadraticCurveTo(0.34, 0.06, 0.02, 0.08);
  bladeShape.lineTo(-0.08, -0.02);
  bladeShape.closePath();

  const geometry = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.16,
    bevelEnabled: false,
    curveSegments: 8,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0.14, -0.08);

  const positions = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 1) {
    vertex.fromBufferAttribute(positions, i);
    const xNorm = THREE.MathUtils.clamp((vertex.x + 0.08) / 1.56, 0, 1);
    const bendLift = THREE.MathUtils.smoothstep(xNorm, 0.16, 0.34)
      * (1 - THREE.MathUtils.smoothstep(xNorm, 0.5, 0.78));
    const tipLift = THREE.MathUtils.smoothstep(xNorm, 0.58, 0.94);
    const centerBias = 1 - THREE.MathUtils.clamp(Math.abs(vertex.z) / 0.085, 0, 1);
    vertex.y += bendLift * centerBias * 0.2 + tipLift * 0.06;

    const tipThin = THREE.MathUtils.smoothstep(xNorm, 0.56, 0.96);
    vertex.z *= 1.0 - tipThin * 0.42;

    positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

const SHARED_EXCALIBUR_BLADE_GEOMETRY = createExcaliburBladeGeometry();

export function createTop(
  color: number = 0xe94560,
  options: CreateTopOptions = {},
): TopResult {
  const tiltGroup = new THREE.Group();
  const spinGroup = new THREE.Group();
  tiltGroup.add(spinGroup);

  const style = options.style ?? 'default';
  const usesSpinner1Model = style === 'spinner1_fbx';
  const baseColor = style === 'excalibur'
    ? EXCALIBUR_CHROME_BASE.clone()
    : new THREE.Color(color);
  const accentColor = style === 'excalibur'
    ? EXCALIBUR_CHROME_ACCENT.clone()
    : baseColor.clone().lerp(WHITE, 0.28);
  const coreColor = options.coreColor
    ? new THREE.Color(options.coreColor)
    : (style === 'excalibur'
      ? EXCALIBUR_EMERALD.clone()
      : baseColor.clone().lerp(CORE_BLUE, 0.55));

  const bodyMat = style === 'excalibur'
    ? new THREE.MeshPhysicalMaterial({
      color: baseColor.clone(),
      roughness: 0.16,
      metalness: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      reflectivity: 1.0,
      envMapIntensity: 1.65,
      iridescence: 0.95,
      iridescenceIOR: 1.28,
      iridescenceThicknessRange: [260, 880],
    })
    : new THREE.MeshStandardMaterial({
      color: baseColor.clone(),
      roughness: 0.32,
      metalness: 0.88,
    });
  const trimMat = style === 'excalibur'
    ? new THREE.MeshPhysicalMaterial({
      color: accentColor.clone(),
      roughness: 0.09,
      metalness: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      reflectivity: 1.0,
      envMapIntensity: 1.95,
      iridescence: 1.0,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [320, 960],
    })
    : new THREE.MeshStandardMaterial({
      color: accentColor.clone(),
      roughness: 0.22,
      metalness: 0.96,
    });
  const shadowMat = new THREE.MeshStandardMaterial({
    color: style === 'excalibur' ? 0x2a3038 : 0x141922,
    roughness: style === 'excalibur' ? 0.3 : 0.48,
    metalness: style === 'excalibur' ? 0.92 : 0.74,
  });
  if (style === 'excalibur') shadowMat.envMapIntensity = 1.15;
  const coreMat = style === 'excalibur'
    ? new THREE.MeshPhysicalMaterial({
      color: coreColor.clone(),
      roughness: 0.08,
      metalness: 0.72,
      emissive: coreColor.clone().multiplyScalar(0.7),
      emissiveIntensity: 1.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.2,
      iridescence: 0.48,
      iridescenceIOR: 1.24,
      iridescenceThicknessRange: [180, 420],
    })
    : new THREE.MeshStandardMaterial({
      color: coreColor.clone(),
      roughness: 0.18,
      metalness: 0.78,
      emissive: coreColor.clone().multiplyScalar(0.14),
      emissiveIntensity: 0.5,
    });
  const speedHaloMat = new THREE.MeshBasicMaterial({
    color: (style === 'excalibur' ? coreColor : accentColor).clone(),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  // Aura light comes from a scene-level pool so spinner deaths don't
  // change NUM_POINT_LIGHTS and trigger material recompiles. spinnerVisuals
  // updates its position from auraLightAnchor each frame. Returns null when
  // the user has shrunk the pool (or this spinner overflowed it).
  const auraLight = acquireAuraLight(options.auraColor ?? (style === 'excalibur' ? coreColor : color));
  if (auraLight) {
    auraLight.intensity = style === 'excalibur' ? 17.5 : 15.25;
    auraLight.distance = style === 'excalibur' ? 11.5 : 10;
    auraLight.decay = style === 'excalibur' ? 1.6 : 1.8;
  }
  const auraLightAnchor = new THREE.Object3D();

  const root = new THREE.Group();
  root.position.y = 0.48;
  spinGroup.add(root);
  const proceduralRoot = new THREE.Group();
  root.add(proceduralRoot);
  const spinnerModelRoot = new THREE.Group();
  root.add(spinnerModelRoot);
  const spinnerModelTintMaterials: Array<{ material: THREE.MeshStandardMaterial; baseColor: THREE.Color }> = [];
  let spinnerModelLoaded = false;
  let spinnerModelCancelled = false;

  const bodyRadius = style === 'excalibur' ? 0.74 : 0.62;
  const bodyBottomRadius = style === 'excalibur' ? 0.56 : 0.46;
  const neckTopRadius = style === 'excalibur' ? 0.34 : 0.28;
  const neckBottomRadius = style === 'excalibur' ? 0.48 : 0.42;
  const capTopRadius = style === 'excalibur' ? 0.24 : 0.18;
  const capBottomRadius = style === 'excalibur' ? 0.34 : 0.28;
  const coreSize = style === 'excalibur' ? 0.21 : 0.16;
  const bladeLiftTop = style === 'excalibur' ? 0.36 : 0.3;
  const bladeLiftBottom = style === 'excalibur' ? 0.58 : 0.52;
  const haloInner = style === 'excalibur' ? 1.14 : 0.86;
  const haloOuter = style === 'excalibur' ? 1.72 : 1.28;

  const lowerBody = new THREE.Mesh(
    new THREE.CylinderGeometry(bodyRadius, bodyBottomRadius, 0.24, BODY_SEGMENTS),
    bodyMat,
  );
  lowerBody.position.y = 0.02;
  lowerBody.castShadow = true;
  proceduralRoot.add(lowerBody);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(neckTopRadius, neckBottomRadius, 0.18, 24),
    bodyMat,
  );
  neck.position.y = 0.2;
  neck.castShadow = true;
  proceduralRoot.add(neck);

  const centerCap = new THREE.Mesh(
    new THREE.CylinderGeometry(capTopRadius, capBottomRadius, 0.24, 24),
    trimMat,
  );
  centerCap.position.y = 0.38;
  centerCap.castShadow = true;
  proceduralRoot.add(centerCap);

  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(coreSize, 0),
    coreMat,
  );
  core.position.y = style === 'excalibur' ? 0.62 : 0.56;
  core.castShadow = true;
  proceduralRoot.add(core);

  const bladeLift = new THREE.Mesh(
    new THREE.CylinderGeometry(bladeLiftTop, bladeLiftBottom, 0.14, 24),
    trimMat,
  );
  bladeLift.position.y = 0.18;
  bladeLift.castShadow = true;
  proceduralRoot.add(bladeLift);

  const tipStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.11, 0.2, 16),
    trimMat,
  );
  tipStem.position.y = -0.16;
  tipStem.castShadow = true;
  proceduralRoot.add(tipStem);

  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.28, 16),
    shadowMat,
  );
  tip.position.y = -0.4;
  tip.castShadow = true;
  proceduralRoot.add(tip);

  if (style === 'excalibur') {
    for (let i = 0; i < 6; i += 1) {
      const bladePivot = new THREE.Group();
      bladePivot.rotation.y = (i / 6) * Math.PI * 2;
      proceduralRoot.add(bladePivot);

      const blade = new THREE.Mesh(
        SHARED_EXCALIBUR_BLADE_GEOMETRY,
        i % 2 === 0 ? trimMat : bodyMat,
      );
      blade.position.set(0.18, 0.28, 0);
      blade.rotation.y = -0.34;
      blade.castShadow = true;
      bladePivot.add(blade);

      const bladeRoot = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.1, 0.18),
        shadowMat,
      );
      bladeRoot.position.set(0.15, 0.2, 0.0);
      bladeRoot.rotation.y = -0.16;
      bladeRoot.castShadow = true;
      bladePivot.add(bladeRoot);

      const spoke = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.88, 10),
        shadowMat,
      );
      spoke.rotation.z = Math.PI / 2;
      spoke.position.set(0.49, 0.4, 0.0);
      spoke.castShadow = true;
      bladePivot.add(spoke);

      const gem = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.1, 1),
        coreMat,
      );
      gem.position.set(0.92, 0.4, 0.0);
      gem.castShadow = true;
      bladePivot.add(gem);
    }
  } else {
    for (let i = 0; i < 3; i += 1) {
      const blade = new THREE.Mesh(SHARED_FAN_BLADE_GEOMETRY, trimMat);
      const bladePivot = new THREE.Group();
      bladePivot.rotation.y = (i / 3) * Math.PI * 2;
      blade.position.set(0.14, 0.18, 0);
      blade.rotation.y = -0.52;
      blade.castShadow = true;
      bladePivot.add(blade);
      proceduralRoot.add(bladePivot);

      const bladeRoot = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.12, 0.28),
        shadowMat,
      );
      bladeRoot.position.set(0.22, 0.12, 0.02);
      bladeRoot.rotation.y = -0.28;
      bladeRoot.castShadow = true;
      bladePivot.add(bladeRoot);

      const bladeFin = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.08, 0.16),
        bodyMat,
      );
      bladeFin.position.set(0.78, 0.29, 0.14);
      bladeFin.rotation.y = 0.38;
      bladeFin.castShadow = true;
      bladePivot.add(bladeFin);
    }
  }

  const speedHalo = new THREE.Mesh(
    new THREE.RingGeometry(haloInner, haloOuter, 48),
    speedHaloMat,
  );
  speedHalo.rotation.x = -Math.PI / 2;
  speedHalo.position.y = style === 'excalibur' ? 0.28 : 0.22;
  root.add(speedHalo);
  auraLightAnchor.position.y = style === 'excalibur' ? 1.04 : 0.86;
  root.add(auraLightAnchor);

  if (usesSpinner1Model) {
    const finishAttach = (source: THREE.Group): void => {
      if (spinnerModelCancelled || !root.parent) return;
      spinnerModelLoaded = attachSpinner1Model(source, spinnerModelRoot, spinnerModelTintMaterials);
      if (spinnerModelLoaded) proceduralRoot.visible = false;
    };

    if (cachedSpinner1Model) {
      finishAttach(cachedSpinner1Model);
    } else {
      void loadSpinner1Model().then((source) => {
        finishAttach(source);
      });
    }
  }

  const syncColor = new THREE.Color();
  const glowColor = new THREE.Color();
  const emissiveBoost = new THREE.Color();
  let dispose: (() => void) | undefined;
  if (style === 'excalibur') {
    dispose = registerExcaliburReflectionProbe(root, [bodyMat, trimMat, shadowMat, coreMat]);
  }
  root.onBeforeRender = () => {
    syncColor.copy(bodyMat.color).lerp(WHITE, style === 'excalibur' ? 0.42 : 0.24);
    trimMat.color.copy(syncColor);
    trimMat.emissive.copy(bodyMat.emissive).multiplyScalar(style === 'excalibur' ? 0.34 : 0.52);
    trimMat.emissiveIntensity = bodyMat.emissiveIntensity * (style === 'excalibur' ? 0.55 : 0.75);

    if (style === 'excalibur') {
      glowColor.copy(coreColor).lerp(WHITE, 0.12);
      coreMat.color.copy(glowColor);
      coreMat.emissive.copy(coreColor).multiplyScalar(0.82 + bodyMat.emissiveIntensity * 0.26);
      emissiveBoost.copy(bodyMat.emissive).multiplyScalar(0.12);
      coreMat.emissive.add(emissiveBoost);
      coreMat.emissiveIntensity = 1.05 + bodyMat.emissiveIntensity * 0.42;
      speedHaloMat.color.copy(coreColor);
    } else {
      glowColor.copy(bodyMat.color).lerp(CORE_BLUE, 0.35);
      coreMat.color.copy(glowColor);
      coreMat.emissive.copy(glowColor).multiplyScalar(0.22 + bodyMat.emissiveIntensity * 0.18);
      emissiveBoost.copy(bodyMat.emissive).multiplyScalar(0.22);
      coreMat.emissive.add(emissiveBoost);
      coreMat.emissiveIntensity = 0.55 + bodyMat.emissiveIntensity * 0.35;
      speedHaloMat.color.copy(syncColor);
    }

    if (usesSpinner1Model && spinnerModelLoaded) {
      for (const entry of spinnerModelTintMaterials) {
        entry.material.color.copy(entry.baseColor).lerp(bodyMat.color, 0.78);
        entry.material.emissive.copy(bodyMat.emissive).multiplyScalar(0.42);
        entry.material.emissiveIntensity = bodyMat.emissiveIntensity * 0.55;
      }
    }
  };

  return {
    tiltGroup,
    spinGroup,
    bodyMat,
    motionVisuals: { speedHalo, speedHaloMat, auraLight, auraLightAnchor },
    getSpinSpeedScale: usesSpinner1Model ? () => spinner1ModelConfig.spinSpeedScale : undefined,
    dispose: () => {
      spinnerModelCancelled = true;
      spinnerModelRoot.traverse((obj) => {
        spinner1OrientationRoots.delete(obj);
      });
      dispose?.();
      spinnerModelRoot.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const material = mesh.material;
        if (Array.isArray(material)) {
          for (const entry of material) entry.dispose();
        } else {
          material.dispose();
        }
      });
    },
  };
}
