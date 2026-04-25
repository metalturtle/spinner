import * as THREE from 'three';
import type { Tool, EditorPointerEvent } from './Tool';
import { Editor } from '../editor/Editor';
import { AddPolygonCmd } from '../commands/AddPolygonCmd';
import { generateId } from '../utils/ids';

const CLOSE_THRESHOLD = 15; // pixels

// Colors for new polygons, cycled through
const POLYGON_COLORS = ['#3388ff', '#ff5533', '#33cc66', '#cc33ff', '#ffcc33', '#33cccc'];
let colorIndex = 0;

type State = 'idle' | 'drawing';

export class PolygonTool implements Tool {
  name = 'polygon';
  cursor = 'crosshair';

  private editor: Editor;
  private state: State = 'idle';
  private vertices: { x: number; y: number }[] = [];
  private previewGroup: THREE.Group;
  private previewDots: THREE.Group;
  private previewLine: THREE.Line | null = null;
  private rubberBandLine: THREE.Line | null = null;

  constructor(editor: Editor) {
    this.editor = editor;
    this.previewGroup = new THREE.Group();
    this.previewGroup.position.z = 3;
    this.previewDots = new THREE.Group();
    this.previewGroup.add(this.previewDots);
    editor.scene.add(this.previewGroup);
  }

  activate(): void {
    this.previewGroup.visible = true;
  }

  deactivate(): void {
    this.cancelDrawing();
    this.previewGroup.visible = false;
  }

  onPointerDown(event: EditorPointerEvent): void {
    if (this.state === 'idle') {
      this.state = 'drawing';
      this.vertices = [{ x: event.worldPos.x, y: event.worldPos.y }];
      this.updatePreview(event.worldPos);
    } else if (this.state === 'drawing') {
      // Check if clicking near first vertex to close
      if (this.vertices.length >= 3) {
        const first = this.vertices[0];
        const screenFirst = this.worldToScreen(first.x, first.y);
        const dist = screenFirst.distanceTo(event.screenPos);
        if (dist < CLOSE_THRESHOLD) {
          this.completePolygon();
          return;
        }
      }
      this.vertices.push({ x: event.worldPos.x, y: event.worldPos.y });
      this.updatePreview(event.worldPos);
    }
  }

  onPointerMove(event: EditorPointerEvent): void {
    if (this.state === 'drawing') {
      this.updateRubberBand(event.worldPos);
    }
  }

  onPointerUp(_event: EditorPointerEvent): void {}

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.cancelDrawing();
    }
  }

  onKeyUp(_event: KeyboardEvent): void {}

  private completePolygon(): void {
    if (this.vertices.length < 3) {
      this.cancelDrawing();
      return;
    }

    const color = POLYGON_COLORS[colorIndex % POLYGON_COLORS.length];
    colorIndex++;

    const cmd = new AddPolygonCmd(this.editor.levelData, {
      id: generateId('poly'),
      name: `Polygon ${this.editor.levelData.polygons.length + 1}`,
      layer: 'wall',
      vertices: this.vertices.map((v) => ({ ...v })),
      properties: {},
      color,
    });
    this.editor.commandHistory.execute(cmd);
    this.cancelDrawing();
  }

  private cancelDrawing(): void {
    this.state = 'idle';
    this.vertices = [];
    this.clearPreview();
  }

  private clearPreview(): void {
    while (this.previewDots.children.length > 0) {
      const child = this.previewDots.children[0] as THREE.Mesh;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
      this.previewDots.remove(child);
    }
    if (this.previewLine) {
      this.previewLine.geometry.dispose();
      (this.previewLine.material as THREE.Material).dispose();
      this.previewGroup.remove(this.previewLine);
      this.previewLine = null;
    }
    if (this.rubberBandLine) {
      this.rubberBandLine.geometry.dispose();
      (this.rubberBandLine.material as THREE.Material).dispose();
      this.previewGroup.remove(this.rubberBandLine);
      this.rubberBandLine = null;
    }
  }

  private updatePreview(cursor: THREE.Vector2): void {
    this.clearPreview();
    if (this.vertices.length === 0) return;

    // Dots at each vertex
    const dotGeo = new THREE.CircleGeometry(0.15, 12);
    for (let i = 0; i < this.vertices.length; i++) {
      const color = i === 0 && this.vertices.length >= 3 ? 0x44ff44 : 0xffffff;
      const dotMat = new THREE.MeshBasicMaterial({ color, depthTest: false });
      const dot = new THREE.Mesh(dotGeo.clone(), dotMat);
      dot.position.set(this.vertices[i].x, this.vertices[i].y, 0);
      this.previewDots.add(dot);
    }

    // Lines connecting placed vertices
    if (this.vertices.length >= 2) {
      const points = this.vertices.map((v) => new THREE.Vector3(v.x, v.y, 0));
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xaaaaff, depthTest: false });
      this.previewLine = new THREE.Line(lineGeo, lineMat);
      this.previewGroup.add(this.previewLine);
    }

    // Rubber band from last vertex to cursor
    this.updateRubberBand(cursor);
  }

  private updateRubberBand(cursor: THREE.Vector2): void {
    if (this.rubberBandLine) {
      this.rubberBandLine.geometry.dispose();
      (this.rubberBandLine.material as THREE.Material).dispose();
      this.previewGroup.remove(this.rubberBandLine);
      this.rubberBandLine = null;
    }

    if (this.vertices.length === 0) return;

    const last = this.vertices[this.vertices.length - 1];
    const points = [
      new THREE.Vector3(last.x, last.y, 0),
      new THREE.Vector3(cursor.x, cursor.y, 0),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x8888ff, depthTest: false, opacity: 0.6, transparent: true });
    this.rubberBandLine = new THREE.Line(geo, mat);
    this.previewGroup.add(this.rubberBandLine);
  }

  private worldToScreen(wx: number, wy: number): THREE.Vector2 {
    const v = new THREE.Vector3(wx, wy, 0);
    v.project(this.editor.camera.camera);
    return new THREE.Vector2(
      (v.x * 0.5 + 0.5) * window.innerWidth,
      (-v.y * 0.5 + 0.5) * window.innerHeight
    );
  }
}
