import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { WALL_HEIGHT } from './constants';
import { walls, zones } from './physics';
import type { LevelData } from './levelLoader';

const diffuseUrl = new URL('../textures/rock_wall_16_diff_1k.jpg', import.meta.url).href;
const normalUrl  = new URL('../textures/rock_wall_16_nor_gl_1k.exr', import.meta.url).href;
const roughUrl   = new URL('../textures/rock_wall_16_rough_1k.exr', import.meta.url).href;

const WALL_COLOR    = 0x0f3460;
const WALL_EMISSIVE = 0x051030;
const FLOOR_COLOR   = 0x445566;
const TILE          = 3;

function extrudeWallPoly(vertices: { x: number; y: number }[], mat: THREE.MeshStandardMaterial): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(vertices[0].x, -vertices[0].y);
  for (let i = 1; i < vertices.length; i++) shape.lineTo(vertices[i].x, -vertices[i].y);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_HEIGHT, bevelEnabled: false });
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

  // ─── Async texture loading — applied to all floor materials once loaded ───
  const floorMats: THREE.MeshStandardMaterial[] = [];
  const texLoader = new THREE.TextureLoader();
  const exrLoader = new EXRLoader();

  const applyRepeat = (tex: THREE.Texture) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(TILE, TILE);
    return tex;
  };

  texLoader.load(diffuseUrl, tex => {
    applyRepeat(tex);
    for (const m of floorMats) { m.map = tex; m.needsUpdate = true; }
  });
  exrLoader.load(normalUrl, tex => {
    applyRepeat(tex);
    for (const m of floorMats) { m.normalMap = tex; m.normalScale.set(0.8, 0.8); m.needsUpdate = true; }
  });
  exrLoader.load(roughUrl, tex => {
    applyRepeat(tex);
    for (const m of floorMats) { m.roughnessMap = tex; m.needsUpdate = true; }
  });

  function makeFloorMat(color?: string): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      color: color ? new THREE.Color(color) : FLOOR_COLOR,
      roughness: 0.85,
      metalness: 0.05,
    });
    floorMats.push(mat);
    return mat;
  }

  // ─── Floor geometry ───────────────────────────────────────────────────────
  if (floorPolys.length > 0) {
    // Polygon floor: ShapeGeometry in XY plane, rotated flat into XZ
    for (const poly of floorPolys) {
      const shape = new THREE.Shape();
      shape.moveTo(poly.vertices[0].x, -poly.vertices[0].y);
      for (let i = 1; i < poly.vertices.length; i++) {
        shape.lineTo(poly.vertices[i].x, -poly.vertices[i].y);
      }
      shape.closePath();
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), makeFloorMat(poly.color));
      mesh.rotation.x = -Math.PI / 2;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  } else if (floorCircles.length > 0) {
    // Circle floor: CircleGeometry centered at circle.center
    for (const c of floorCircles) {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(c.radius, 64),
        makeFloorMat(c.color),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(c.center.x, 0, c.center.y);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  } else {
    // v1 fallback: bounding-box rectangle floor from all polygon vertices
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of polys) for (const v of p.vertices) {
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minZ = Math.min(minZ, v.y); maxZ = Math.max(maxZ, v.y);
    }
    if (!isFinite(minX)) { minX = -20; maxX = 20; minZ = -20; maxZ = 20; }
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
      makeFloorMat(),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // ─── Walls from layer='wall' polygons ────────────────────────────────────
  for (const poly of wallPolys) {
    const wallMat = new THREE.MeshStandardMaterial({
      color: poly.color ? new THREE.Color(poly.color) : WALL_COLOR,
      emissive: new THREE.Color(WALL_EMISSIVE),
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
    scene.add(extrudeWallPoly(poly.vertices, wallMat));
  }

  // ─── Water Zone (placed in corner of wall polygon bounds) ────────────────
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of wallPolys) for (const v of p.vertices) {
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minZ = Math.min(minZ, v.y); maxZ = Math.max(maxZ, v.y);
  }
  if (!isFinite(minX)) { minX = -20; maxX = 20; minZ = -20; maxZ = 20; }

  const waterW = 12, waterH = 12;
  const waterCX = maxX - waterW / 2 - 2;
  const waterCZ = minZ + waterH / 2 + 2;

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(waterW, waterH),
    new THREE.MeshStandardMaterial({ color: 0x0055cc, transparent: true, opacity: 0.45, roughness: 0.1 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(waterCX, 0.02, waterCZ);
  scene.add(water);

  zones.push({
    minX: waterCX - waterW / 2, maxX: waterCX + waterW / 2,
    minZ: waterCZ - waterH / 2, maxZ: waterCZ + waterH / 2,
    drainRate: 8.0,
  });
}
