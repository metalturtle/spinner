import * as THREE from 'three';
import type { LevelEntity } from './levelLoader';
import {
  registerEmberPointEmitter,
  unregisterEmberPointEmitter,
  updateEmberPointEmitter,
} from './lavaEmbers';

export interface FireTorch {
  id: string;
  root: THREE.Group;
  flameRoot: THREE.Group;
  outerFlame: THREE.Mesh;
  innerFlame: THREE.Mesh;
  light: THREE.PointLight;
  emberHeight: number;
  baseIntensity: number;
  baseRange: number;
  seed: number;
}

function parseNumber(value: unknown, fallback: number, min?: number): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return min === undefined ? parsed : Math.max(min, parsed);
}

function parseColor(value: unknown, fallback: string): THREE.Color {
  try {
    return new THREE.Color(typeof value === 'string' && value.trim() ? value : fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

export function createFireTorch(scene: THREE.Scene, entity: LevelEntity): FireTorch {
  const props = entity.properties ?? {};
  const poleHeight = parseNumber(props.poleHeight, 1.55, 0.6);
  const flameHeight = parseNumber(props.height, poleHeight + 0.28, 0.4);
  const flameSize = parseNumber(props.flameSize, 0.22, 0.08);
  const color = parseColor(props.color, '#ff9a3c');
  const intensity = parseNumber(props.intensity, 3.4, 0);
  const range = parseNumber(props.range, 9.5, 0.5);
  const decay = parseNumber(props.decay, 1.6, 0);

  const root = new THREE.Group();
  root.position.set(entity.position.x, 0, entity.position.y);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.06, poleHeight, 10),
    new THREE.MeshStandardMaterial({ color: 0x5b3924, roughness: 0.95, metalness: 0.02 })
  );
  pole.position.y = poleHeight * 0.5;
  pole.castShadow = true;
  pole.receiveShadow = true;
  root.add(pole);

  const bracket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.085, 0.16, 12),
    new THREE.MeshStandardMaterial({ color: 0x2d2a26, roughness: 0.55, metalness: 0.45 })
  );
  bracket.position.y = flameHeight - 0.08;
  bracket.castShadow = true;
  root.add(bracket);

  const flameRoot = new THREE.Group();
  flameRoot.position.y = flameHeight;
  root.add(flameRoot);

  const outerFlame = new THREE.Mesh(
    new THREE.OctahedronGeometry(flameSize, 1),
    new THREE.MeshBasicMaterial({
      color: color.clone().offsetHSL(-0.01, 0.04, 0.08),
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  outerFlame.scale.set(0.95, 1.55, 0.95);
  flameRoot.add(outerFlame);

  const innerFlame = new THREE.Mesh(
    new THREE.OctahedronGeometry(flameSize * 0.62, 1),
    new THREE.MeshBasicMaterial({
      color: 0xffe3a0,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  innerFlame.position.y = 0.04;
  innerFlame.scale.set(0.78, 1.2, 0.78);
  flameRoot.add(innerFlame);

  const light = new THREE.PointLight(color, intensity, range, decay);
  light.position.y = flameHeight;
  root.add(light);

  scene.add(root);

  registerEmberPointEmitter({
    id: entity.id,
    position: { x: entity.position.x, y: flameHeight, z: entity.position.y },
    radius: flameSize * 0.9,
    heightJitter: flameSize * 0.9,
    surfaceEmissionRate: 24,
    flyingEmissionRate: 12,
  });

  return {
    id: entity.id,
    root,
    flameRoot,
    outerFlame,
    innerFlame,
    light,
    emberHeight: flameHeight,
    baseIntensity: intensity,
    baseRange: range,
    seed: Math.random() * Math.PI * 2,
  };
}

export function updateFireTorch(torch: FireTorch, time: number): void {
  const flickerA = Math.sin(time * 11.5 + torch.seed);
  const flickerB = Math.sin(time * 17.0 + torch.seed * 1.9);
  const flicker = 0.5 + 0.5 * (flickerA * 0.6 + flickerB * 0.4);

  torch.flameRoot.rotation.y = time * (0.7 + torch.seed * 0.08);
  torch.outerFlame.scale.set(
    0.92 + flicker * 0.18,
    1.4 + flicker * 0.48,
    0.92 + flicker * 0.18
  );
  torch.innerFlame.scale.set(
    0.72 + flicker * 0.12,
    1.05 + flicker * 0.28,
    0.72 + flicker * 0.12
  );
  torch.innerFlame.position.y = 0.03 + flicker * 0.06;

  torch.light.intensity = torch.baseIntensity * (0.82 + flicker * 0.38);
  torch.light.distance = torch.baseRange * (0.9 + flicker * 0.16);

  const worldPos = new THREE.Vector3();
  torch.flameRoot.getWorldPosition(worldPos);
  updateEmberPointEmitter(torch.id, { x: worldPos.x, y: worldPos.y, z: worldPos.z });
}

export function destroyFireTorch(scene: THREE.Scene, torch: FireTorch): void {
  unregisterEmberPointEmitter(torch.id);
  torch.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(material)) {
      for (const entry of material) entry.dispose();
    } else {
      material?.dispose();
    }
  });
  scene.remove(torch.root);
}
