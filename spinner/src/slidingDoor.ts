import * as THREE from 'three';
import { WALL_HEIGHT, WALL_THICKNESS } from './constants';
import { type Segment, type Vec2, walls } from './physics';
import { scene } from './renderer';
import { nextEntityId } from './systems';
import { TextureManager } from './textureUtils';

const DOOR_TEXTURE_ID = 'sci-fi';
// Tile sci-fi panels: roughly one tile per 1.4 world units across the leaf and height.
const DOOR_TEXTURE_WORLD_SCALE = 1.4;
const DOOR_COLOR = 0xa8b2c0;
const DOOR_EMISSIVE = 0x1a2233;
const OPEN_EPSILON = 0.001;

export interface SlidingDoorConfig {
  rotationDeg: number;
  width: number;
  height: number;
  thickness: number;
  slideDistance: number;
  openSpeed: number;
  startOpen: boolean;
  encounterId: string | null;
  closeTriggerId: string | null;
}

export interface SlidingDoorState {
  id: number;
  root: THREE.Group;
  leftPanel: THREE.Mesh;
  rightPanel: THREE.Mesh;
  origin: Vec2;
  dir: Vec2;
  width: number;
  leafWidth: number;
  leafHalfWidth: number;
  centerBase: number;
  slideDistance: number;
  openSpeed: number;
  openFrac: number;
  targetOpenFrac: number;
  encounterId: string | null;
  closeTriggerId: string | null;
  leftSegment: Segment;
  rightSegment: Segment;
}

function makeTiledDoorTexture(source: THREE.Texture | null, leafWidth: number, height: number): THREE.Texture | null {
  if (!source) return null;
  // Clone so per-door .repeat doesn't bleed into other consumers of this shared texture.
  const tex = source.clone();
  tex.needsUpdate = true;
  tex.repeat.set(leafWidth / DOOR_TEXTURE_WORLD_SCALE, height / DOOR_TEXTURE_WORLD_SCALE);
  return tex;
}

function makeDoorMaterial(leafWidth: number, height: number): THREE.MeshStandardMaterial {
  const baseMap = makeTiledDoorTexture(TextureManager.get(DOOR_TEXTURE_ID), leafWidth, height);
  const normalMap = makeTiledDoorTexture(TextureManager.getNormal(DOOR_TEXTURE_ID, true), leafWidth, height);

  const material = new THREE.MeshStandardMaterial({
    color: DOOR_COLOR,
    emissive: new THREE.Color(DOOR_EMISSIVE),
    roughness: 0.34,
    metalness: 0.72,
  });
  if (baseMap) material.map = baseMap;
  if (normalMap) {
    material.normalMap = normalMap;
    material.normalScale = new THREE.Vector2(0.6, 0.6);
  }
  return material;
}

function toWorldPoint(door: SlidingDoorState, localX: number): Vec2 {
  return {
    x: door.origin.x + door.dir.x * localX,
    z: door.origin.z + door.dir.z * localX,
  };
}

function syncSegments(door: SlidingDoorState): void {
  const travel = door.slideDistance * door.openFrac;
  const leftCenter = -door.centerBase - travel;
  const rightCenter = door.centerBase + travel;

  const leftStart = toWorldPoint(door, leftCenter - door.leafHalfWidth);
  const leftEnd = toWorldPoint(door, leftCenter + door.leafHalfWidth);
  const rightStart = toWorldPoint(door, rightCenter - door.leafHalfWidth);
  const rightEnd = toWorldPoint(door, rightCenter + door.leafHalfWidth);

  door.leftSegment.p1.x = leftStart.x;
  door.leftSegment.p1.z = leftStart.z;
  door.leftSegment.p2.x = leftEnd.x;
  door.leftSegment.p2.z = leftEnd.z;

  door.rightSegment.p1.x = rightStart.x;
  door.rightSegment.p1.z = rightStart.z;
  door.rightSegment.p2.x = rightEnd.x;
  door.rightSegment.p2.z = rightEnd.z;

  door.leftPanel.position.x = leftCenter;
  door.rightPanel.position.x = rightCenter;
}

