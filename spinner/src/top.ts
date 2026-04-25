import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface TopResult {
  /** Positioned in the world; receives tilt rotations (X/Z). */
  tiltGroup: THREE.Group;
  /** Child of tiltGroup; receives Y-axis spin. */
  spinGroup: THREE.Group;
  /** Body material — exposed so game code can drive hit-flash emissive. */
  bodyMat: THREE.MeshStandardMaterial;
}

// After auto-scaling to fit the collision diameter, this multiplier sets the
// target size in world units. Set to 2 × spinnerConfig.radius to fill the hitbox.
const MODEL_SCALE = 1.5;

const SPINNER_URL = new URL('../models/spinner.glb', import.meta.url).href;

// ─── Shared GLTF cache — load once, clone per instance ──────────────────────

let cachedGltf: { scene: THREE.Group } | null = null;
const pendingCallbacks: Array<(scene: THREE.Group) => void> = [];

function getSpinnerScene(cb: (scene: THREE.Group) => void): void {
  if (cachedGltf) {
    // Already loaded — clone immediately
    cb(cachedGltf.scene.clone(true));
    return;
  }
  pendingCallbacks.push(cb);
  if (pendingCallbacks.length > 1) return; // already loading

  const loader = new GLTFLoader();
  loader.load(
    SPINNER_URL,
    (gltf) => {
      cachedGltf = { scene: gltf.scene };

      // Deliver to all waiting callers
      for (const fn of pendingCallbacks) fn(gltf.scene.clone(true));
      pendingCallbacks.length = 0;
    },
    undefined,
    (err) => console.error('[top] Failed to load spinner model:', err),
  );
}

// ─── Public factory ──────────────────────────────────────────────────────────

export function createTop(color: number = 0xe94560): TopResult {
  const tiltGroup = new THREE.Group();
  const spinGroup = new THREE.Group();
  tiltGroup.add(spinGroup);

  // ── Placeholder (shown until GLB arrives) ─────────────────────────────────
  const bodyGeo = new THREE.ConeGeometry(0.5, 1.2, 32);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 });
  const placeholder = new THREE.Mesh(bodyGeo, bodyMat);
  placeholder.rotation.x = Math.PI;
  placeholder.position.y = 0.6;
  placeholder.castShadow = true;
  spinGroup.add(placeholder);

  // ── Local point light — illuminates nearby floor / objects ────────────────
  const light = new THREE.PointLight(color, 2.0, 6, 1.5);
  light.position.y = 1.0;
  tiltGroup.add(light);

  // ── Async GLB insertion ───────────────────────────────────────────────────
  getSpinnerScene((model) => {
    spinGroup.remove(placeholder);

    // Compute native bounding box and center the model
    const box    = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Move model origin to its visual center
    model.position.set(-center.x, -center.y, -center.z);

    // Wrap in a group so we can scale without fighting the model's own transforms
    const root = new THREE.Group();
    root.add(model);

    // Auto-scale: model's largest dimension → MODEL_SCALE world units
    const autoScale = (maxDim > 0) ? (1.0 / maxDim) * MODEL_SCALE : MODEL_SCALE;
    root.scale.setScalar(autoScale);

    // Sit just above the floor
    root.position.y = 0.5;

    // Keep original materials (for textures) but sync emissive from bodyMat
    const modelMats: THREE.MeshStandardMaterial[] = [];
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const mat = mesh.material;
      if (mat instanceof THREE.MeshStandardMaterial) modelMats.push(mat);
    });

    // Propagate bodyMat emissive → model materials each frame (hit flash, overcharge, etc.)
    root.onBeforeRender = () => {
      for (const m of modelMats) {
        m.emissive.copy(bodyMat.emissive);
        m.emissiveIntensity = bodyMat.emissiveIntensity;
      }
    };

    spinGroup.add(root);
  });

  return { tiltGroup, spinGroup, bodyMat };
}
