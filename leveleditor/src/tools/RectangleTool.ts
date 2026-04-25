import * as THREE from 'three';
import type { Tool, EditorPointerEvent } from './Tool';
import { Editor } from '../editor/Editor';
import { AddPolygonCmd } from '../commands/AddPolygonCmd';
import { generateId } from '../utils/ids';

const POLYGON_COLORS = ['#3388ff', '#ff5533', '#33cc66', '#cc33ff', '#ffcc33', '#33cccc'];
let colorIndex = 0;

type State = 'idle' | 'dragging';

export class RectangleTool implements Tool {
  name = 'rectangle';
  cursor = 'crosshair';

  private editor: Editor;
  private state: State = 'idle';
  private corner1 = { x: 0, y: 0 };
  private previewGroup: THREE.Group;
  private previewRect: THREE.LineLoop | null = null;
  private previewFill: THREE.Mesh | null = null;

  constructor(editor: Editor) {
    this.editor = editor;
    this.previewGroup = new THREE.Group();
    this.previewGroup.position.z = 3;
    editor.scene.add(this.previewGroup);
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
      this.corner1 = { x: event.worldPos.x, y: event.worldPos.y };
    }
  }

  onPointerMove(event: EditorPointerEvent): void {
    if (this.state === 'dragging') {
      this.updatePreview(event.worldPos.x, event.worldPos.y);
    }
  }

  onPointerUp(event: EditorPointerEvent): void {
    if (this.state === 'dragging') {
      const c2 = { x: event.worldPos.x, y: event.worldPos.y };
      if (c2.x !== this.corner1.x && c2.y !== this.corner1.y) {
        this.createRect(this.corner1, c2);
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

  private createRect(c1: { x: number; y: number }, c2: { x: number; y: number }): void {
    const minX = Math.min(c1.x, c2.x);
    const maxX = Math.max(c1.x, c2.x);
    const minY = Math.min(c1.y, c2.y);
    const maxY = Math.max(c1.y, c2.y);

    const color = POLYGON_COLORS[colorIndex % POLYGON_COLORS.length];
    colorIndex++;

    const cmd = new AddPolygonCmd(this.editor.levelData, {
      id: generateId('poly'),
      name: `Rect ${this.editor.levelData.polygons.length + 1}`,
      layer: 'wall',
      vertices: [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ],
      properties: {},
      color,
    });
    this.editor.commandHistory.execute(cmd);
  }

  private updatePreview(x2: number, y2: number): void {
    this.clearPreview();

    const minX = Math.min(this.corner1.x, x2);
    const maxX = Math.max(this.corner1.x, x2);
    const minY = Math.min(this.corner1.y, y2);
    const maxY = Math.max(this.corner1.y, y2);

    const points = [
      new THREE.Vector3(minX, minY, 0),
      new THREE.Vector3(maxX, minY, 0),
      new THREE.Vector3(maxX, maxY, 0),
      new THREE.Vector3(minX, maxY, 0),
    ];

    // Outline
    const lineGeo = new THREE.BufferGeometry().setFromPoints([...points, points[0]]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xaaaaff, depthTest: false });
    this.previewRect = new THREE.LineLoop(lineGeo, lineMat);
    this.previewGroup.add(this.previewRect);

    // Semi-transparent fill
    const shape = new THREE.Shape();
    shape.moveTo(minX, minY);
    shape.lineTo(maxX, minY);
    shape.lineTo(maxX, maxY);
    shape.lineTo(minX, maxY);
    const fillGeo = new THREE.ShapeGeometry(shape);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x6666cc,
      transparent: true,
      opacity: 0.15,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this.previewFill = new THREE.Mesh(fillGeo, fillMat);
    this.previewGroup.add(this.previewFill);
  }

  private clearPreview(): void {
    if (this.previewRect) {
      this.previewRect.geometry.dispose();
      (this.previewRect.material as THREE.Material).dispose();
      this.previewGroup.remove(this.previewRect);
      this.previewRect = null;
    }
    if (this.previewFill) {
      this.previewFill.geometry.dispose();
      (this.previewFill.material as THREE.Material).dispose();
      this.previewGroup.remove(this.previewFill);
      this.previewFill = null;
    }
  }
}
