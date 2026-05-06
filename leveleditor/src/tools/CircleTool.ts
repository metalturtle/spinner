import * as THREE from 'three';
import type { Tool, EditorPointerEvent } from './Tool';
import { Editor } from '../editor/Editor';
import { AddCircleCmd } from '../commands/AddCircleCmd';
import { generateId } from '../utils/ids';

const CIRCLE_COLORS = ['#33cccc', '#cc33ff', '#ffcc33', '#3388ff', '#ff5533', '#33cc66'];
let colorIndex = 0;
const CIRCLE_SEGMENTS = 48;

type State = 'idle' | 'dragging';

export class CircleTool implements Tool {
  name = 'circle';
  cursor = 'crosshair';

  private editor: Editor;
  private state: State = 'idle';
  private center = { x: 0, y: 0 };
  private previewGroup: THREE.Group;
  private previewLine: THREE.Line | null = null;
  private previewFill: THREE.Mesh | null = null;
  private previewRadiusLine: THREE.Line | null = null;

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
      this.center = { x: event.worldPos.x, y: event.worldPos.y };
    }
  }

  onPointerMove(event: EditorPointerEvent): void {
    if (this.state === 'dragging') {
      const radius = Math.sqrt(
        (event.worldPos.x - this.center.x) ** 2 +
        (event.worldPos.y - this.center.y) ** 2
      );
      this.updatePreview(radius);
    }
  }

  onPointerUp(event: EditorPointerEvent): void {
    if (this.state === 'dragging') {
      const radius = Math.sqrt(
        (event.worldPos.x - this.center.x) ** 2 +
        (event.worldPos.y - this.center.y) ** 2
      );
      if (radius > 0.1) {
        this.createCircle(radius);
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

  private createCircle(radius: number): void {
    const color = CIRCLE_COLORS[colorIndex % CIRCLE_COLORS.length];
    colorIndex++;

    const cmd = new AddCircleCmd(this.editor.levelData, {
      id: generateId('circ'),
      name: `Circle ${this.editor.levelData.circles.length + 1}`,
      layer: 'wall',
      center: { ...this.center },
      radius,
      properties: {},
      color,
    });
    this.editor.commandHistory.execute(cmd);
  }

  private updatePreview(radius: number): void {
    this.clearPreview();

    // Outline
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
      const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      points.push(new THREE.Vector3(
        this.center.x + Math.cos(angle) * radius,
        this.center.y + Math.sin(angle) * radius,
        0
      ));
    }
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xaaaaff, depthTest: false });
    this.previewLine = new THREE.Line(lineGeo, lineMat);
    this.previewGroup.add(this.previewLine);

    // Fill
    const fillGeo = new THREE.CircleGeometry(radius, CIRCLE_SEGMENTS);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x6666cc,
      transparent: true,
      opacity: 0.15,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this.previewFill = new THREE.Mesh(fillGeo, fillMat);
    this.previewFill.position.set(this.center.x, this.center.y, 0);
    this.previewGroup.add(this.previewFill);

    // Radius line (center to edge)
    const radGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(this.center.x, this.center.y, 0),
      new THREE.Vector3(this.center.x + radius, this.center.y, 0),
    ]);
    const radMat = new THREE.LineBasicMaterial({ color: 0x8888ff, depthTest: false, transparent: true, opacity: 0.5 });
    this.previewRadiusLine = new THREE.Line(radGeo, radMat);
    this.previewGroup.add(this.previewRadiusLine);
  }

  private clearPreview(): void {
    for (const obj of [this.previewLine, this.previewFill, this.previewRadiusLine]) {
      if (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
        this.previewGroup.remove(obj);
      }
    }
    this.previewLine = null;
    this.previewFill = null;
    this.previewRadiusLine = null;
  }
}
