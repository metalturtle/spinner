import * as THREE from 'three';
import { LevelData } from '../data/LevelData';
import type { PolygonData } from '../data/Polygon';
import { LAYER_Z } from '../data/Polygon';
import { applyWorldUVs, getTextureScale, TextureManager } from './TextureManager';

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

export class PolygonRenderer {
  private scene: THREE.Scene;
  private levelData: LevelData;
  private groups = new Map<string, THREE.Group>();
  private lightingPreviewEnabled = false;

  constructor(scene: THREE.Scene, levelData: LevelData) {
    this.scene = scene;
    this.levelData = levelData;

    levelData.on('polygon-added', (poly: PolygonData) => this.addPolygonMesh(poly));
    levelData.on('polygon-removed', (poly: PolygonData) => this.removePolygonMesh(poly.id));
    levelData.on('polygon-changed', (poly: PolygonData) => this.updatePolygonMesh(poly));
    levelData.on('level-loaded', () => this.rebuildAll());
  }

  setLightingPreviewEnabled(enabled: boolean): void {
    if (this.lightingPreviewEnabled === enabled) return;
    this.lightingPreviewEnabled = enabled;
    this.rebuildAll();
  }

  private addPolygonMesh(poly: PolygonData): void {
    if (poly.vertices.length < 3) return;

    const group = new THREE.Group();
    group.position.z = LAYER_Z[poly.layer] ?? 1;
    group.userData = { type: 'polygon', id: poly.id };

    this.buildGeometry(group, poly);
    this.groups.set(poly.id, group);
    this.scene.add(group);
  }

  private buildGeometry(group: THREE.Group, poly: PolygonData): void {
    // Clear existing children
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh | THREE.LineLoop;
      child.geometry.dispose();
      if ('material' in child && child.material instanceof THREE.Material) {
        child.material.dispose();
      }
      group.remove(child);
    }

    const hasTexture = Boolean(poly.textureId);
    const color = getSurfaceColor(poly.color, hasTexture, this.lightingPreviewEnabled);

    // Fill mesh
    const shape = new THREE.Shape();
    shape.moveTo(poly.vertices[0].x, poly.vertices[0].y);
    for (let i = 1; i < poly.vertices.length; i++) {
      shape.lineTo(poly.vertices[i].x, poly.vertices[i].y);
    }
    shape.closePath();

    for (const hole of poly.holes ?? []) {
      if (hole.length < 3) continue;
      const holePath = new THREE.Path();
      holePath.moveTo(hole[0].x, hole[0].y);
      for (let i = 1; i < hole.length; i++) {
        holePath.lineTo(hole[i].x, hole[i].y);
      }
      holePath.closePath();
      shape.holes.push(holePath);
    }

    const fillGeo = new THREE.ShapeGeometry(shape);
    const textureScale = getTextureScale(poly.textureId, poly.textureScale);
    if (textureScale) {
      applyWorldUVs(fillGeo, textureScale);
    }
    const fillOpacity = getSurfaceOpacity(poly.layer, hasTexture, this.lightingPreviewEnabled);
    const fillMat = this.lightingPreviewEnabled
      ? new THREE.MeshStandardMaterial({
          color,
          map: TextureManager.get(poly.textureId),
          transparent: fillOpacity < 1,
          opacity: fillOpacity,
          side: THREE.DoubleSide,
          roughness: 0.82,
          metalness: 0.04,
          depthTest: false,
        })
      : new THREE.MeshBasicMaterial({
          color,
          map: TextureManager.get(poly.textureId),
          transparent: true,
          opacity: fillOpacity,
          side: THREE.DoubleSide,
          depthTest: false,
        });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.userData = { type: 'polygon', id: poly.id };
    group.add(fillMesh);

    // Outline
    const points = poly.vertices.map((v) => new THREE.Vector3(v.x, v.y, 0));
    points.push(points[0].clone());
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color, depthTest: false });
    const line = new THREE.LineLoop(lineGeo, lineMat);
    line.userData = { type: 'polygon', id: poly.id };
    group.add(line);

    for (const hole of poly.holes ?? []) {
      if (hole.length < 3) continue;
      const holePoints = hole.map((v) => new THREE.Vector3(v.x, v.y, 0));
      holePoints.push(holePoints[0].clone());
      const holeGeo = new THREE.BufferGeometry().setFromPoints(holePoints);
      const holeLine = new THREE.LineLoop(holeGeo, new THREE.LineBasicMaterial({ color, depthTest: false }));
      holeLine.userData = { type: 'polygon', id: poly.id };
      group.add(holeLine);
    }
  }

  private removePolygonMesh(id: string): void {
    const group = this.groups.get(id);
    if (!group) return;
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh;
      child.geometry.dispose();
      if (child.material instanceof THREE.Material) child.material.dispose();
      group.remove(child);
    }
    this.scene.remove(group);
    this.groups.delete(id);
  }

  private updatePolygonMesh(poly: PolygonData): void {
    const group = this.groups.get(poly.id);
    if (!group) {
      this.addPolygonMesh(poly);
      return;
    }
    this.buildGeometry(group, poly);
  }

  private rebuildAll(): void {
    // Remove all existing
    for (const id of this.groups.keys()) {
      this.removePolygonMesh(id);
    }
    // Add all from data
    for (const poly of this.levelData.polygons) {
      this.addPolygonMesh(poly);
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
