import * as THREE from 'three';
import { scene } from './renderer';

const GRAVITY = 18;

interface Gib {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  elapsed: number;
  lifetime: number;
  grounded: boolean;
  alive: boolean;
}

const gibs: Gib[] = [];

function makeGibMaterial(): THREE.MeshStandardMaterial {
  const color = new THREE.Color().setHSL(0.01 + Math.random() * 0.02, 0.7, 0.22 + Math.random() * 0.08);
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0.02,
  });
}

export function spawnZombieGibs(pos: { x: number; z: number }, count: number): void {
  for (let i = 0; i < count; i++) {
    const size = 0.08 + Math.random() * 0.16;
    const geometry = new THREE.IcosahedronGeometry(size, 0);
    const material = makeGibMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      pos.x + (Math.random() - 0.5) * 0.35,
      0.45 + Math.random() * 0.55,
      pos.z + (Math.random() - 0.5) * 0.35,
    );
    mesh.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );
    mesh.castShadow = true;
    scene.add(mesh);

    const angle = Math.random() * Math.PI * 2;
    const speed = 2.5 + Math.random() * 5.5;
    gibs.push({
      mesh,
      velocity: new THREE.Vector3(
        Math.cos(angle) * speed,
        3.5 + Math.random() * 4.0,
        Math.sin(angle) * speed,
      ),
      angularVelocity: new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
      ),
      elapsed: 0,
      lifetime: 1.6 + Math.random() * 0.8,
      grounded: false,
      alive: true,
    });
  }
}

export function updateGibs(delta: number): void {
  for (let i = gibs.length - 1; i >= 0; i--) {
    const gib = gibs[i];
    if (!gib.alive) continue;

    gib.elapsed += delta;

    if (!gib.grounded) {
      gib.velocity.y -= GRAVITY * delta;
      gib.mesh.position.addScaledVector(gib.velocity, delta);

      if (gib.mesh.position.y <= 0.06) {
        gib.mesh.position.y = 0.06;
        gib.velocity.x *= 0.45;
        gib.velocity.z *= 0.45;
        gib.velocity.y *= -0.18;
        if (Math.abs(gib.velocity.y) < 0.5) {
          gib.grounded = true;
          gib.velocity.set(0, 0, 0);
        }
      }
    }

    gib.mesh.rotation.x += gib.angularVelocity.x * delta;
    gib.mesh.rotation.y += gib.angularVelocity.y * delta;
    gib.mesh.rotation.z += gib.angularVelocity.z * delta;
    gib.angularVelocity.multiplyScalar(gib.grounded ? 0.88 : 0.98);

    if (gib.elapsed >= gib.lifetime) {
      gib.alive = false;
      scene.remove(gib.mesh);
      gib.mesh.geometry.dispose();
      if (gib.mesh.material instanceof THREE.Material) gib.mesh.material.dispose();
      gibs.splice(i, 1);
    }
  }
}

export function resetGibs(): void {
  for (const gib of gibs) {
    scene.remove(gib.mesh);
    gib.mesh.geometry.dispose();
    if (gib.mesh.material instanceof THREE.Material) gib.mesh.material.dispose();
  }
  gibs.length = 0;
}
