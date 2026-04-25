import * as THREE from 'three';
import { Camera } from './Camera';
import type { Tool, EditorPointerEvent } from '../tools/Tool';
import { SnapCursor } from '../rendering/SnapCursor';
import { screenToWorld, snapToGrid } from '../utils/math';

export class InputManager {
  private canvas: HTMLCanvasElement;
  private cameraCtrl: Camera;
  private activeTool: Tool | null = null;
  private gridSize = 1;
  private snapEnabled = true;
  private snapCursor: SnapCursor | null = null;

  constructor(canvas: HTMLCanvasElement, cameraCtrl: Camera) {
    this.canvas = canvas;
    this.cameraCtrl = cameraCtrl;
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
  }

  setActiveTool(tool: Tool): void {
    if (this.activeTool) this.activeTool.deactivate();
    this.activeTool = tool;
    tool.activate();
    this.canvas.style.cursor = tool.cursor;
  }

  setSnapCursor(snapCursor: SnapCursor): void {
    this.snapCursor = snapCursor;
  }

  setSnapEnabled(enabled: boolean): void {
    this.snapEnabled = enabled;
  }

  getSnapEnabled(): boolean {
    return this.snapEnabled;
  }

  private makeEditorEvent(e: PointerEvent): EditorPointerEvent {
    const rawWorldPos = screenToWorld(e.clientX, e.clientY, this.canvas, this.cameraCtrl.camera);
    const worldPos = this.snapEnabled ? snapToGrid(rawWorldPos, this.gridSize) : rawWorldPos.clone();
    return {
      worldPos,
      rawWorldPos,
      screenPos: new THREE.Vector2(e.clientX, e.clientY),
      button: e.button,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
    };
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.cameraCtrl.onPointerDown(e)) return;
    if (this.activeTool && e.button === 0) {
      this.activeTool.onPointerDown(this.makeEditorEvent(e));
    }
  }

  private onPointerMove(e: PointerEvent): void {
    // Always update snap cursor
    if (this.snapCursor) {
      const raw = screenToWorld(e.clientX, e.clientY, this.canvas, this.cameraCtrl.camera);
      const snapped = this.snapEnabled ? snapToGrid(raw, this.gridSize) : raw;
      this.snapCursor.update(snapped.x, snapped.y, this.snapEnabled);
    }

    if (this.cameraCtrl.onPointerMove(e)) return;
    if (this.activeTool) {
      this.activeTool.onPointerMove(this.makeEditorEvent(e));
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.cameraCtrl.onPointerUp(e)) return;
    if (this.activeTool && e.button === 0) {
      this.activeTool.onPointerUp(this.makeEditorEvent(e));
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.cameraCtrl.onWheel(e);
  }

  private isInputFocused(): boolean {
    const el = document.activeElement;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.isInputFocused()) return;
    this.cameraCtrl.onKeyDown(e.key);
    if (this.activeTool) this.activeTool.onKeyDown(e);
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (this.isInputFocused()) return;
    this.cameraCtrl.onKeyUp(e.key);
    if (this.activeTool) this.activeTool.onKeyUp(e);
  }
}
