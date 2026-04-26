import * as THREE from 'three';
import { LevelData } from '../data/LevelData';
import type { CircleData } from '../data/Circle';
import { LAYER_Z } from '../data/Polygon';
import { applyWorldUVs, getTextureScale, TextureManager } from './TextureManager';

const CIRCLE_SEGMENTS = 48;
const DEBUG_SHOW_NORMAL_AS_ALBEDO = false;

function getSurfaceColor(colorHex: string, hasTexture: boolean, lightingPreviewEnabled: boolean): THREE.Color {
  const authoredColor = new THREE.Color(colorHex);
  if (!hasTexture) return authoredColor;
  if (!lightingPreviewEnabled) return authoredColor;
  return new THREE.Color(0xffffff).lerp(authoredColor, 0.18);
}

function getSurfaceOpacity(layer: string, hasTexture: boolean, lightingPreviewEnabled: boolean): number {
  if (hasTexture && lightingPreviewEnabled) return 1;
  return layer === 'floor' ? 0.35 : 0.2;
}

export class CircleRenderer {
  private scene: THREE.Scene;
  private levelData: LevelData;
  private groups = new Map<string, THREE.Group>();
  private lightingPreviewEnabled = false;

  constructor(scene: THREE.Scene, levelData: LevelData) {
    this.scene = scene;
    this.levelData = levelData;

    levelData.on('circle-added', (c: CircleData) => this.addCircleMesh(c));
    levelData.on('circle-removed', (c: CircleData) => this.removeCircleMesh(c.id));
    levelData.on('circle-changed', (c: CircleData) => this.updateCircleMesh(c));
    levelData.on('level-loaded', () => this.rebuildAll());
  }

  setLightingPreviewEnabled(enabled: boolean): void {
    if (this.lightingPreviewEnabled === enabled) return;
    this.lightingPreviewEnabled = enabled;
    this.rebuildAll();
  }

  private addCircleMesh(circle: CircleData): void {
    const group = new THREE.Group();
    group.position.z = LAYER_Z[circle.layer] ?? 1;
    group.userData = { type: 'circle', id: circle.id };
    this.buildGeometry(group, circle);
    this.groups.set(circle.id, group);
    this.scene.add(group);
  }

  private buildGeometry(group: THREE.Group, circle: CircleData): void {
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      if (child.material instanceof THREE.Material) child.material.dispose();
      group.remove(child);
    }

    const hasTexture = Boolean(circle.textureId);
    const color = getSurfaceColor(circle.color, hasTexture, this.lightingPreviewEnabled);
    const fillOpacity = getSurfaceOpacity(circle.layer, hasTexture, this.lightingPreviewEnabled);

    // Fill
    const fillGeo = new THREE.CircleGeometry(circle.radius, CIRCLE_SEGMENTS);
    const textureScale = getTextureScale(circle.textureId, circle.textureScale);
    if (textureScale) {
      applyWorldUVs(fillGeo, textureScale, circle.center.x, circle.center.y);
    }
    const reliefEnabled = Boolean(circle.useReliefMap);
    const normalMap = TextureManager.getNormal(circle.textureId, reliefEnabled || DEBUG_SHOW_NORMAL_AS_ALBEDO);
    const baseMap = TextureManager.get(circle.textureId);
    const debugMap = DEBUG_SHOW_NORMAL_AS_ALBEDO && normalMap ? normalMap : null;
    const fillMat = this.lightingPreviewEnabled
      ? new THREE.MeshStandardMaterial({
          color,
          map: debugMap ?? baseMap,
          normalMap: DEBUG_SHOW_NORMAL_AS_ALBEDO ? null : normalMap,
          bumpMap: DEBUG_SHOW_NORMAL_AS_ALBEDO ? null : TextureManager.getBump(circle.textureId, reliefEnabled),
          normalScale: reliefEnabled ? new THREE.Vector2(0.7, 0.7) : undefined,
          bumpScale: reliefEnabled ? 0.12 : undefined,
          transparent: fillOpacity < 1,
          opacity: fillOpacity,
          side: THREE.DoubleSide,
          roughness: 0.82,
          metalness: 0.04,
          depthTest: false,
        })
      : new THREE.MeshBasicMaterial({
          color,
          map: TextureManager.get(circle.textureId),
          transparent: true,
          opacity: fillOpacity,
          side: THREE.DoubleSide,
          depthTest: false,
        });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.position.set(circle.center.x, circle.center.y, 0);
    fillMesh.userData = { type: 'circle', id: circle.id };
    group.add(fillMesh);

    // Outline
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
      const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      points.push(new THREE.Vector3(
        circle.center.x + Math.cos(angle) * circle.radius,
        circle.center.y + Math.sin(angle) * circle.radius,
        0
      ));
    }
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color, depthTest: false });
    const line = new THREE.Line(lineGeo, lineMat);
    line.userData = { type: 'circle', id: circle.id };
    group.add(line);
  }

  private removeCircleMesh(id: string): void {
    const group = this.groups.get(id);
    if (!group) return;
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      if (child.material instanceof THREE.Material) child.material.dispose();
      group.remove(child);
    }
    this.scene.remove(group);
    this.groups.delete(id);
  }

  private updateCircleMesh(circle: CircleData): void {
    const group = this.groups.get(circle.id);
    if (!group) {
      this.addCircleMesh(circle);
      return;
    }
    group.position.z = LAYER_Z[circle.layer] ?? 1;
    this.buildGeometry(group, circle);
  }

  private rebuildAll(): void {
    for (const id of this.groups.keys()) {
      this.removeCircleMesh(id);
    }
    for (const circle of this.levelData.circles) {
      this.addCircleMesh(circle);
    }
  }

  getMeshesForRaycast(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [];
    for (const group of this.groups.values()) {
      for (const child of group.children) {
        if (child instanceof THREE.Mesh) {
          meshes.push(child);
        }
      }
    }
    return meshes;
  }
}
