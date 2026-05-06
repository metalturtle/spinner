import * as THREE from 'three';

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 50;
const ZOOM_SPEED = 0.1;
const PAN_SPEED = 0.5;

export class Camera {
  readonly camera: THREE.OrthographicCamera;
  private frustumSize = 50;

  // Pan state
  private isPanning = false;
  private panStart = new THREE.Vector2();
  private panOrigin = new THREE.Vector2();

  // WASD state
  private keysHeld = new Set<string>();

  constructor() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(
      -this.frustumSize * aspect / 2,
       this.frustumSize * aspect / 2,
       this.frustumSize / 2,
      -this.frustumSize / 2,
       0.1,
       1000
    );
    this.camera.position.set(0, 0, 100);
    this.camera.lookAt(0, 0, 0);

    window.addEventListener('resize', () => this.updateProjection());
  }

  updateProjection(): void {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.left = -this.frustumSize * aspect / 2;
    this.camera.right = this.frustumSize * aspect / 2;
    this.camera.top = this.frustumSize / 2;
    this.camera.bottom = -this.frustumSize / 2;
    this.camera.updateProjectionMatrix();
  }

  onPointerDown(e: PointerEvent): boolean {
    if (e.button === 1) {
      this.isPanning = true;
      this.panStart.set(e.clientX, e.clientY);
      this.panOrigin.set(this.camera.position.x, this.camera.position.y);
      return true;
    }
    return false;
  }

  onPointerMove(e: PointerEvent): boolean {
    if (!this.isPanning) return false;
    const dx = e.clientX - this.panStart.x;
    const dy = e.clientY - this.panStart.y;
    const scale = this.frustumSize / (this.camera.zoom * window.innerHeight);
    this.camera.position.x = this.panOrigin.x - dx * scale;
    this.camera.position.y = this.panOrigin.y + dy * scale;
    return true;
  }

  onPointerUp(e: PointerEvent): boolean {
    if (e.button === 1) {
      this.isPanning = false;
      return true;
    }
    return false;
  }

  onWheel(e: WheelEvent): void {
    const factor = e.deltaY > 0 ? (1 - ZOOM_SPEED) : (1 + ZOOM_SPEED);
    this.camera.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.camera.zoom * factor));
    this.camera.updateProjectionMatrix();
  }

  onKeyDown(key: string): void {
    this.keysHeld.add(key.toLowerCase());
  }

  onKeyUp(key: string): void {
    this.keysHeld.delete(key.toLowerCase());
  }

  update(): void {
    const speed = PAN_SPEED * this.frustumSize / this.camera.zoom;
    if (this.keysHeld.has('w')) this.camera.position.y += speed * 0.016;
    if (this.keysHeld.has('s')) this.camera.position.y -= speed * 0.016;
    if (this.keysHeld.has('a')) this.camera.position.x -= speed * 0.016;
    if (this.keysHeld.has('d')) this.camera.position.x += speed * 0.016;
  }

  getVisibleBounds(): { left: number; right: number; top: number; bottom: number } {
    const halfW = (this.frustumSize * (window.innerWidth / window.innerHeight)) / (2 * this.camera.zoom);
    const halfH = this.frustumSize / (2 * this.camera.zoom);
    return {
      left: this.camera.position.x - halfW,
      right: this.camera.position.x + halfW,
      top: this.camera.position.y + halfH,
      bottom: this.camera.position.y - halfH,
    };
  }
}
