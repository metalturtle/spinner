import * as THREE from 'three';

const CURSOR_Z = 4;
const CROSSHAIR_SIZE = 0.3;
const CROSSHAIR_COLOR = 0xffffff;

export class SnapCursor {
  private group: THREE.Group;
  private hLine: THREE.Line;
  private vLine: THREE.Line;
  private dot: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.position.z = CURSOR_Z;

    const lineMat = new THREE.LineBasicMaterial({
      color: CROSSHAIR_COLOR,
      depthTest: false,
      transparent: true,
      opacity: 0.7,
    });

    // Horizontal line
    const hGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-CROSSHAIR_SIZE, 0, 0),
      new THREE.Vector3(CROSSHAIR_SIZE, 0, 0),
    ]);
    this.hLine = new THREE.Line(hGeo, lineMat);
    this.group.add(this.hLine);

    // Vertical line
    const vGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -CROSSHAIR_SIZE, 0),
      new THREE.Vector3(0, CROSSHAIR_SIZE, 0),
    ]);
    this.vLine = new THREE.Line(vGeo, lineMat);
    this.group.add(this.vLine);

    // Center dot
    const dotGeo = new THREE.CircleGeometry(0.06, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: CROSSHAIR_COLOR, depthTest: false });
    this.dot = new THREE.Mesh(dotGeo, dotMat);
    this.group.add(this.dot);

    scene.add(this.group);
  }

  update(worldX: number, worldY: number, visible: boolean): void {
    this.group.visible = visible;
    this.group.position.x = worldX;
    this.group.position.y = worldY;
  }
}
