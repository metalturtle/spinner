import * as THREE from 'three';

interface GroundBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface CullEntry {
  object: THREE.Object3D;
  radius: number;
  anchor: THREE.Object3D | THREE.Vector3;
  // When provided, called with the active state instead of toggling
  // object.visible. Useful for PointLights — toggling visibility changes
  // Three's NUM_POINT_LIGHTS define and forces every lit material to
  // recompile. Drive intensity to 0 from this callback instead.
  onCullChange?: (active: boolean) => void;
}

const cullEntries = new Set<CullEntry>();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ray = new THREE.Ray();
const ndcPoint = new THREE.Vector3();
const worldPoint = new THREE.Vector3();
const worldPos = new THREE.Vector3();

function computeGroundBounds(camera: THREE.PerspectiveCamera): GroundBounds | null {
  camera.updateMatrixWorld();

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      ndcPoint.set(x, y, 0.5).unproject(camera);
      ray.origin.copy(camera.position);
      ray.direction.copy(ndcPoint).sub(camera.position).normalize();

      if (ray.intersectPlane(plane, worldPoint) === null) return null;

      minX = Math.min(minX, worldPoint.x);
      maxX = Math.max(maxX, worldPoint.x);
      minZ = Math.min(minZ, worldPoint.z);
      maxZ = Math.max(maxZ, worldPoint.z);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return null;
  }

  return { minX, maxX, minZ, maxZ };
}

export function registerTopDownCullable(
  object: THREE.Object3D,
  radius: number,
  anchor: THREE.Object3D | THREE.Vector3 = object,
  onCullChange?: (active: boolean) => void,
): () => void {
  const entry: CullEntry = {
    object,
    radius: Math.max(0, radius),
    anchor,
    onCullChange,
  };
  cullEntries.add(entry);
  return () => {
    if (entry.onCullChange) entry.onCullChange(true);
    else entry.object.visible = true;
    cullEntries.delete(entry);
  };
}

export function updateTopDownCulling(camera: THREE.PerspectiveCamera, padding = 0): void {
  const bounds = computeGroundBounds(camera);
  if (!bounds) return;

  const paddedMinX = bounds.minX - padding;
  const paddedMaxX = bounds.maxX + padding;
  const paddedMinZ = bounds.minZ - padding;
  const paddedMaxZ = bounds.maxZ + padding;

  for (const entry of cullEntries) {
    if (entry.anchor instanceof THREE.Vector3) {
      worldPos.copy(entry.anchor);
    } else {
      entry.anchor.getWorldPosition(worldPos);
    }
    const radius = entry.radius;
    const active = !(
      worldPos.x + radius < paddedMinX
      || worldPos.x - radius > paddedMaxX
      || worldPos.z + radius < paddedMinZ
      || worldPos.z - radius > paddedMaxZ
    );
    if (entry.onCullChange) {
      entry.onCullChange(active);
    } else {
      entry.object.visible = active;
    }
  }
}
