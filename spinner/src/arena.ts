import * as THREE from 'three';
import { WALL_HEIGHT } from './constants';
import { walls, zones } from './physics';
import type { LevelData, LevelPolygon } from './levelLoader';
import { createLavaMaterial } from './lavaSurface';
import { applyWallExtrusionUVs, applyWorldUVs, getTextureScale, TextureManager } from './textureUtils';

const WALL_COLOR    = 0x0f3460;
const WALL_EMISSIVE = 0x051030;
const FLOOR_COLOR   = 0x445566;
const CIRCLE_FLOOR_SEGMENTS = 48;
const CIRCLE_FLOOR_INSET = 0.05;

function getSurfaceColor(color: string | undefined, fallback: THREE.ColorRepresentation, hasTexture: boolean): THREE.ColorRepresentation {
  if (!color) return hasTexture ? 0xffffff : fallback;
  if (!hasTexture) return new THREE.Color(color);
  return new THREE.Color(0xffffff).lerp(new THREE.Color(color), 0.18);
}

function makeShapeFromPolygon(poly: LevelPolygon): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(poly.vertices[0].x, -poly.vertices[0].y);
  for (let i = 1; i < poly.vertices.length; i++) shape.lineTo(poly.vertices[i].x, -poly.vertices[i].y);
  shape.closePath();

  for (const hole of poly.holes ?? []) {
    if (hole.length < 3) continue;
    const holePath = new THREE.Path();
    holePath.moveTo(hole[0].x, -hole[0].y);
    for (let i = 1; i < hole.length; i++) holePath.lineTo(hole[i].x, -hole[i].y);
    holePath.closePath();
    shape.holes.push(holePath);
  }

  return shape;
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

function extrudeWallPoly(poly: LevelPolygon, mat: THREE.MeshStandardMaterial): THREE.Mesh {
  const shape = makeShapeFromPolygon(poly);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_HEIGHT, bevelEnabled: false });
  const textureScale = getTextureScale(poly.textureId, poly.textureScale);
  if (textureScale) {
    applyWallExtrusionUVs(geo, textureScale);
  }
  const mesh = new THREE.Mesh(geo, mat);
  // ExtrudeGeometry extrudes along +Z; rotate so it stands upright in XZ world
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createArena(scene: THREE.Scene, level: LevelData): void {
  // ─── Separate polygons and circles by layer ──────────────────────────────
  const polys        = level.polygons ?? [];
  const circs        = level.circles  ?? [];
  // v1 compat: polygons without layer default to 'wall'
  const wallPolys    = polys.filter(p => !p.layer || p.layer === 'wall');
  const floorPolys   = polys.filter(p => p.layer === 'floor');
  const floorCircles = circs.filter(c => !c.layer || c.layer === 'floor');

  function makeSurfaceMat(color?: string, textureId?: string): THREE.MeshStandardMaterial {
    const hasTexture = Boolean(textureId);
    return new THREE.MeshStandardMaterial({
      color: getSurfaceColor(color, FLOOR_COLOR, hasTexture),
      map: TextureManager.get(textureId),
      roughness: 0.85,
      metalness: 0.05,
    });
  }

  // ─── Floor geometry ───────────────────────────────────────────────────────
  if (floorPolys.length > 0) {
    // Polygon floor: ShapeGeometry in XY plane, rotated flat into XZ
    for (const poly of floorPolys) {
      const shape = makeShapeFromPolygon(poly);
      const floorGeo = new THREE.ShapeGeometry(shape);
      const isLava = isLavaSurface(poly);
      const textureScale = !isLava ? getTextureScale(poly.textureId, poly.textureScale) : null;
      if (textureScale && !isLava) {
        applyWorldUVs(floorGeo, textureScale);
      }
      const mesh = new THREE.Mesh(
        floorGeo,
        isLava ? createLavaMaterial() : makeSurfaceMat(poly.color, poly.textureId),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = isLava ? 0.02 : 0;
      mesh.receiveShadow = true;
      scene.add(mesh);

      if (isLava) {
        zones.push({
          vertices: poly.vertices.map((v) => ({ x: v.x, z: v.y })),
          holes: (poly.holes ?? []).map((hole) => hole.map((v) => ({ x: v.x, z: v.y }))),
          drainRate: getDrainRate(poly),
        });
      }
    }
  }

  if (floorCircles.length > 0) {
    // Circle floor: CircleGeometry centered at circle.center
    for (const c of floorCircles) {
      const radius = Math.max(0.01, c.radius - CIRCLE_FLOOR_INSET);
      const floorGeo = new THREE.CircleGeometry(radius, CIRCLE_FLOOR_SEGMENTS);
      const textureScale = getTextureScale(c.textureId, c.textureScale);
      if (textureScale) {
        applyWorldUVs(floorGeo, textureScale, c.center.x, -c.center.y);
      }
      const mesh = new THREE.Mesh(
        floorGeo,
        makeSurfaceMat(c.color, c.textureId),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(c.center.x, 0, c.center.y);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }

  if (floorPolys.length === 0 && floorCircles.length === 0) {
    // v1 fallback: bounding-box rectangle floor from all polygon vertices
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of polys) for (const v of p.vertices) {
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minZ = Math.min(minZ, v.y); maxZ = Math.max(maxZ, v.y);
    }
    if (!isFinite(minX)) { minX = -20; maxX = 20; minZ = -20; maxZ = 20; }
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
      makeSurfaceMat(),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // ─── Walls from layer='wall' polygons ────────────────────────────────────
  for (const poly of wallPolys) {
    const hasTexture = Boolean(poly.textureId);
    const wallMat = new THREE.MeshStandardMaterial({
      color: hasTexture ? 0xffffff : getSurfaceColor(poly.color, WALL_COLOR, hasTexture),
      map: TextureManager.get(poly.textureId),
      emissive: hasTexture ? 0x000000 : new THREE.Color(WALL_EMISSIVE),
      roughness: 0.4,
      metalness: 0.6,
    });
    // Collision: one segment per edge
    const verts = poly.vertices;
    for (let i = 0; i < verts.length; i++) {
      const p1 = verts[i], p2 = verts[(i + 1) % verts.length];
      walls.push({ p1: { x: p1.x, z: p1.y }, p2: { x: p2.x, z: p2.y } });
    }
    // Visual: extrude the whole polygon shape upward (one solid mesh per polygon)
    scene.add(extrudeWallPoly(poly, wallMat));
  }

}
