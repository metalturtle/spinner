import * as THREE from 'three';
import type { Tool, EditorPointerEvent } from './Tool';
import { Editor } from '../editor/Editor';
import { AddPolygonCmd } from '../commands/AddPolygonCmd';
import { generateId } from '../utils/ids';

const POLYGON_COLORS = ['#33cccc', '#cc33ff', '#ffcc33', '#3388ff', '#ff5533', '#33cc66'];
let colorIndex = 0;

type State = 'idle' | 'dragging';

export class RegularPolygonTool implements Tool {
  name = 'regpoly';
  cursor = 'crosshair';

  private editor: Editor;
  private state: State = 'idle';
  private center = { x: 0, y: 0 };
  private sides = 6;
  private previewGroup: THREE.Group;
  private previewMeshes: THREE.Object3D[] = [];

  constructor(editor: Editor) {
    this.editor = editor;
    this.previewGroup = new THREE.Group();
    this.previewGroup.position.z = 3;
    editor.scene.add(this.previewGroup);
  }

  setSides(n: number): void {
    this.sides = Math.max(3, Math.min(32, n));
  }

  getSides(): number {
    return this.sides;
  }

  activate(): void {
    this.previewGroup.visible = true;
  }

  deactivate(): void {
    this.state = 'idle';
    this.clearPreview();
    this.previewGroup.visible = false;
  }

  onPointerDown(event: EditorPointerEvent): void {
    if (this.state === 'idle') {
      this.state = 'dragging';
      this.center = { x: event.worldPos.x, y: event.worldPos.y };
    }
  }

  onPointerMove(event: EditorPointerEvent): void {
    if (this.state === 'dragging') {
      this.updatePreview(event.worldPos.x, event.worldPos.y);
    }
  }

  onPointerUp(event: EditorPointerEvent): void {
    if (this.state === 'dragging') {
      const dx = event.worldPos.x - this.center.x;
      const dy = event.worldPos.y - this.center.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      if (radius > 0.1) {
        this.createPolygon(radius, Math.atan2(dy, dx));
      }
      this.state = 'idle';
      this.clearPreview();
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.state = 'idle';
      this.clearPreview();
    }
  }

  onKeyUp(_event: KeyboardEvent): void {}

  private regularVertices(
    cx: number, cy: number, radius: number, startAngle: number
  ): { x: number; y: number }[] {
    const verts: { x: number; y: number }[] = [];
    for (let i = 0; i < this.sides; i++) {
      const angle = startAngle + (i / this.sides) * Math.PI * 2;
      verts.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    }
    return verts;
  }

  private createPolygon(radius: number, startAngle: number): void {
    const color = POLYGON_COLORS[colorIndex % POLYGON_COLORS.length];
    colorIndex++;

    const cmd = new AddPolygonCmd(this.editor.levelData, {
      id: generateId('poly'),
      name: `${this.sides}-gon ${this.editor.levelData.polygons.length + 1}`,
      layer: 'wall',
      vertices: this.regularVertices(this.center.x, this.center.y, radius, startAngle),
      properties: {},
      color,
    });
    this.editor.commandHistory.execute(cmd);
  }

  private updatePreview(x2: number, y2: number): void {
    this.clearPreview();

    const cx = this.center.x;
    const cy = this.center.y;
    const dx = x2 - cx;
    const dy = y2 - cy;
    const radius = Math.sqrt(dx * dx + dy * dy);
    if (radius < 0.01) return;

    const startAngle = Math.atan2(dy, dx);
    const verts = this.regularVertices(cx, cy, radius, startAngle);

    // Outline
    const outlinePoints = verts.map((v) => new THREE.Vector3(v.x, v.y, 0));
    outlinePoints.push(outlinePoints[0].clone());
    const lineGeo = new THREE.BufferGeometry().setFromPoints(outlinePoints);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xaaaaff, depthTest: false });
    const line = new THREE.Line(lineGeo, lineMat);
    this.previewGroup.add(line);
    this.previewMeshes.push(line);

    // Fill
    const shape = new THREE.Shape(verts.map((v) => new THREE.Vector2(v.x, v.y)));
    const fillGeo = new THREE.ShapeGeometry(shape);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x6666cc, transparent: true, opacity: 0.15,
      depthTest: false, side: THREE.DoubleSide,
    });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    this.previewGroup.add(fill);
    this.previewMeshes.push(fill);

    // Radius line (center → first vertex)
    const radGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cx, cy, 0),
      new THREE.Vector3(x2, y2, 0),
    ]);
    const radMat = new THREE.LineBasicMaterial({ color: 0x8888ff, depthTest: false, transparent: true, opacity: 0.5 });
    const radLine = new THREE.Line(radGeo, radMat);
    this.previewGroup.add(radLine);
    this.previewMeshes.push(radLine);
  }

  private clearPreview(): void {
    for (const obj of this.previewMeshes) {
      if ('geometry' in obj && (obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
      if ('material' in obj && obj.material instanceof THREE.Material) obj.material.dispose();
      this.previewGroup.remove(obj);
    }
    this.previewMeshes = [];
  }
}
