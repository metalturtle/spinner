import * as THREE from 'three';
import type { Tool, EditorPointerEvent } from './Tool';
import { Editor } from '../editor/Editor';
import { AddPolygonCmd } from '../commands/AddPolygonCmd';
import { AddCircleCmd } from '../commands/AddCircleCmd';
import { generateId } from '../utils/ids';

const WALL_COLOR = '#5577aa';
const FLOOR_COLOR = '#2a3a4a';
const CIRCLE_SEGMENTS = 48;

export type RoomShape = 'rect' | 'circle';
type State = 'idle' | 'dragging';

export class RoomTool implements Tool {
  name = 'room';
  cursor = 'crosshair';

  private editor: Editor;
  private state: State = 'idle';
  private origin = { x: 0, y: 0 };
  private wallThickness = 1;
  private roomShape: RoomShape = 'rect';
  private previewGroup: THREE.Group;
  private previewMeshes: THREE.Object3D[] = [];

  constructor(editor: Editor) {
    this.editor = editor;
    this.previewGroup = new THREE.Group();
    this.previewGroup.position.z = 3;
    editor.scene.add(this.previewGroup);
  }

  setWallThickness(t: number): void {
    this.wallThickness = Math.max(0.1, t);
  }

  getWallThickness(): number {
    return this.wallThickness;
  }

  setRoomShape(shape: RoomShape): void {
    this.roomShape = shape;
  }

