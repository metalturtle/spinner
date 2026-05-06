import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WALL_HEIGHT } from './constants';
import { walls, zones } from './physics';
import { lvZ, type LevelData, type LevelPolygon } from './levelLoader';
import { createLavaMaterial } from './lavaSurface';
import { clearLavaEmbers, registerLavaEmitter } from './lavaEmbers';
import { applyLaserLightToMaterial, setLaserLightBounds } from './laserLightBuffer';
import { registerRefractionMesh, unregisterRefractionMesh } from './renderer';
import { registerTopDownCullable } from './sceneCulling';
import { applyWallExtrusionUVs, applyWorldUVs, getTextureScale, TextureManager } from './textureUtils';
import { getLightsDisabled } from './settings';
import { addToChunk, getChunksOverlappingBbox, setupChunks, type Chunk } from './chunkManager';
import {
  circleToPolygon,
  clipPolygonToRect,
  polygonAreaAbs,
  polygonBbox,
  type Rect,
  type Vec2 as ClipVec2,
} from './polygonClip';

const WALL_COLOR    = 0x0f3460;
const WALL_EMISSIVE = 0x051030;
const FLOOR_COLOR   = 0x445566;
const CIRCLE_FLOOR_SEGMENTS = 48;
const CIRCLE_FLOOR_INSET = 0.05;
const DEBUG_SHOW_NORMAL_AS_ALBEDO = false;
const arenaRoots: THREE.Object3D[] = [];
interface LavaLightState { light: THREE.PointLight; baseIntensity: number }
const lavaLightStates: LavaLightState[] = [];
const lavaLightRoots: THREE.Object3D[] = [];
const lavaLightCullHandles = new WeakMap<THREE.Object3D, () => void>();
const defaultRefractionNormalTexture = new THREE.DataTexture(
  new Uint8Array([128, 128, 255, 255]),
  1,
  1,
  THREE.RGBAFormat,
);
defaultRefractionNormalTexture.needsUpdate = true;
type LavaRegion = { contains(point: { x: number; z: number }): boolean };
const lavaRegions: LavaRegion[] = [];
type ArenaBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
const currentArenaBounds: ArenaBounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };

const MIRROR_WALL_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec4 vClipPos;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vClipPos = projectionMatrix * viewMatrix * worldPos;
    gl_Position = vClipPos;
  }
`;

const MIRROR_WALL_FRAGMENT_SHADER = `
  uniform sampler2D uSceneTexture;
  uniform sampler2D uNormalMap;
  uniform vec2 uTexelSize;
  uniform vec3 uTint;
  uniform float uTintStrength;
  uniform float uOpacity;
  uniform float uRefractionStrength;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec4 vClipPos;

  void main() {
    vec2 screenUv = (vClipPos.xy / max(vClipPos.w, 0.0001)) * 0.5 + 0.5;
    vec3 viewNormal = normalize((viewMatrix * vec4(normalize(vWorldNormal), 0.0)).xyz);
    vec3 mapNormal = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
    vec2 distortionDir = viewNormal.xy * 0.65 + mapNormal.xy * 0.9;

    float waveA = sin(vWorldPos.x * 1.35 + vWorldPos.y * 7.5 + vWorldPos.z * 0.8);
    float waveB = cos(vWorldPos.z * 1.55 - vWorldPos.x * 0.95 + vWorldPos.y * 5.2);
    vec2 waveOffset = vec2(waveA, waveB) * 0.35;

    vec2 offset = (distortionDir + waveOffset) * (uRefractionStrength * uTexelSize);
    vec2 sampleUv = clamp(screenUv + offset, vec2(0.001), vec2(0.999));

    vec4 sceneSample = texture2D(uSceneTexture, sampleUv);
    vec3 refracted = mix(sceneSample.rgb, sceneSample.rgb * uTint, uTintStrength);

    gl_FragColor = vec4(refracted, uOpacity);
  }
