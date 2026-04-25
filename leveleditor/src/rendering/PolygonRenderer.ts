import * as THREE from 'three';
import { LevelData } from '../data/LevelData';
import type { PolygonData } from '../data/Polygon';
import { LAYER_Z } from '../data/Polygon';

export class PolygonRenderer {
  private scene: THREE.Scene;
  private levelData: LevelData;
  private groups = new Map<string, THREE.Group>();

  constructor(scene: THREE.Scene, levelData: LevelData) {
    this.scene = scene;
    this.levelData = levelData;

    levelData.on('polygon-added', (poly: PolygonData) => this.addPolygonMesh(poly));
    levelData.on('polygon-removed', (poly: PolygonData) => this.removePolygonMesh(poly.id));
    levelData.on('polygon-changed', (poly: PolygonData) => this.updatePolygonMesh(poly));
    levelData.on('level-loaded', () => this.rebuildAll());
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

    const color = new THREE.Color(poly.color);

    // Fill mesh
    const shape = new THREE.Shape();
    shape.moveTo(poly.vertices[0].x, poly.vertices[0].y);
    for (let i = 1; i < poly.vertices.length; i++) {
      shape.lineTo(poly.vertices[i].x, poly.vertices[i].y);
    }

    const fillGeo = new THREE.ShapeGeometry(shape);
    const fillOpacity = poly.layer === 'floor' ? 0.35 : 0.2;
    const fillMat = new THREE.MeshBasicMaterial({
      color,
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
