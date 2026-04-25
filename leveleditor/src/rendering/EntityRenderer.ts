import * as THREE from 'three';
import { LevelData } from '../data/LevelData';
import type { EntityData } from '../data/Entity';

const ENTITY_Z = 2;

const TYPE_COLORS: Record<string, number> = {
  spawn: 0x44ff44,
  trigger: 0xff8844,
  waypoint: 0x4488ff,
};

export class EntityRenderer {
  private scene: THREE.Scene;
  private levelData: LevelData;
  private meshes = new Map<string, THREE.Group>();

  constructor(scene: THREE.Scene, levelData: LevelData) {
    this.scene = scene;
    this.levelData = levelData;

    levelData.on('entity-added', (e: EntityData) => this.addEntityMesh(e));
    levelData.on('entity-removed', (e: EntityData) => this.removeEntityMesh(e.id));
    levelData.on('entity-changed', (e: EntityData) => this.updateEntityMesh(e));
    levelData.on('level-loaded', () => this.rebuildAll());
  }

  private addEntityMesh(entity: EntityData): void {
    const group = new THREE.Group();
    group.position.z = ENTITY_Z;
    group.userData = { type: 'entity', id: entity.id };
    this.buildVisual(group, entity);
    this.meshes.set(entity.id, group);
    this.scene.add(group);
  }

  private buildVisual(group: THREE.Group, entity: EntityData): void {
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      if (child.material instanceof THREE.Material) child.material.dispose();
      group.remove(child);
    }

    const color = TYPE_COLORS[entity.type] ?? 0xcccccc;

    // Diamond marker
    const shape = new THREE.Shape();
    const s = 0.4;
    shape.moveTo(0, s);
    shape.lineTo(s, 0);
    shape.lineTo(0, -s);
    shape.lineTo(-s, 0);
    shape.closePath();

    const geo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(entity.position.x, entity.position.y, 0);
    mesh.userData = { type: 'entity', id: entity.id };
    group.add(mesh);

    // Direction indicator
    const rad = (entity.rotation * Math.PI) / 180;
    const arrowLen = 0.6;
    const arrowGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(entity.position.x, entity.position.y, 0),
      new THREE.Vector3(
        entity.position.x + Math.cos(rad) * arrowLen,
        entity.position.y + Math.sin(rad) * arrowLen,
        0
      ),
    ]);
    const arrowMat = new THREE.LineBasicMaterial({ color, depthTest: false });
    group.add(new THREE.Line(arrowGeo, arrowMat));
  }

  private removeEntityMesh(id: string): void {
    const group = this.meshes.get(id);
    if (!group) return;
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      if (child.material instanceof THREE.Material) child.material.dispose();
      group.remove(child);
    }
    this.scene.remove(group);
    this.meshes.delete(id);
  }

  private updateEntityMesh(entity: EntityData): void {
    const group = this.meshes.get(entity.id);
    if (!group) {
      this.addEntityMesh(entity);
      return;
    }
    this.buildVisual(group, entity);
  }

  private rebuildAll(): void {
    for (const id of this.meshes.keys()) {
      this.removeEntityMesh(id);
    }
    for (const entity of this.levelData.entities) {
      this.addEntityMesh(entity);
    }
  }

  getMeshesForRaycast(): THREE.Object3D[] {
    const result: THREE.Object3D[] = [];
    for (const group of this.meshes.values()) {
      for (const child of group.children) {
        if (child instanceof THREE.Mesh) {
          result.push(child);
        }
      }
    }
    return result;
  }
}