`;

export function getArenaBounds(): ArenaBounds {
  return currentArenaBounds;
}

function setArenaBoundsFromLevel(level: LevelData): void {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const poly of level.polygons ?? []) {
    for (const vertex of poly.vertices) {
      const z = lvZ(vertex.y);
      minX = Math.min(minX, vertex.x);
      maxX = Math.max(maxX, vertex.x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }

  for (const circle of level.circles ?? []) {
    const centerZ = lvZ(circle.center.y);
    minX = Math.min(minX, circle.center.x - circle.radius);
    maxX = Math.max(maxX, circle.center.x + circle.radius);
    minZ = Math.min(minZ, centerZ - circle.radius);
    maxZ = Math.max(maxZ, centerZ + circle.radius);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    currentArenaBounds.minX = -20;
    currentArenaBounds.maxX = 20;
    currentArenaBounds.minZ = -20;
    currentArenaBounds.maxZ = 20;
    return;
  }

  currentArenaBounds.minX = minX;
  currentArenaBounds.maxX = maxX;
  currentArenaBounds.minZ = minZ;
  currentArenaBounds.maxZ = maxZ;
}

function getSurfaceColor(color: string | undefined, fallback: THREE.ColorRepresentation, hasTexture: boolean): THREE.ColorRepresentation {
  if (!color) return hasTexture ? 0xffffff : fallback;
  if (!hasTexture) return new THREE.Color(color);
  return new THREE.Color(0xffffff).lerp(new THREE.Color(color), 0.18);
}

function makeShapeFromPolygon(poly: LevelPolygon): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(poly.vertices[0].x, poly.vertices[0].y);
  for (let i = 1; i < poly.vertices.length; i++) shape.lineTo(poly.vertices[i].x, poly.vertices[i].y);
  shape.closePath();

  for (const hole of poly.holes ?? []) {
    if (hole.length < 3) continue;
    const holePath = new THREE.Path();
    holePath.moveTo(hole[0].x, hole[0].y);
    for (let i = 1; i < hole.length; i++) holePath.lineTo(hole[i].x, hole[i].y);
    holePath.closePath();
    shape.holes.push(holePath);
  }

  return shape;
}

function isPointInPolygon(point: { x: number; z: number }, vertices: { x: number; z: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const zi = vertices[i].z;
    const xj = vertices[j].x;
    const zj = vertices[j].z;
    const intersects = ((zi > point.z) !== (zj > point.z))
      && (point.x < ((xj - xi) * (point.z - zi)) / ((zj - zi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function buildLavaRegionFromPolygon(poly: LevelPolygon): LavaRegion | null {
  if (poly.vertices.length < 3) return null;
  const outer = poly.vertices.map((vertex) => ({ x: vertex.x, z: lvZ(vertex.y) }));
  const holes = (poly.holes ?? []).map((hole) => hole.map((vertex) => ({ x: vertex.x, z: lvZ(vertex.y) })));
  return {
    contains(point) {
      if (!isPointInPolygon(point, outer)) return false;
      return !holes.some((hole) => hole.length >= 3 && isPointInPolygon(point, hole));
    },
  };
}

function clearLavaRegions(): void {
  lavaRegions.length = 0;
}

function registerLavaRegion(region: LavaRegion | null): void {
  if (region) lavaRegions.push(region);
}

export function isPointInLava(point: { x: number; z: number }): boolean {
  return lavaRegions.some((region) => region.contains(point));
}

function isLavaSurface(poly: LevelPolygon): boolean {
  const surfaceType = poly.properties?.surfaceType;
  return poly.layer === 'floor' && (surfaceType === 'lava' || surfaceType === 'water');
}

function getDrainRate(poly: LevelPolygon): number {
  const raw = poly.properties?.drainRate;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string') {
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 8;
}

function isInvisibleWall(poly: LevelPolygon): boolean {
  const raw = poly.properties?.invisible;
  return raw === true || raw === 'true' || raw === '1';
}

function isMirrorWall(poly: LevelPolygon): boolean {
  const raw = poly.properties?.mirror;
  return raw === true || raw === 'true' || raw === '1';
}

function createMirrorWallMaterial(poly: LevelPolygon, normalMap: THREE.Texture | null): THREE.ShaderMaterial {
  const tint = poly.color ? new THREE.Color(poly.color) : new THREE.Color(0xdff8ff);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSceneTexture: { value: null },
      uNormalMap: { value: normalMap ?? defaultRefractionNormalTexture },
      uTexelSize: { value: new THREE.Vector2(1, 1) },
      uTint: { value: tint },
      uTintStrength: { value: 0.18 },
      uOpacity: { value: 0.68 },
      uRefractionStrength: { value: 6.0 },
    },
    vertexShader: MIRROR_WALL_VERTEX_SHADER,
    fragmentShader: MIRROR_WALL_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.userData.isMirrorRefractionMaterial = true;
  return material;
}

function extrudeWallPoly(poly: LevelPolygon, mat: THREE.Material): THREE.Mesh {
  const shape = makeShapeFromPolygon(poly);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_HEIGHT, bevelEnabled: false });
  const textureScale = getTextureScale(poly.textureId, poly.textureScale);
  if (textureScale) {
    applyWallExtrusionUVs(geo, textureScale);
  }
  const mesh = new THREE.Mesh(geo, mat);
  // ExtrudeGeometry extrudes along +Z; rotate so it stands upright in XZ world
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = mat.transparent ? 0.01 : 0;
  mesh.castShadow = !mat.transparent;
  mesh.receiveShadow = true;
  return mesh;
}

function clearLavaLights(scene: THREE.Scene): void {
  while (lavaLightRoots.length > 0) {
    const root = lavaLightRoots.pop()!;
    lavaLightCullHandles.get(root)?.();
    lavaLightCullHandles.delete(root);
    scene.remove(root);
  }
  lavaLightStates.length = 0;
}

export function refreshLavaLightIntensities(): void {
  const disabled = getLightsDisabled();
  for (const state of lavaLightStates) {
    state.light.intensity = disabled ? 0 : state.baseIntensity;
  }
}

function clearArenaRoots(scene: THREE.Scene): void {
  while (arenaRoots.length > 0) {
    const root = arenaRoots.pop()!;
    unregisterRefractionMesh(root);
    scene.remove(root);
  }
}

function addArenaRoot(scene: THREE.Scene, root: THREE.Object3D): void {
  arenaRoots.push(root);
  scene.add(root);
  // Arena geometry is positioned at level load and never moves. Locking
  // the matrices skips Three.js's per-frame compose + multiplyMatrices
  // for every wall and floor, and stops the parent recursion entirely
  // (because matrixWorldAutoUpdate=false makes scene skip these subtrees
  // in updateMatrixWorld).
  root.updateMatrix();
  root.updateMatrixWorld(true);
  root.matrixAutoUpdate = false;
  root.matrixWorldAutoUpdate = false;
}

function addLavaLight(scene: THREE.Scene, poly: LevelPolygon): void {
  if (poly.vertices.length < 3) return;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let centerX = 0;
  let centerZ = 0;

  for (const vertex of poly.vertices) {
    const z = lvZ(vertex.y);
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    centerX += vertex.x;
    centerZ += z;
  }

  centerX /= poly.vertices.length;
  centerZ /= poly.vertices.length;

  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const radius = Math.max(spanX, spanZ) * 0.5;

  const root = new THREE.Group();
  root.position.set(centerX, 2, centerZ);

  const lightRange = Math.max(6, radius * 2.8);
  const baseLightIntensity = (100.2 + radius * 0.18) * 10;
  const light = new THREE.PointLight(0xff6a1a, baseLightIntensity, lightRange, 1.6);
  light.castShadow = false;
  root.add(light);

  lavaLightStates.push({ light, baseIntensity: baseLightIntensity });
  lavaLightRoots.push(root);
  // Toggle intensity rather than visibility — see levelLights.ts for rationale.
  lavaLightCullHandles.set(root, registerTopDownCullable(root, lightRange, root, (active) => {
    light.intensity = (!getLightsDisabled() && active) ? baseLightIntensity : 0;
  }));
  scene.add(root);
}

export function createArena(scene: THREE.Scene, level: LevelData): void {
  clearLavaEmbers();
  clearArenaRoots(scene);
  clearLavaLights(scene);
  clearLavaRegions();
  walls.length = 0;
  zones.length = 0;
  setArenaBoundsFromLevel(level);
  setLaserLightBounds(currentArenaBounds);
  // Build the spatial-chunk grid for this level. Walls, floors, and other
  // static visuals are bucketed into chunks; chunks far from the player are
  // hidden each frame so projectObject and rendering skip those subtrees
  // entirely. Lights stay scene-rooted (chunk visibility doesn't affect
  // them) to avoid the NUM_POINT_LIGHTS recompile cascade.
  setupChunks(scene);

  // ─── Separate polygons and circles by layer ──────────────────────────────
  const polys        = level.polygons ?? [];
  const circs        = level.circles  ?? [];
  // v1 compat: polygons without layer default to 'wall'
  const wallPolys    = polys.filter(p => !p.layer || p.layer === 'wall');
  const floorPolys   = polys.filter(p => p.layer === 'floor');
  const floorCircles = circs.filter(c => !c.layer || c.layer === 'floor');

  function makeSurfaceMat(color?: string, textureId?: string): THREE.MeshStandardMaterial {
    const hasTexture = Boolean(textureId);
    const baseMap = TextureManager.get(textureId);
    const debugNormalMap = DEBUG_SHOW_NORMAL_AS_ALBEDO ? TextureManager.getNormal(textureId, true) : null;
    const map = DEBUG_SHOW_NORMAL_AS_ALBEDO && debugNormalMap ? debugNormalMap : baseMap;
    return new THREE.MeshStandardMaterial({
      color: getSurfaceColor(color, FLOOR_COLOR, hasTexture),
      map,
      roughness: 0.85,
      metalness: 0.05,
    });
  }

  // ─── Material caches and merge groups ────────────────────────────────────
  // Levels often repeat the same texture/color across many wall and floor
  // polys. Without merging, each poly creates its own material + mesh =
  // its own draw call. Keying materials on (color, textureId, useReliefMap)
  // lets identical-looking polys share a material, and their geometries
  // get merged into a single mesh per material — collapsing dozens of
  // wall/floor draw calls (and scene-graph nodes, and matrix updates)
  // into a handful.
  const floorMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
  const wallMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

  // Per-chunk per-material merge groups for FLOORS only. Key is
  // `${chunkKey}|${matKey}` so floors sharing a material but in different
  // chunks get their own merged mesh — flat floors clip cleanly at chunk
  // boundaries without visible artifacts.
  type ChunkMergeEntry = {
    chunk: Chunk;
    material: THREE.MeshStandardMaterial;
    geos: THREE.BufferGeometry[];
  };
  const floorChunkMerge = new Map<string, ChunkMergeEntry>();

  // Walls use a GLOBAL per-material merge group (no chunking).
  // Reason: extruding a clipped wall polygon creates new vertical side
  // faces along the chunk boundary, which protrude visibly in circular
  // rooms. Walls are usually short (mostly fit in one chunk) and merge
  // into ~5 meshes total anyway, so the chunk-cull benefit is marginal.
  // Three.js's per-mesh frustum cull still skips the merged wall meshes
  // when their bounding sphere is fully outside the camera frustum.
  const wallGlobalMerge = new Map<string, THREE.BufferGeometry[]>();

  const matKey = (color: string | undefined, textureId: string | undefined, useReliefMap: boolean): string =>
    `${color ?? ''}|${textureId ?? ''}|${useReliefMap ? 1 : 0}`;

  const getFloorMaterial = (color: string | undefined, textureId: string | undefined, useReliefMap: boolean): THREE.MeshStandardMaterial => {
    const key = matKey(color, textureId, useReliefMap);
    let mat = floorMaterialCache.get(key);
    if (mat) return mat;
    mat = makeSurfaceMat(color, textureId);
    applyLaserLightToMaterial(mat);
    const normalMap = TextureManager.getNormal(textureId, useReliefMap);
    mat.normalMap = DEBUG_SHOW_NORMAL_AS_ALBEDO ? null : normalMap;
    mat.bumpMap = TextureManager.getBump(textureId, useReliefMap);
    if (useReliefMap) {
      mat.normalScale = new THREE.Vector2(0.6, 0.6);
      mat.bumpScale = 0.1;
    }
    floorMaterialCache.set(key, mat);
    return mat;
  };

  const getWallMaterial = (poly: LevelPolygon): THREE.MeshStandardMaterial => {
    const useRelief = !!poly.useReliefMap;
    const key = matKey(poly.color, poly.textureId, useRelief);
    let mat = wallMaterialCache.get(key);
    if (mat) return mat;
    const hasTexture = Boolean(poly.textureId);
    const normalMap = TextureManager.getNormal(poly.textureId, useRelief);
    const bumpMap = TextureManager.getBump(poly.textureId, useRelief);
    const map = DEBUG_SHOW_NORMAL_AS_ALBEDO && normalMap ? normalMap : TextureManager.get(poly.textureId);
    mat = new THREE.MeshStandardMaterial({
      color: hasTexture ? 0xffffff : getSurfaceColor(poly.color, WALL_COLOR, hasTexture),
      map,
      normalMap: DEBUG_SHOW_NORMAL_AS_ALBEDO ? null : normalMap,
      bumpMap,
      emissive: hasTexture ? 0x000000 : new THREE.Color(WALL_EMISSIVE),
      roughness: 0.4,
      metalness: 0.6,
    });
    if (useRelief) {
      mat.normalScale = new THREE.Vector2(0.9, 0.9);
      mat.bumpScale = 0.16;
    }
    wallMaterialCache.set(key, mat);
    return mat;
  };

  /** Convert level vertices into the ClipVec2 array the clipper expects. */
  const polyToClipPoints = (vertices: ReadonlyArray<{ x: number; y: number }>): ClipVec2[] => {
    const out: ClipVec2[] = new Array(vertices.length);
    for (let i = 0; i < vertices.length; i++) {
      out[i] = { x: vertices[i].x, y: vertices[i].y };
    }
    return out;
  };

  /** Build a Shape from already-clipped outer vertices. Holes are clipped
   *  against the same chunk rect; degenerate (zero-area) results dropped. */
  const buildShapeFromClipped = (
    outer: ClipVec2[],
    holes: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>> | undefined,
    clipRect: Rect,
  ): THREE.Shape | null => {
    if (outer.length < 3 || polygonAreaAbs(outer) < 0.001) return null;
    const shape = new THREE.Shape();
    shape.moveTo(outer[0].x, outer[0].y);
    for (let i = 1; i < outer.length; i++) {
      shape.lineTo(outer[i].x, outer[i].y);
    }
    shape.closePath();
    if (holes) {
      for (const hole of holes) {
        const clippedHole = clipPolygonToRect(polyToClipPoints(hole), clipRect);
        if (clippedHole.length < 3 || polygonAreaAbs(clippedHole) < 0.001) continue;
        const holePath = new THREE.Path();
        holePath.moveTo(clippedHole[0].x, clippedHole[0].y);
        for (let i = 1; i < clippedHole.length; i++) {
          holePath.lineTo(clippedHole[i].x, clippedHole[i].y);
        }
        holePath.closePath();
        shape.holes.push(holePath);
      }
    }
    return shape;
  };

  const pushChunkGeo = (
    bucket: Map<string, ChunkMergeEntry>,
    chunk: Chunk,
    material: THREE.MeshStandardMaterial,
    matKeyStr: string,
    geo: THREE.BufferGeometry,
  ): void => {
    const fullKey = `${chunk.key}|${matKeyStr}`;
    let entry = bucket.get(fullKey);
    if (!entry) {
      entry = { chunk, material, geos: [] };
      bucket.set(fullKey, entry);
    }
    entry.geos.push(geo);
  };

  // ─── Floor geometry ───────────────────────────────────────────────────────
  if (floorPolys.length > 0) {
    for (const poly of floorPolys) {
      if (isLavaSurface(poly)) {
        // Animated lava material can't merge — keep as its own mesh at scene root.
        const shape = makeShapeFromPolygon(poly);
        const floorGeo = new THREE.ShapeGeometry(shape);
        const mesh = new THREE.Mesh(floorGeo, createLavaMaterial());
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.02;
        mesh.receiveShadow = true;
        addArenaRoot(scene, mesh);

        zones.push({
          vertices: poly.vertices.map((v) => ({ x: v.x, z: lvZ(v.y) })),
          holes: (poly.holes ?? []).map((hole) => hole.map((v) => ({ x: v.x, z: lvZ(v.y) }))),
          drainRate: getDrainRate(poly),
        });
        registerLavaRegion(buildLavaRegionFromPolygon(poly));
        registerLavaEmitter(poly);
        addLavaLight(scene, poly);
        continue;
      }

      // Non-lava: clip the floor against every chunk it overlaps so each
      // chunk only owns the slice of geometry that physically lives in it.
      const polyPoints = polyToClipPoints(poly.vertices);
      const bbox = polygonBbox(polyPoints);
      if (!bbox) continue;
      // Convert level Y range to world Z range (lvZ(y) = -y).
      const chunks = getChunksOverlappingBbox(bbox.minX, -bbox.maxY, bbox.maxX, -bbox.minY);
      if (chunks.length === 0) continue;

      const useRelief = !!poly.useReliefMap;
      const mat = getFloorMaterial(poly.color, poly.textureId, useRelief);
      const matKeyStr = matKey(poly.color, poly.textureId, useRelief);
      const textureScale = getTextureScale(poly.textureId, poly.textureScale);

      if (chunks.length === 1) {
        // Fast path: poly fits in a single chunk, no clipping needed.
        const shape = makeShapeFromPolygon(poly);
        const geo = new THREE.ShapeGeometry(shape);
        if (textureScale) applyWorldUVs(geo, textureScale);
        geo.rotateX(-Math.PI / 2);
        pushChunkGeo(floorChunkMerge, chunks[0], mat, matKeyStr, geo);
        continue;
      }

      // Slow path: clip per chunk and emit one geometry per non-empty piece.
      for (const chunk of chunks) {
        const clipped = clipPolygonToRect(polyPoints, chunk.clipRectLevel);
        const clipShape = buildShapeFromClipped(clipped, poly.holes, chunk.clipRectLevel);
        if (!clipShape) continue;
        const geo = new THREE.ShapeGeometry(clipShape);
        if (textureScale) applyWorldUVs(geo, textureScale);
        geo.rotateX(-Math.PI / 2);
        pushChunkGeo(floorChunkMerge, chunk, mat, matKeyStr, geo);
      }
    }
  }

  if (floorCircles.length > 0) {
    for (const c of floorCircles) {
      const radius = Math.max(0.01, c.radius - CIRCLE_FLOOR_INSET);
      const cz = lvZ(c.center.y);
      const chunks = getChunksOverlappingBbox(
        c.center.x - radius, cz - radius,
        c.center.x + radius, cz + radius,
      );
      if (chunks.length === 0) continue;

      const useRelief = !!c.useReliefMap;
      const mat = getFloorMaterial(c.color, c.textureId, useRelief);
      const matKeyStr = matKey(c.color, c.textureId, useRelief);
      const textureScale = getTextureScale(c.textureId, c.textureScale);

      if (chunks.length === 1) {
        // Fast path: smooth CircleGeometry centered, then translated to
        // its world position (baked into the geometry).
        const floorGeo = new THREE.CircleGeometry(radius, CIRCLE_FLOOR_SEGMENTS);
        if (textureScale) applyWorldUVs(floorGeo, textureScale, c.center.x, c.center.y);
        floorGeo.rotateX(-Math.PI / 2);
        floorGeo.translate(c.center.x, 0, cz);
        pushChunkGeo(floorChunkMerge, chunks[0], mat, matKeyStr, floorGeo);
        continue;
      }

      // Slow path: tessellate the circle (in level coords) and clip it per
      // chunk. The tessellation hides the chunk-boundary cuts at typical
      // viewing distance.
      const tess = circleToPolygon(c.center.x, c.center.y, radius, CIRCLE_FLOOR_SEGMENTS);
      for (const chunk of chunks) {
        const clipped = clipPolygonToRect(tess, chunk.clipRectLevel);
        const clipShape = buildShapeFromClipped(clipped, undefined, chunk.clipRectLevel);
        if (!clipShape) continue;
        const geo = new THREE.ShapeGeometry(clipShape);
        if (textureScale) applyWorldUVs(geo, textureScale);
        geo.rotateX(-Math.PI / 2);
        pushChunkGeo(floorChunkMerge, chunk, mat, matKeyStr, geo);
      }
    }
  }

  if (floorPolys.length === 0 && floorCircles.length === 0) {
    // v1 fallback: bounding-box rectangle floor from all polygon vertices
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of polys) for (const v of p.vertices) {
      const z = lvZ(v.y);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    if (!isFinite(minX)) { minX = -20; maxX = 20; minZ = -20; maxZ = 20; }
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
      makeSurfaceMat(),
    );
    applyLaserLightToMaterial(mesh.material as THREE.MeshStandardMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    mesh.receiveShadow = true;
    addArenaRoot(scene, mesh);
  }

  // ─── Walls from layer='wall' polygons ────────────────────────────────────
  for (const poly of wallPolys) {
    const invisible = isInvisibleWall(poly);
    const mirror = isMirrorWall(poly);

    // Collision: one segment per edge (always, even for invisible walls)
    const verts = poly.vertices;
    for (let i = 0; i < verts.length; i++) {
      const p1 = verts[i], p2 = verts[(i + 1) % verts.length];
      walls.push({
        p1: { x: p1.x, z: lvZ(p1.y) },
        p2: { x: p2.x, z: lvZ(p2.y) },
        reflective: mirror,
      });
    }
    if (invisible) continue;

    if (mirror) {
      // Mirror walls have unique uniforms (sceneTexture etc.) — keep as
      // individual meshes with their own shader material.
      const normalMap = TextureManager.getNormal(poly.textureId, poly.useReliefMap);
      const wallMat = createMirrorWallMaterial(poly, DEBUG_SHOW_NORMAL_AS_ALBEDO ? null : normalMap);
      const wallMesh = extrudeWallPoly(poly, wallMat);
      registerRefractionMesh(wallMesh);
      addArenaRoot(scene, wallMesh);
      continue;
    }

    // Non-mirror: build the unclipped wall extrusion and push to the global
    // per-material merge group. We don't clip walls because extruding a
    // clipped polygon creates new vertical side faces along the cut edge,
    // which protrude visibly in circular rooms.
    getWallMaterial(poly);
    const useRelief = !!poly.useReliefMap;
    const matKeyStr = matKey(poly.color, poly.textureId, useRelief);
    const textureScale = getTextureScale(poly.textureId, poly.textureScale);
    const shape = makeShapeFromPolygon(poly);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_HEIGHT, bevelEnabled: false });
    if (textureScale) applyWallExtrusionUVs(geo, textureScale);
    geo.rotateX(-Math.PI / 2);

    let arr = wallGlobalMerge.get(matKeyStr);
    if (!arr) { arr = []; wallGlobalMerge.set(matKeyStr, arr); }
    arr.push(geo);
  }

  // ─── Emit merged meshes into their chunks ────────────────────────────────
  // Each merged mesh is parented to a chunk root (not the scene root) so
  // its draw call + traversal cost vanishes when the chunk is hidden.
  // We mark each merged mesh as fully static — its geometry is in world
  // coords, its parent chunk has identity transform, so its matrixWorld is
  // identity and never needs recomputing.
  const finishStaticMesh = (mesh: THREE.Mesh, chunk: Chunk): void => {
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    addToChunk(chunk, mesh);
    mesh.updateMatrixWorld(true);
    mesh.matrixWorldAutoUpdate = false;
  };

  for (const entry of floorChunkMerge.values()) {
    if (entry.geos.length === 0) continue;
    const merged = mergeGeometries(entry.geos);
    if (!merged) {
      console.warn(`[arena] floor merge failed for chunk=${entry.chunk.key} (attribute mismatch)`);
      continue;
    }
    const mesh = new THREE.Mesh(merged, entry.material);
    mesh.receiveShadow = true;
    finishStaticMesh(mesh, entry.chunk);
    for (const geo of entry.geos) geo.dispose();
  }
  // Walls: globally merged by material, parented to the scene root via
  // addArenaRoot. addArenaRoot already locks matrices for static objects.
  for (const [key, geos] of wallGlobalMerge) {
    if (geos.length === 0) continue;
    const merged = mergeGeometries(geos);
    if (!merged) {
      console.warn(`[arena] wall merge failed for matKey=${key} (attribute mismatch)`);
      continue;
    }
    const mesh = new THREE.Mesh(merged, wallMaterialCache.get(key)!);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addArenaRoot(scene, mesh);
    for (const geo of geos) geo.dispose();
  }
}
