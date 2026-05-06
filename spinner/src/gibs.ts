import * as THREE from 'three';
import { scene } from './renderer';

const GRAVITY = 15.5;

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

function spawnGibPiece(
  mesh: THREE.Mesh,
  pos: { x: number; z: number },
  speedMin: number,
  speedRange: number,
  upMin: number,
  upRange: number,
  lifetimeMin: number,
  lifetimeRange: number,
): void {
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
  const speed = speedMin + Math.random() * speedRange;
  gibs.push({
    mesh,
    velocity: new THREE.Vector3(
      Math.cos(angle) * speed,
      upMin + Math.random() * upRange,
      Math.sin(angle) * speed,
    ),
    angularVelocity: new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
    ),
    elapsed: 0,
    lifetime: lifetimeMin + Math.random() * lifetimeRange,
    grounded: false,
    alive: true,
  });
}

function spawnZombieBodyParts(pos: { x: number; z: number }): void {
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xb79c86,
    roughness: 0.9,
    metalness: 0.0,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0x4e4237,
    roughness: 0.86,
    metalness: 0.03,
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), skinMat);
  spawnGibPiece(head, pos, 4.6, 4.4, 9.8, 5.1, 4.6, 1.8);

  // Arms (limbs)
  for (let i = 0; i < 2; i++) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.74, 6, 12), clothMat.clone());
    spawnGibPiece(arm, pos, 4.1, 3.9, 9.2, 4.6, 4.2, 1.7);
  }

  // Legs
  for (let i = 0; i < 2; i++) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.08, 8, 14), clothMat.clone());
    spawnGibPiece(leg, pos, 3.6, 3.5, 8.7, 4.3, 4.8, 1.9);
  }
}

export function spawnZombieGibs(pos: { x: number; z: number }, count: number): void {
  spawnZombieBodyParts(pos);
  for (let i = 0; i < count; i++) {
    const size = 0.08 + Math.random() * 0.16;
    const geometry = new THREE.IcosahedronGeometry(size, 0);
    const material = makeGibMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    spawnGibPiece(mesh, pos, 2.5, 5.5, 3.5, 4.0, 1.6, 0.8);
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

/**
 * Add dummy gib meshes to the scene so renderer.compileAsync at level load
 * picks up their MeshStandardMaterial shader programs. Without this, the
 * first gib spawn at gameplay-time triggers a multi-second compile stall.
 * Returns a disposer that removes the dummies once compilation is done.
 */
export function prewarmGibMaterials(): () => void {
  const meshes: THREE.Mesh[] = [];
  const farY = -200;

  // Skin (head sphere)
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xb79c86, roughness: 0.9, metalness: 0.0 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), skinMat);
  head.position.set(0, farY, 0);
  head.castShadow = true;
  scene.add(head);
  meshes.push(head);

  // Cloth (arm/leg capsule — both use clothMat.clone() in spawnZombieBodyParts)
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x4e4237, roughness: 0.86, metalness: 0.03 });
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.74, 6, 12), clothMat);
  arm.position.set(0, farY, 0);
  arm.castShadow = true;
  scene.add(arm);
  meshes.push(arm);

  // Generic gib chunk (icosahedron, makeGibMaterial-style)
  const chunkMat = new THREE.MeshStandardMaterial({ color: 0xaa3322, roughness: 0.88, metalness: 0.02 });
  const chunk = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), chunkMat);
  chunk.position.set(0, farY, 0);
  chunk.castShadow = true;
  scene.add(chunk);
  meshes.push(chunk);

  return () => {
    // Keep the materials alive (push to keepAlive) so their shader stages
    // stay in WebGLShaderCache and the compiled programs in WebGLPrograms.
    // Calling material.dispose() here would evict the shader stage and the
    // next gib spawn would compile its program from scratch.
    for (const m of meshes) {
      scene.remove(m);
      m.geometry.dispose();
      keepAlive.push(m.material as THREE.Material);
    }
  };
}

const keepAlive: THREE.Material[] = [];
