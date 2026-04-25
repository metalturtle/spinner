import * as THREE from 'three';
import type { Tool, EditorPointerEvent } from './Tool';
import { Editor } from '../editor/Editor';
import { PolygonRenderer } from '../rendering/PolygonRenderer';
import { GizmoRenderer } from '../rendering/GizmoRenderer';
import { EntityRenderer } from '../rendering/EntityRenderer';
import { CircleRenderer } from '../rendering/CircleRenderer';
import { MoveObjectCmd } from '../commands/MoveObjectCmd';
import { MoveVertexCmd } from '../commands/MoveVertexCmd';
import { DeleteObjectCmd } from '../commands/DeleteObjectCmd';

type ObjType = 'polygon' | 'entity' | 'circle';
type State = 'idle' | 'dragging-object' | 'dragging-vertex';

export class SelectTool implements Tool {
  name = 'select';
  cursor = 'default';

  private editor: Editor;
  private polygonRenderer: PolygonRenderer;
  private entityRenderer: EntityRenderer;
  private circleRenderer: CircleRenderer;
  private gizmoRenderer: GizmoRenderer;
  private raycaster = new THREE.Raycaster();

  private state: State = 'idle';
  private dragStartWorld = new THREE.Vector2();
  private dragTarget: { type: ObjType; id: string } | null = null;
  private dragVertexInfo: { polygonId: string; vertexIndex: number } | null = null;
  private dragAccum = new THREE.Vector2();

  constructor(
    editor: Editor,
    polygonRenderer: PolygonRenderer,
    entityRenderer: EntityRenderer,
    circleRenderer: CircleRenderer,
    gizmoRenderer: GizmoRenderer,
  ) {
    this.editor = editor;
    this.polygonRenderer = polygonRenderer;
    this.entityRenderer = entityRenderer;
    this.circleRenderer = circleRenderer;
    this.gizmoRenderer = gizmoRenderer;
  }

  activate(): void {}
  deactivate(): void {
    this.state = 'idle';
  }

  onPointerDown(event: EditorPointerEvent): void {
    if (this.state !== 'idle') return;

    const ndc = this.toNDC(event.screenPos);

    // 1. Check vertex handles first
    const handles = this.gizmoRenderer.getVertexHandles();
    if (handles.length > 0) {
      this.raycaster.setFromCamera(ndc, this.editor.camera.camera);
      const hits = this.raycaster.intersectObjects(handles, false);
      if (hits.length > 0) {
        const ud = hits[0].object.userData;
        this.state = 'dragging-vertex';
        this.dragVertexInfo = { polygonId: ud.polygonId, vertexIndex: ud.vertexIndex };
        this.dragStartWorld.copy(event.worldPos);
        this.dragAccum.set(0, 0);
        return;
      }
    }

    // 2. Check entities
    this.raycaster.setFromCamera(ndc, this.editor.camera.camera);
    const entityHits = this.raycaster.intersectObjects(this.entityRenderer.getMeshesForRaycast(), false);
    if (entityHits.length > 0) {
      const ud = entityHits[0].object.userData;
      if (event.shiftKey) { this.editor.selection.toggleSelection('entity', ud.id); return; }
      this.editor.selection.select('entity', ud.id);
      this.startDrag('entity', ud.id, event);
      return;
    }

    // 3. Check circles
    this.raycaster.setFromCamera(ndc, this.editor.camera.camera);
    const circleHits = this.raycaster.intersectObjects(this.circleRenderer.getMeshesForRaycast(), false);
    if (circleHits.length > 0) {
      const ud = circleHits[0].object.userData;
      if (event.shiftKey) { this.editor.selection.toggleSelection('circle', ud.id); return; }
      this.editor.selection.select('circle', ud.id);
      this.startDrag('circle', ud.id, event);
      return;
    }

    // 4. Check polygons
    this.raycaster.setFromCamera(ndc, this.editor.camera.camera);
    const polyHits = this.raycaster.intersectObjects(this.polygonRenderer.getMeshesForRaycast(), false);
    if (polyHits.length > 0) {
      const ud = polyHits[0].object.userData;
      if (event.shiftKey) { this.editor.selection.toggleSelection('polygon', ud.id); return; }
      this.editor.selection.select('polygon', ud.id);
      this.startDrag('polygon', ud.id, event);
      return;
    }

    // 5. Click on nothing
    if (!event.shiftKey) {
      this.editor.selection.deselect();
    }
  }

