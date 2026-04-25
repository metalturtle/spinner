import * as THREE from 'three';
import { LevelData } from '../data/LevelData';
import type { EntityData } from '../data/Entity';
import { ENTITY_TYPE_COLORS } from '../data/entityTypes';

const ENTITY_Z = 2;

export class EntityRenderer {
  private scene: THREE.Scene;
  private levelData: LevelData;
  private meshes = new Map<string, THREE.Group>();
  private lightingPreviewEnabled = false;

  constructor(scene: THREE.Scene, levelData: LevelData) {
    this.scene = scene;
    this.levelData = levelData;

    levelData.on('entity-added', (e: EntityData) => this.addEntityMesh(e));
    levelData.on('entity-removed', (e: EntityData) => this.removeEntityMesh(e.id));
    levelData.on('entity-changed', (e: EntityData) => this.updateEntityMesh(e));
    levelData.on('level-loaded', () => this.rebuildAll());
  }

  setLightingPreviewEnabled(enabled: boolean): void {
    if (this.lightingPreviewEnabled === enabled) return;
    this.lightingPreviewEnabled = enabled;
    this.rebuildAll();
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

    const color = ENTITY_TYPE_COLORS[entity.type] ?? 0xcccccc;

    if (entity.type === 'light_point') {
      this.buildLightVisual(group, entity, color);
      return;
    }

    this.buildDefaultVisual(group, entity, color);
  }

  private buildDefaultVisual(group: THREE.Group, entity: EntityData, color: number): void {
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

  private buildLightVisual(group: THREE.Group, entity: EntityData, color: number): void {
    const x = entity.position.x;
    const y = entity.position.y;
    const range = this.readNumber(entity.properties.range, 8, 0.5);
    const intensity = this.readNumber(entity.properties.intensity, 2, 0);
    const lightColor = this.readColor(entity.properties.color, color);

    if (!this.lightingPreviewEnabled) {
      const outerGlow = this.createLightDisc(
        range,
        lightColor,
        Math.min(0.06 + intensity * 0.02, 0.18),
      );
      outerGlow.position.set(x, y, -0.02);
      group.add(outerGlow);

      const midGlow = this.createLightDisc(
        range * 0.55,
        lightColor,
        Math.min(0.10 + intensity * 0.03, 0.24),
      );
      midGlow.position.set(x, y, -0.01);
      group.add(midGlow);
    }

    const glowGeo = new THREE.CircleGeometry(Math.max(0.28, range * 0.08), 28);
    const glowMat = new THREE.MeshBasicMaterial({
      color: lightColor,
      transparent: true,
      opacity: this.lightingPreviewEnabled
        ? Math.min(0.10 + intensity * 0.03, 0.22)
        : Math.min(0.18 + intensity * 0.05, 0.35),
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(x, y, 0);
    glow.userData = { type: 'entity', id: entity.id };
    group.add(glow);

    const coreGeo = new THREE.CircleGeometry(0.12, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, depthTest: false });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(x, y, 0.01);
    core.userData = { type: 'entity', id: entity.id };
    group.add(core);

    const ringPoints: THREE.Vector3[] = [];
    const segments = 48;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(
        x + Math.cos(angle) * range,
        y + Math.sin(angle) * range,
        0
      ));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
    const ringMat = new THREE.LineBasicMaterial({
      color: lightColor,
      transparent: true,
      opacity: this.lightingPreviewEnabled
        ? Math.min(0.24 + intensity * 0.03, 0.55)
        : Math.min(0.30 + intensity * 0.04, 0.65),
      depthTest: false,
    });
    const ring = new THREE.Line(ringGeo, ringMat);
    group.add(ring);
  }

  private createLightDisc(radius: number, color: number, opacity: number): THREE.Mesh {
    const discGeo = new THREE.CircleGeometry(radius, 48);
    const discMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    return new THREE.Mesh(discGeo, discMat);
  }

  private readNumber(value: string | undefined, fallback: number, min: number): number {
    const parsed = parseFloat(value ?? '');
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, parsed);
  }

  private readColor(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    try {
      return new THREE.Color(value).getHex();
    } catch {
      return fallback;
    }
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
