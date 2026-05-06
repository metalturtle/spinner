import * as THREE from 'three';
import { Camera } from './Camera';

const GRID_COLOR = 0x333355;
const AXIS_COLOR_X = 0x884444;
const AXIS_COLOR_Y = 0x448844;
const MAJOR_GRID_COLOR = 0x444466;

export class Grid {
  private scene: THREE.Scene;
  private cameraCtrl: Camera;
  private material: THREE.LineBasicMaterial;
  private majorMaterial: THREE.LineBasicMaterial;
  private axisMaterialX: THREE.LineBasicMaterial;
  private axisMaterialY: THREE.LineBasicMaterial;
  private group: THREE.Group;
  private lastBoundsKey = '';

  constructor(scene: THREE.Scene, cameraCtrl: Camera) {
    this.scene = scene;
    this.cameraCtrl = cameraCtrl;
    this.material = new THREE.LineBasicMaterial({ color: GRID_COLOR });
    this.majorMaterial = new THREE.LineBasicMaterial({ color: MAJOR_GRID_COLOR });
    this.axisMaterialX = new THREE.LineBasicMaterial({ color: AXIS_COLOR_X });
    this.axisMaterialY = new THREE.LineBasicMaterial({ color: AXIS_COLOR_Y });

    this.group = new THREE.Group();
    this.group.position.z = 0;
    this.scene.add(this.group);

    this.rebuild();
  }

  rebuild(): void {
    const bounds = this.cameraCtrl.getVisibleBounds();
    const boundsKey = `${Math.floor(bounds.left)},${Math.floor(bounds.right)},${Math.floor(bounds.top)},${Math.floor(bounds.bottom)},${this.cameraCtrl.camera.zoom.toFixed(2)}`;
    if (boundsKey === this.lastBoundsKey) return;
    this.lastBoundsKey = boundsKey;

    // Clear old children
    while (this.group.children.length > 0) {
      const child = this.group.children[0] as THREE.LineSegments;
      child.geometry.dispose();
      this.group.remove(child);
    }

    // Determine grid step based on zoom
    const zoom = this.cameraCtrl.camera.zoom;
    let step: number;
    if (zoom < 0.5) step = 10;
    else if (zoom < 2) step = 5;
    else if (zoom < 5) step = 2;
    else step = 1;

    const pad = step * 2;
    const left = Math.floor(bounds.left / step) * step - pad;
    const right = Math.ceil(bounds.right / step) * step + pad;
    const bottom = Math.floor(bounds.bottom / step) * step - pad;
    const top = Math.ceil(bounds.top / step) * step + pad;

    const minorVerts: number[] = [];
    const majorVerts: number[] = [];
    const axisXVerts: number[] = [];
    const axisYVerts: number[] = [];

    // Vertical lines
    for (let x = left; x <= right; x += step) {
      if (x === 0) {
        axisYVerts.push(x, bottom, 0, x, top, 0);
      } else if (x % 10 === 0) {
        majorVerts.push(x, bottom, 0, x, top, 0);
      } else {
        minorVerts.push(x, bottom, 0, x, top, 0);
      }
    }

    // Horizontal lines
    for (let y = bottom; y <= top; y += step) {
      if (y === 0) {
        axisXVerts.push(left, y, 0, right, y, 0);
      } else if (y % 10 === 0) {
        majorVerts.push(left, y, 0, right, y, 0);
      } else {
        minorVerts.push(left, y, 0, right, y, 0);
      }
    }

    if (minorVerts.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(minorVerts, 3));
      this.group.add(new THREE.LineSegments(geo, this.material));
    }

    if (majorVerts.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(majorVerts, 3));
      this.group.add(new THREE.LineSegments(geo, this.majorMaterial));
    }

    if (axisXVerts.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(axisXVerts, 3));
      this.group.add(new THREE.LineSegments(geo, this.axisMaterialX));
    }

    if (axisYVerts.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(axisYVerts, 3));
      this.group.add(new THREE.LineSegments(geo, this.axisMaterialY));
    }
  }
}
