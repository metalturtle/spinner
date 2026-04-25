import * as THREE from 'three';

export interface EditorPointerEvent {
  worldPos: THREE.Vector2;
  rawWorldPos: THREE.Vector2;
  screenPos: THREE.Vector2;
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
}

export interface Tool {
  name: string;
  cursor: string;
  onPointerDown(event: EditorPointerEvent): void;
  onPointerMove(event: EditorPointerEvent): void;
  onPointerUp(event: EditorPointerEvent): void;
  onKeyDown(event: KeyboardEvent): void;
  onKeyUp(event: KeyboardEvent): void;
  activate(): void;
  deactivate(): void;
}
