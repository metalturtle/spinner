import * as THREE from 'three';
import { LevelData } from '../data/LevelData';
import { Selection } from '../editor/Selection';

const GIZMO_Z = 3;
const HANDLE_RADIUS = 0.2;
const HIGHLIGHT_COLOR = 0xffff44;
const SECONDARY_HIGHLIGHT_COLOR = 0x88aaff;
const HANDLE_COLOR = 0xffffff;
const ENTITY_HIGHLIGHT_COLOR = 0xffff44;

export class GizmoRenderer {
  private scene: THREE.Scene;
  private levelData: LevelData;
  private selection: Selection;
  private group: THREE.Group;
  private vertexHandles: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, levelData: LevelData, selection: Selection) {
    this.scene = scene;
    this.levelData = levelData;
    this.selection = selection;
    this.group = new THREE.Group();
    this.group.position.z = GIZMO_Z;
    this.scene.add(this.group);

    // Subscribe to both single and multi changes
    selection.onChange(() => this.rebuild());
    selection.onMultiChange(() => this.rebuild());
    levelData.on('polygon-changed', () => this.rebuild());
    levelData.on('entity-changed', () => this.rebuild());
    levelData.on('circle-changed', () => this.rebuild());
    levelData.on('polygon-removed', () => this.rebuild());
    levelData.on('entity-removed', () => this.rebuild());
    levelData.on('circle-removed', () => this.rebuild());
    levelData.on('level-loaded', () => this.rebuild());
  }

  rebuild(): void {
    this.clear();
    const items = this.selection.selectedItems;
    if (items.length === 0) return;

    for (let i = 0; i < items.length; i++) {
      const sel = items[i];
      const isPrimary = i === 0;
      const highlightColor = isPrimary ? HIGHLIGHT_COLOR : SECONDARY_HIGHLIGHT_COLOR;

      if (sel.type === 'polygon') {
        const poly = this.levelData.getPolygon(sel.id);
        if (!poly) continue;

        // Highlight outline
        const points = poly.vertices.map((v) => new THREE.Vector3(v.x, v.y, 0));
        points.push(points[0].clone());
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color: highlightColor, linewidth: 2, depthTest: false });
        this.group.add(new THREE.Line(lineGeo, lineMat));

        // Vertex handles only for primary selection
        if (isPrimary) {
          const handleGeo = new THREE.CircleGeometry(HANDLE_RADIUS, 12);
          for (let vi = 0; vi < poly.vertices.length; vi++) {
            const mat = new THREE.MeshBasicMaterial({ color: HANDLE_COLOR, depthTest: false });
            const handle = new THREE.Mesh(handleGeo.clone(), mat);
            handle.position.set(poly.vertices[vi].x, poly.vertices[vi].y, 0);
            handle.userData = { type: 'vertex-handle', polygonId: poly.id, vertexIndex: vi };
            this.group.add(handle);
            this.vertexHandles.push(handle);
          }
        }
      } else if (sel.type === 'circle') {
        const circle = this.levelData.getCircle(sel.id);
        if (!circle) continue;

        // Highlight circle outline
        const circPoints: THREE.Vector3[] = [];
        const segs = 48;
        for (let s = 0; s <= segs; s++) {
          const angle = (s / segs) * Math.PI * 2;
          circPoints.push(new THREE.Vector3(
            circle.center.x + Math.cos(angle) * circle.radius,
            circle.center.y + Math.sin(angle) * circle.radius,
            0
          ));
        }
        const circGeo = new THREE.BufferGeometry().setFromPoints(circPoints);
        const circMat = new THREE.LineBasicMaterial({ color: highlightColor, linewidth: 2, depthTest: false });
        this.group.add(new THREE.Line(circGeo, circMat));
      } else if (sel.type === 'entity' && isPrimary) {
        const entity = this.levelData.getEntity(sel.id);
        if (!entity) continue;

        const ringGeo = new THREE.RingGeometry(0.5, 0.6, 24);
        const ringMat = new THREE.MeshBasicMaterial({ color: ENTITY_HIGHLIGHT_COLOR, side: THREE.DoubleSide, depthTest: false });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(entity.position.x, entity.position.y, 0);
        this.group.add(ring);

        const arrowLen = 0.8;
        const rad = (entity.rotation * Math.PI) / 180;
        const ax = entity.position.x + Math.cos(rad) * arrowLen;
        const ay = entity.position.y + Math.sin(rad) * arrowLen;
        const arrowGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(entity.position.x, entity.position.y, 0),
          new THREE.Vector3(ax, ay, 0),
        ]);
        const arrowMat = new THREE.LineBasicMaterial({ color: ENTITY_HIGHLIGHT_COLOR, depthTest: false });
        this.group.add(new THREE.Line(arrowGeo, arrowMat));
      }
    }
  }

  private clear(): void {
    this.vertexHandles = [];
    while (this.group.children.length > 0) {
      const child = this.group.children[0] as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      if (child.material instanceof THREE.Material) child.material.dispose();
      this.group.remove(child);
    }
  }

  getVertexHandles(): THREE.Mesh[] {
    return this.vertexHandles;
  }
}
