import * as THREE from 'three';
import { WALL_HEIGHT } from './constants';
import type { Rect } from './polygonClip';

// ─── Configuration ───────────────────────────────────────────────────────────

/** Side length of one chunk in world units. */
export const CHUNK_SIZE = 20;

/** Y range used for chunk AABBs in frustum tests — covers floor to top of
 *  walls plus a small margin for any content that pokes above. */
const AABB_Y_MIN = -1;
const AABB_Y_MAX = WALL_HEIGHT + 2;

/** How far to inflate each chunk's AABB before frustum testing. Acts as
 *  the "wider frustum" — buys a safety margin so content along the edge
 *  of view doesn't pop in just as it enters. */
const FRUSTUM_MARGIN = 4;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Chunk {
  /** "cx,cz" key. */
  key: string;
  /** Integer chunk coordinates. */
  cx: number;
  cz: number;
  /** World-space AABB used for frustum culling. Y range covers floor to
   *  top of walls; X/Z come from the chunk grid cell. */
  aabbWorld: THREE.Box3;
  /** Level-coord clip rectangle for polygon clipping. Polys are stored in
   *  level (x, y) space; lvZ converts level y to world z (= -y). */
  clipRectLevel: Rect;
  /** Group that holds all static visuals belonging to this chunk. */
  root: THREE.Group;
}

// ─── State ───────────────────────────────────────────────────────────────────

const chunks = new Map<string, Chunk>();
let chunkScene: THREE.Scene | null = null;

function makeKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Bind the chunk manager to a scene. Must be called once at level load,
 * before any `getOrCreateChunk` calls. Clears any prior chunk state.
 */
export function setupChunks(scene: THREE.Scene): void {
  clearChunks(scene);
  chunkScene = scene;
}

/**
 * Tear down all chunks. Removes chunk roots from the scene but does NOT
 * dispose their child geometries — owners (arena.ts merged meshes,
 * pickups, etc.) handle their own disposal in their respective reset paths.
 */
export function clearChunks(scene: THREE.Scene): void {
  for (const chunk of chunks.values()) {
    scene.remove(chunk.root);
  }
  chunks.clear();
  chunkScene = null;
}

// ─── Lookup / assignment ─────────────────────────────────────────────────────

/**
 * Return the chunk that contains world position (x, z). Lazily creates the
 * chunk on first access — only chunks that actually contain content end up
 * in the scene, so empty corners of the level don't waste memory.
 */
export function getOrCreateChunk(x: number, z: number): Chunk {
  if (!chunkScene) {
    throw new Error('chunkManager: setupChunks must be called before getOrCreateChunk');
  }
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  const key = makeKey(cx, cz);
  const existing = chunks.get(key);
  if (existing) return existing;

  const root = new THREE.Group();
  root.name = `chunk_${key}`;
  // Chunk roots have identity transforms (children are positioned in world
  // coords). Lock the matrix so Three.js doesn't recompute it every frame.
  // matrixWorldAutoUpdate stays true so the recursion still reaches
  // animated children (pickup spin, etc.) parented inside.
  root.updateMatrix();
  root.matrixAutoUpdate = false;
  chunkScene.add(root);
  root.updateMatrixWorld(true);

  // World-space AABB for frustum culling.
  const worldMinX = cx * CHUNK_SIZE;
  const worldMaxX = (cx + 1) * CHUNK_SIZE;
  const worldMinZ = cz * CHUNK_SIZE;
  const worldMaxZ = (cz + 1) * CHUNK_SIZE;
  const aabbWorld = new THREE.Box3(
    new THREE.Vector3(worldMinX, AABB_Y_MIN, worldMinZ),
    new THREE.Vector3(worldMaxX, AABB_Y_MAX, worldMaxZ),
  );
  // Level-coord clip rect: lvZ(y) = -y, so worldZ in [a, b] ⇔ levelY in [-b, -a].
  const clipRectLevel: Rect = {
    minX: worldMinX,
    maxX: worldMaxX,
    minY: -worldMaxZ,
    maxY: -worldMinZ,
  };

  const chunk: Chunk = {
    key,
    cx,
    cz,
    aabbWorld,
    clipRectLevel,
    root,
  };
  chunks.set(key, chunk);
  return chunk;
}

/** Parent an Object3D to a chunk's root. */
export function addToChunk(chunk: Chunk, obj: THREE.Object3D): void {
  chunk.root.add(obj);
}

/**
 * Return every chunk whose footprint overlaps the given world-space AABB.
 * Used by walls/floors that physically span multiple chunks: assigning the
 * geometry to every chunk it touches keeps the visual present whenever
 * any of those chunks is visible (instead of disappearing when the
 * centroid-chunk goes out of range).
 */
export function getChunksOverlappingBbox(
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): Chunk[] {
  const cMinX = Math.floor(minX / CHUNK_SIZE);
  const cMaxX = Math.floor(maxX / CHUNK_SIZE);
  const cMinZ = Math.floor(minZ / CHUNK_SIZE);
  const cMaxZ = Math.floor(maxZ / CHUNK_SIZE);
  const result: Chunk[] = [];
  for (let cx = cMinX; cx <= cMaxX; cx++) {
    for (let cz = cMinZ; cz <= cMaxZ; cz++) {
      // getOrCreateChunk takes a world coord; pick any point inside the chunk.
      result.push(getOrCreateChunk(cx * CHUNK_SIZE + 0.001, cz * CHUNK_SIZE + 0.001));
    }
  }
  return result;
}

// ─── Visibility update ───────────────────────────────────────────────────────

const projScreenMatrix = new THREE.Matrix4();
const frustum = new THREE.Frustum();
const inflatedAabb = new THREE.Box3();
const aabbInflateVec = new THREE.Vector3(FRUSTUM_MARGIN, FRUSTUM_MARGIN, FRUSTUM_MARGIN);

/**
 * Toggle each chunk's `root.visible` based on whether its (slightly inflated)
 * AABB intersects the camera frustum. Three.js's projectObject early-returns
 * on invisible subtrees so hidden chunks pay zero per-frame traversal cost.
 *
 * Lights inside chunks are NOT chunked (they live at scene root) to avoid
 * the NUM_POINT_LIGHTS recompile cascade.
 */
export function updateChunkVisibility(camera: THREE.Camera): void {
  // Three.js stores camera world-inverse on the camera; we derive frustum
  // from (proj * worldInverse). Make sure the camera matrices are current.
  camera.updateMatrixWorld();
  projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projScreenMatrix);

  for (const chunk of chunks.values()) {
    inflatedAabb.copy(chunk.aabbWorld);
    inflatedAabb.min.sub(aabbInflateVec);
    inflatedAabb.max.add(aabbInflateVec);
    chunk.root.visible = frustum.intersectsBox(inflatedAabb);
  }
}

// ─── Debug helpers ───────────────────────────────────────────────────────────

/** Force all chunks to a fixed visibility state. Useful for A/B testing
 *  performance with chunking effectively disabled. */
export function setAllChunksVisible(visible: boolean): void {
  for (const chunk of chunks.values()) {
    chunk.root.visible = visible;
  }
}

/** Returns chunk count + how many are currently visible. */
export function getChunkStats(): { total: number; visible: number } {
  let visible = 0;
  for (const chunk of chunks.values()) {
    if (chunk.root.visible) visible += 1;
  }
  return { total: chunks.size, visible };
}