export function createSlidingDoor(pos: Vec2, config: SlidingDoorConfig): SlidingDoorState {
  const width = Math.max(1.5, config.width);
  const height = Math.max(0.8, config.height);
  const thickness = Math.max(0.12, config.thickness);
  const leafWidth = width * 0.5;
  const leafHalfWidth = leafWidth * 0.5;
  const centerBase = leafHalfWidth;
  const openFrac = config.startOpen ? 1 : 0;
  const angleRad = (config.rotationDeg * Math.PI) / 180;
  const dir = { x: Math.cos(angleRad), z: Math.sin(angleRad) };

  const root = new THREE.Group();
  root.position.set(pos.x, 0, pos.z);
  root.rotation.y = -angleRad;

  const panelGeo = new THREE.BoxGeometry(leafWidth, height, thickness);
  const leftPanel = new THREE.Mesh(panelGeo, makeDoorMaterial(leafWidth, height));
  const rightPanel = new THREE.Mesh(panelGeo.clone(), makeDoorMaterial(leafWidth, height));
  leftPanel.position.y = height * 0.5;
  rightPanel.position.y = height * 0.5;
  leftPanel.castShadow = true;
  leftPanel.receiveShadow = true;
  rightPanel.castShadow = true;
  rightPanel.receiveShadow = true;
  root.add(leftPanel);
  root.add(rightPanel);
  scene.add(root);

  const leftSegment: Segment = {
    p1: { x: pos.x, z: pos.z },
    p2: { x: pos.x, z: pos.z },
  };
  const rightSegment: Segment = {
    p1: { x: pos.x, z: pos.z },
    p2: { x: pos.x, z: pos.z },
  };
  walls.push(leftSegment, rightSegment);

  const door: SlidingDoorState = {
    id: nextEntityId(),
    root,
    leftPanel,
    rightPanel,
    origin: { x: pos.x, z: pos.z },
    dir,
    width,
    leafWidth,
    leafHalfWidth,
    centerBase,
    slideDistance: Math.max(0, config.slideDistance),
    openSpeed: Math.max(0.1, config.openSpeed),
    openFrac,
    targetOpenFrac: openFrac,
    encounterId: config.encounterId,
    closeTriggerId: config.closeTriggerId,
    leftSegment,
    rightSegment,
  };

  syncSegments(door);
  return door;
}

export function setSlidingDoorOpen(door: SlidingDoorState, open: boolean): void {
  door.targetOpenFrac = open ? 1 : 0;
}

export function updateSlidingDoor(door: SlidingDoorState, delta: number): void {
  const diff = door.targetOpenFrac - door.openFrac;
  if (Math.abs(diff) <= OPEN_EPSILON) {
    if (door.openFrac !== door.targetOpenFrac) {
      door.openFrac = door.targetOpenFrac;
      syncSegments(door);
    }
    return;
  }

  const step = door.openSpeed * delta;
  if (Math.abs(diff) <= step) {
    door.openFrac = door.targetOpenFrac;
  } else {
    door.openFrac += Math.sign(diff) * step;
  }
  syncSegments(door);
}

export function destroySlidingDoor(door: SlidingDoorState): void {
  scene.remove(door.root);
  const leftIdx = walls.indexOf(door.leftSegment);
  if (leftIdx !== -1) walls.splice(leftIdx, 1);
  const rightIdx = walls.indexOf(door.rightSegment);
  if (rightIdx !== -1) walls.splice(rightIdx, 1);

  door.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(material)) {
      for (const entry of material) entry.dispose();
    } else {
      material?.dispose();
    }
  });
}

export function defaultSlidingDoorConfig(
  rotationDeg: number,
  encounterId: string | null,
  closeTriggerId: string | null = null,
): SlidingDoorConfig {
  const width = 5;
  return {
    rotationDeg,
    width,
    height: WALL_HEIGHT + 0.35,
    thickness: WALL_THICKNESS,
    slideDistance: width * 0.4,
    openSpeed: 1.9,
    startOpen: false,
    encounterId,
    closeTriggerId,
  };
}
