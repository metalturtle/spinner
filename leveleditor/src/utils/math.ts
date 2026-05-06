import * as THREE from 'three';

const _v3 = new THREE.Vector3();

export function screenToWorld(
  screenX: number,
  screenY: number,
  canvas: HTMLCanvasElement,
  camera: THREE.OrthographicCamera
): THREE.Vector2 {
  _v3.set(
    (screenX / canvas.clientWidth) * 2 - 1,
    -(screenY / canvas.clientHeight) * 2 + 1,
    0
  );
  _v3.unproject(camera);
  return new THREE.Vector2(_v3.x, _v3.y);
}

export function snapToGrid(pos: THREE.Vector2, gridSize: number): THREE.Vector2 {
  return new THREE.Vector2(
    Math.round(pos.x / gridSize) * gridSize,
    Math.round(pos.y / gridSize) * gridSize
  );
}
