import * as THREE from 'three';
import type { Tool, EditorPointerEvent } from './Tool';
import { Editor } from '../editor/Editor';
import { PolygonRenderer } from '../rendering/PolygonRenderer';
import { GizmoRenderer } from '../rendering/GizmoRenderer';
import { EntityRenderer } from '../rendering/EntityRenderer';
import { CircleRenderer } from '../rendering/CircleRenderer';
import type { SelectionItem } from '../editor/Selection';
import { MoveObjectsCmd, type MoveObjectTarget } from '../commands/MoveObjectsCmd';
import { MoveVertexCmd } from '../commands/MoveVertexCmd';
import { DeleteObjectCmd } from '../commands/DeleteObjectCmd';

type ObjType = 'polygon' | 'entity' | 'circle';
type State = 'idle' | 'dragging-object' | 'dragging-vertex' | 'marquee';

type Rect = { minX: number; minY: number; maxX: number; maxY: number };

const MARQUEE_DRAG_THRESHOLD_PX = 4;
const MARQUEE_Z = 6;
const MARQUEE_ENTITY_RADIUS = 0.5;

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
  private dragTargets: MoveObjectTarget[] = [];
  private dragVertexInfo: { polygonId: string; vertexIndex: number } | null = null;
  private dragAccum = new THREE.Vector2();
  private marqueeStartWorld = new THREE.Vector2();
  private marqueeCurrentWorld = new THREE.Vector2();
  private marqueeStartScreen = new THREE.Vector2();
  private marqueeDidDrag = false;
  private marqueeAdditive = false;
  private marqueeGroup: THREE.Group;

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

    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x66aaff,
        transparent: true,
        opacity: 0.14,
        depthTest: false,
        depthWrite: false,
      })
    );
    fill.renderOrder = 1000;

    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.5, -0.5, 0),
        new THREE.Vector3(0.5, -0.5, 0),
        new THREE.Vector3(0.5, 0.5, 0),
        new THREE.Vector3(-0.5, 0.5, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0x88bbff, depthTest: false, depthWrite: false })
    );
    outline.renderOrder = 1001;

    this.marqueeGroup = new THREE.Group();
    this.marqueeGroup.visible = false;
    this.marqueeGroup.position.z = MARQUEE_Z;
    this.marqueeGroup.add(fill, outline);
    this.editor.scene.add(this.marqueeGroup);
  }

  activate(): void {}
  deactivate(): void {
    this.resetInteraction();
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
      this.onObjectPointerDown('entity', ud.id, event);
      return;
    }

    // 3. Check circles
    this.raycaster.setFromCamera(ndc, this.editor.camera.camera);
    const circleHits = this.raycaster.intersectObjects(this.circleRenderer.getMeshesForRaycast(), false);
    if (circleHits.length > 0) {
      const ud = circleHits[0].object.userData;
      this.onObjectPointerDown('circle', ud.id, event);
      return;
    }

    // 4. Check polygons
    this.raycaster.setFromCamera(ndc, this.editor.camera.camera);
    const polyHits = this.raycaster.intersectObjects(this.polygonRenderer.getMeshesForRaycast(), false);
    if (polyHits.length > 0) {
      const ud = polyHits[0].object.userData;
      this.onObjectPointerDown('polygon', ud.id, event);
      return;
    }

    // 5. Start marquee selection on empty space
    this.state = 'marquee';
    this.marqueeStartWorld.copy(event.rawWorldPos);
    this.marqueeCurrentWorld.copy(event.rawWorldPos);
    this.marqueeStartScreen.copy(event.screenPos);
    this.marqueeDidDrag = false;
    this.marqueeAdditive = event.shiftKey;
    this.marqueeGroup.visible = false;
  }

  private onObjectPointerDown(type: ObjType, id: string, event: EditorPointerEvent): void {
    if (event.shiftKey) {
      this.editor.selection.toggleSelection(type, id);
      return;
    }

    const clickedSelected = this.editor.selection.isSelected(type, id);
    if (!clickedSelected) {
      this.editor.selection.select(type, id);
    }

    const targets = clickedSelected && this.editor.selection.selectedCount > 1
      ? this.getMovableSelectionTargets()
      : [{ type, id }];
    this.startDrag(targets.length > 0 ? targets : [{ type, id }], event);
  }

  private getMovableSelectionTargets(): MoveObjectTarget[] {
    const targets: MoveObjectTarget[] = [];
    for (const item of this.editor.selection.selectedItems) {
      if (this.isObjectType(item.type)) {
        targets.push({ type: item.type, id: item.id });
      }
    }
    return targets;
  }

  private startDrag(targets: MoveObjectTarget[], event: EditorPointerEvent): void {
    this.state = 'dragging-object';
    this.dragTargets = targets.map((target) => ({ ...target }));
    this.dragStartWorld.copy(event.worldPos);
    this.dragAccum.set(0, 0);
  }

  onPointerMove(event: EditorPointerEvent): void {
    if (this.state === 'dragging-object' && this.dragTargets.length > 0) {
      const dx = event.worldPos.x - this.dragStartWorld.x;
      const dy = event.worldPos.y - this.dragStartWorld.y;
      const moveDx = dx - this.dragAccum.x;
      const moveDy = dy - this.dragAccum.y;
      if (moveDx === 0 && moveDy === 0) return;

      this.applyLiveMoveToTargets(this.dragTargets, moveDx, moveDy);
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
    } else if (this.state === 'marquee') {
      this.marqueeCurrentWorld.copy(event.rawWorldPos);
      if (!this.marqueeDidDrag) {
        const distanceSq = event.screenPos.distanceToSquared(this.marqueeStartScreen);
        this.marqueeDidDrag = distanceSq >= MARQUEE_DRAG_THRESHOLD_PX * MARQUEE_DRAG_THRESHOLD_PX;
      }

      if (this.marqueeDidDrag) {
        this.updateMarqueeVisual();
      }
    }
  }

  onPointerUp(_event: EditorPointerEvent): void {
    if (this.state === 'dragging-object' && this.dragTargets.length > 0) {
      const totalDx = this.dragAccum.x;
      const totalDy = this.dragAccum.y;
      if (totalDx !== 0 || totalDy !== 0) {
        // Undo live preview, then execute command
        this.applyLiveMoveToTargets(this.dragTargets, -totalDx, -totalDy);
        const cmd = new MoveObjectsCmd(
          this.editor.levelData,
          this.dragTargets,
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
    } else if (this.state === 'marquee') {
      if (this.marqueeDidDrag) {
        const rect = this.getMarqueeRect();
        const hits = this.collectItemsInRect(rect);
        if (this.marqueeAdditive) {
          for (const hit of hits) {
            this.editor.selection.addToSelection(hit.type, hit.id);
          }
        } else {
          this.editor.selection.setSelection(hits);
        }
      } else if (!this.marqueeAdditive) {
        this.editor.selection.deselect();
      }
    }

    this.resetInteraction();
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

  private resetInteraction(): void {
    this.state = 'idle';
    this.dragTargets = [];
    this.dragVertexInfo = null;
    this.dragAccum.set(0, 0);
    this.marqueeDidDrag = false;
    this.marqueeAdditive = false;
    this.marqueeGroup.visible = false;
  }

  private updateMarqueeVisual(): void {
    const rect = this.getMarqueeRect();
    const width = Math.max(0.0001, rect.maxX - rect.minX);
    const height = Math.max(0.0001, rect.maxY - rect.minY);
    const centerX = (rect.minX + rect.maxX) * 0.5;
    const centerY = (rect.minY + rect.maxY) * 0.5;

    this.marqueeGroup.position.set(centerX, centerY, MARQUEE_Z);
    this.marqueeGroup.scale.set(width, height, 1);
    this.marqueeGroup.visible = true;
  }

  private getMarqueeRect(): Rect {
    return {
      minX: Math.min(this.marqueeStartWorld.x, this.marqueeCurrentWorld.x),
      minY: Math.min(this.marqueeStartWorld.y, this.marqueeCurrentWorld.y),
      maxX: Math.max(this.marqueeStartWorld.x, this.marqueeCurrentWorld.x),
      maxY: Math.max(this.marqueeStartWorld.y, this.marqueeCurrentWorld.y),
    };
  }

  private collectItemsInRect(rect: Rect): SelectionItem[] {
    const hits: SelectionItem[] = [];

    for (const poly of this.editor.levelData.polygons) {
      if (this.boundsIntersectRect(this.getPolygonBounds(poly.id), rect)) {
        hits.push({ type: 'polygon', id: poly.id });
      }
    }

    for (const circle of this.editor.levelData.circles) {
      const bounds: Rect = {
        minX: circle.center.x - circle.radius,
        minY: circle.center.y - circle.radius,
        maxX: circle.center.x + circle.radius,
        maxY: circle.center.y + circle.radius,
      };
      if (this.boundsIntersectRect(bounds, rect)) {
        hits.push({ type: 'circle', id: circle.id });
      }
    }

    for (const entity of this.editor.levelData.entities) {
      const bounds: Rect = {
        minX: entity.position.x - MARQUEE_ENTITY_RADIUS,
        minY: entity.position.y - MARQUEE_ENTITY_RADIUS,
        maxX: entity.position.x + MARQUEE_ENTITY_RADIUS,
        maxY: entity.position.y + MARQUEE_ENTITY_RADIUS,
      };
      if (this.boundsIntersectRect(bounds, rect)) {
        hits.push({ type: 'entity', id: entity.id });
      }
    }

    return hits;
  }

  private getPolygonBounds(id: string): Rect {
    const poly = this.editor.levelData.getPolygon(id);
    if (!poly || poly.vertices.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    const includePoint = (x: number, y: number): void => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };

    for (const v of poly.vertices) {
      includePoint(v.x, v.y);
    }
    if (poly.holes) {
      for (const hole of poly.holes) {
        for (const v of hole) {
          includePoint(v.x, v.y);
        }
      }
    }
    return { minX, minY, maxX, maxY };
  }

  private boundsIntersectRect(a: Rect, b: Rect): boolean {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
  }

  private isObjectType(type: string): type is ObjType {
    return type === 'polygon' || type === 'circle' || type === 'entity';
  }

  private applyLiveMoveToTargets(targets: ReadonlyArray<MoveObjectTarget>, dx: number, dy: number): void {
    for (const target of targets) {
      this.applyLiveMove(target.type, target.id, dx, dy);
    }
  }

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
    const rect = this.editor.renderer.canvas.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    return new THREE.Vector2(
      ((screenPos.x - rect.left) / width) * 2 - 1,
      -((screenPos.y - rect.top) / height) * 2 + 1
    );
  }
}