  private startDrag(type: ObjType, id: string, event: EditorPointerEvent): void {
    this.state = 'dragging-object';
    this.dragTarget = { type, id };
    this.dragStartWorld.copy(event.worldPos);
    this.dragAccum.set(0, 0);
  }

  onPointerMove(event: EditorPointerEvent): void {
    if (this.state === 'dragging-object' && this.dragTarget) {
      const dx = event.worldPos.x - this.dragStartWorld.x;
      const dy = event.worldPos.y - this.dragStartWorld.y;
      const moveDx = dx - this.dragAccum.x;
      const moveDy = dy - this.dragAccum.y;
      if (moveDx === 0 && moveDy === 0) return;

      this.applyLiveMove(this.dragTarget.type, this.dragTarget.id, moveDx, moveDy);
      this.dragAccum.set(dx, dy);
    } else if (this.state === 'dragging-vertex' && this.dragVertexInfo) {
      const dx = event.worldPos.x - this.dragStartWorld.x;
      const dy = event.worldPos.y - this.dragStartWorld.y;
      const moveDx = dx - this.dragAccum.x;
      const moveDy = dy - this.dragAccum.y;
      if (moveDx === 0 && moveDy === 0) return;

      const poly = this.editor.levelData.getPolygon(this.dragVertexInfo.polygonId);
      if (poly) {
        const v = poly.vertices[this.dragVertexInfo.vertexIndex];
        v.x += moveDx;
        v.y += moveDy;
        this.editor.levelData.notifyPolygonChanged(this.dragVertexInfo.polygonId);
      }
      this.dragAccum.set(dx, dy);
    }
  }

  onPointerUp(_event: EditorPointerEvent): void {
    if (this.state === 'dragging-object' && this.dragTarget) {
      const totalDx = this.dragAccum.x;
      const totalDy = this.dragAccum.y;
      if (totalDx !== 0 || totalDy !== 0) {
        // Undo live preview, then execute command
        this.applyLiveMove(this.dragTarget.type, this.dragTarget.id, -totalDx, -totalDy);
        const cmd = new MoveObjectCmd(
          this.editor.levelData,
          this.dragTarget.type,
          this.dragTarget.id,
          totalDx,
          totalDy
        );
        this.editor.commandHistory.execute(cmd);
      }
    } else if (this.state === 'dragging-vertex' && this.dragVertexInfo) {
      const totalDx = this.dragAccum.x;
      const totalDy = this.dragAccum.y;
      if (totalDx !== 0 || totalDy !== 0) {
        const poly = this.editor.levelData.getPolygon(this.dragVertexInfo.polygonId);
        if (poly) {
          const v = poly.vertices[this.dragVertexInfo.vertexIndex];
          v.x -= totalDx;
          v.y -= totalDy;
        }
        const cmd = new MoveVertexCmd(
          this.editor.levelData,
          this.dragVertexInfo.polygonId,
          this.dragVertexInfo.vertexIndex,
          totalDx,
          totalDy
        );
        this.editor.commandHistory.execute(cmd);
      }
    }

    this.state = 'idle';
    this.dragTarget = null;
    this.dragVertexInfo = null;
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const sel = this.editor.selection.selected;
      if (!sel) return;
      const cmd = new DeleteObjectCmd(this.editor.levelData, sel.type as ObjType, sel.id);
      this.editor.commandHistory.execute(cmd);
      this.editor.selection.deselect();
    }
  }

  onKeyUp(_event: KeyboardEvent): void {}

  private applyLiveMove(type: ObjType, id: string, dx: number, dy: number): void {
    if (type === 'polygon') {
      const poly = this.editor.levelData.getPolygon(id);
      if (poly) {
        for (const v of poly.vertices) { v.x += dx; v.y += dy; }
        if (poly.holes) {
          for (const hole of poly.holes) {
            for (const v of hole) { v.x += dx; v.y += dy; }
          }
        }
        this.editor.levelData.notifyPolygonChanged(id);
      }
    } else if (type === 'circle') {
      const circle = this.editor.levelData.getCircle(id);
      if (circle) {
        circle.center.x += dx;
        circle.center.y += dy;
        this.editor.levelData.notifyCircleChanged(id);
      }
    } else {
      const entity = this.editor.levelData.getEntity(id);
      if (entity) {
        entity.position.x += dx;
        entity.position.y += dy;
        this.editor.levelData.notifyEntityChanged(id);
      }
    }
  }

  private toNDC(screenPos: THREE.Vector2): THREE.Vector2 {
    return new THREE.Vector2(
      (screenPos.x / window.innerWidth) * 2 - 1,
      -(screenPos.y / window.innerHeight) * 2 + 1
    );
  }
}