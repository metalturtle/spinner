import * as THREE from 'three';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HpBar {
  bg:   THREE.Mesh;
  fill: THREE.Mesh;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createHpBar(width: number, height: number, yOffset: number): HpBar {
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: 0x330000, depthTest: false })
  );
  bg.rotation.x = -Math.PI / 2;
  bg.position.y = yOffset;

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: 0x00cc44, depthTest: false })
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = yOffset + 0.01;

  return { bg, fill };
}

// ─── Update ──────────────────────────────────────────────────────────────────

/** Scale fill bar and keep it left-aligned. halfWidth = plane width / 2. */
export function updateHpBar(fill: THREE.Mesh, fraction: number, halfWidth: number): void {
  fill.scale.x    = Math.max(0.001, fraction);
  fill.position.x = -(1 - fraction) * halfWidth;
}