  getRoomShape(): RoomShape {
    return this.roomShape;
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
      this.origin = { x: event.worldPos.x, y: event.worldPos.y };
    }
  }

  onPointerMove(event: EditorPointerEvent): void {
    if (this.state === 'dragging') {
      if (this.roomShape === 'circle') {
        this.updateCirclePreview(event.worldPos.x, event.worldPos.y);
      } else {
        this.updateRectPreview(event.worldPos.x, event.worldPos.y);
      }
    }
  }

  onPointerUp(event: EditorPointerEvent): void {
    if (this.state === 'dragging') {
      if (this.roomShape === 'circle') {
        const outerR = Math.sqrt(
          (event.worldPos.x - this.origin.x) ** 2 +
          (event.worldPos.y - this.origin.y) ** 2
        );
        if (outerR > this.wallThickness + 0.1) {
          this.createCircleRoom(outerR);
        }
      } else {
        const c2 = { x: event.worldPos.x, y: event.worldPos.y };
        const w = Math.abs(c2.x - this.origin.x);
        const h = Math.abs(c2.y - this.origin.y);
        if (w > this.wallThickness * 2 && h > this.wallThickness * 2) {
          this.createRectRoom(this.origin, c2);
        }
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

  // --- Circle room ---

  private createCircleRoom(outerR: number): void {
    const innerR = outerR - this.wallThickness;
    const cx = this.origin.x;
    const cy = this.origin.y;
    const roomName = `Room ${this.editor.levelData.polygons.length + 1}`;

    // Wall: polygon ring (outer boundary with inner hole)
    const outerVerts = this.circleVertices(cx, cy, outerR);
    const innerVerts = this.circleVertices(cx, cy, innerR).reverse();
    const wallCmd = new AddPolygonCmd(this.editor.levelData, {
      id: generateId('poly'),
      name: `${roomName} - Wall`,
      layer: 'wall',
      vertices: outerVerts,
      holes: [innerVerts],
      properties: {},
      color: WALL_COLOR,
    });
    this.editor.commandHistory.execute(wallCmd);

    // Floor: circle primitive
    const floorCmd = new AddCircleCmd(this.editor.levelData, {
      id: generateId('circ'),
      name: `${roomName} - Floor`,
      layer: 'floor',
      center: { x: cx, y: cy },
      radius: innerR,
      properties: {},
      color: FLOOR_COLOR,
    });
    this.editor.commandHistory.execute(floorCmd);
  }

  private circleVertices(cx: number, cy: number, r: number): { x: number; y: number }[] {
    const verts: { x: number; y: number }[] = [];
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      verts.push({
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
      });
    }
    return verts;
  }

  private updateCirclePreview(x2: number, y2: number): void {
    this.clearPreview();

    const cx = this.origin.x;
    const cy = this.origin.y;
    const outerR = Math.sqrt((x2 - cx) ** 2 + (y2 - cy) ** 2);
    const innerR = Math.max(0, outerR - this.wallThickness);

    // Outer circle outline
    this.addCircleOutline(cx, cy, outerR, 0xaaaaff, 1);

    // Inner circle outline (floor boundary)
    if (innerR > 0) {
      this.addCircleOutline(cx, cy, innerR, 0x8888cc, 0.5);
    }

    // Radius line
    const radGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cx, cy, 0),
      new THREE.Vector3(x2, y2, 0),
    ]);
    const radMat = new THREE.LineBasicMaterial({ color: 0x8888ff, depthTest: false, transparent: true, opacity: 0.4 });
    const radLine = new THREE.Line(radGeo, radMat);
    this.previewGroup.add(radLine);
    this.previewMeshes.push(radLine);
  }

  private addCircleOutline(cx: number, cy: number, r: number, color: number, opacity: number): void {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
      const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      points.push(new THREE.Vector3(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: opacity < 1, opacity });
    const line = new THREE.Line(geo, mat);
    this.previewGroup.add(line);
    this.previewMeshes.push(line);
  }

  // --- Rect room ---

  private createRectRoom(c1: { x: number; y: number }, c2: { x: number; y: number }): void {
    const minX = Math.min(c1.x, c2.x);
    const maxX = Math.max(c1.x, c2.x);
    const minY = Math.min(c1.y, c2.y);
    const maxY = Math.max(c1.y, c2.y);
    const t = this.wallThickness;
    const roomName = `Room ${this.editor.levelData.polygons.length + 1}`;

    this.addWallCmd(`${roomName} - Bottom`, [
      { x: minX, y: minY }, { x: maxX, y: minY },
      { x: maxX, y: minY + t }, { x: minX, y: minY + t },
    ]);
    this.addWallCmd(`${roomName} - Top`, [
      { x: minX, y: maxY - t }, { x: maxX, y: maxY - t },
      { x: maxX, y: maxY }, { x: minX, y: maxY },
    ]);
    this.addWallCmd(`${roomName} - Left`, [
      { x: minX, y: minY + t }, { x: minX + t, y: minY + t },
      { x: minX + t, y: maxY - t }, { x: minX, y: maxY - t },
    ]);
    this.addWallCmd(`${roomName} - Right`, [
      { x: maxX - t, y: minY + t }, { x: maxX, y: minY + t },
      { x: maxX, y: maxY - t }, { x: maxX - t, y: maxY - t },
    ]);

    const floorCmd = new AddPolygonCmd(this.editor.levelData, {
      id: generateId('poly'),
      name: `${roomName} - Floor`,
      layer: 'floor',
      vertices: [
        { x: minX + t, y: minY + t }, { x: maxX - t, y: minY + t },
        { x: maxX - t, y: maxY - t }, { x: minX + t, y: maxY - t },
      ],
      properties: {},
      color: FLOOR_COLOR,
    });
    this.editor.commandHistory.execute(floorCmd);
  }

  private addWallCmd(name: string, vertices: { x: number; y: number }[]): void {
    const cmd = new AddPolygonCmd(this.editor.levelData, {
      id: generateId('poly'),
      name,
      layer: 'wall',
      vertices,
      properties: {},
      color: WALL_COLOR,
    });
    this.editor.commandHistory.execute(cmd);
  }

  private updateRectPreview(x2: number, y2: number): void {
    this.clearPreview();

    const minX = Math.min(this.origin.x, x2);
    const maxX = Math.max(this.origin.x, x2);
    const minY = Math.min(this.origin.y, y2);
    const maxY = Math.max(this.origin.y, y2);
    const t = this.wallThickness;

    // Outer rect
    const outerPoints = [
      new THREE.Vector3(minX, minY, 0), new THREE.Vector3(maxX, minY, 0),
      new THREE.Vector3(maxX, maxY, 0), new THREE.Vector3(minX, maxY, 0),
      new THREE.Vector3(minX, minY, 0),
    ];
    const outerGeo = new THREE.BufferGeometry().setFromPoints(outerPoints);
    const outerLine = new THREE.Line(outerGeo, new THREE.LineBasicMaterial({ color: 0xaaaaff, depthTest: false }));
    this.previewGroup.add(outerLine);
    this.previewMeshes.push(outerLine);

    // Inner rect
    const inMinX = minX + t, inMaxX = maxX - t, inMinY = minY + t, inMaxY = maxY - t;
    if (inMinX < inMaxX && inMinY < inMaxY) {
      const innerPoints = [
        new THREE.Vector3(inMinX, inMinY, 0), new THREE.Vector3(inMaxX, inMinY, 0),
        new THREE.Vector3(inMaxX, inMaxY, 0), new THREE.Vector3(inMinX, inMaxY, 0),
        new THREE.Vector3(inMinX, inMinY, 0),
      ];
      const innerGeo = new THREE.BufferGeometry().setFromPoints(innerPoints);
      const innerLine = new THREE.Line(innerGeo, new THREE.LineBasicMaterial({ color: 0x8888cc, depthTest: false, transparent: true, opacity: 0.5 }));
      this.previewGroup.add(innerLine);
      this.previewMeshes.push(innerLine);
    }

    // Wall fills
    const wallRects = [
      [minX, minY, maxX, minY + t],
      [minX, maxY - t, maxX, maxY],
      [minX, minY + t, minX + t, maxY - t],
      [maxX - t, minY + t, maxX, maxY - t],
    ];
    for (const [x1, y1, x2w, y2w] of wallRects) {
      if (x2w <= x1 || y2w <= y1) continue;
      const shape = new THREE.Shape();
      shape.moveTo(x1, y1);
      shape.lineTo(x2w, y1);
      shape.lineTo(x2w, y2w);
      shape.lineTo(x1, y2w);
      const fillGeo = new THREE.ShapeGeometry(shape);
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0x5577aa, transparent: true, opacity: 0.2,
        depthTest: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(fillGeo, fillMat);
      this.previewGroup.add(mesh);
      this.previewMeshes.push(mesh);
    }
  }

  // --- Shared ---

  private clearPreview(): void {
    for (const obj of this.previewMeshes) {
      if ('geometry' in obj && obj.geometry) (obj as THREE.Mesh).geometry.dispose();
      if ('material' in obj && obj.material instanceof THREE.Material) obj.material.dispose();
      this.previewGroup.remove(obj);
    }
    this.previewMeshes = [];
  }
}
