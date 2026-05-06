import * as THREE from 'three';
import { lvPos, type LevelEntity } from './levelLoader';
import { registerTopDownCullable } from './sceneCulling';
import { getLightsDisabled } from './settings';
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
  unregisterCull: () => void;
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
  const pos = lvPos(entity.position);
  const poleHeight = parseNumber(props.poleHeight, 1.55, 0.6);
  const flameHeight = parseNumber(props.height, poleHeight + 0.28, 0.4);
  const flameSize = parseNumber(props.flameSize, 0.22, 0.08);
  const color = parseColor(props.color, '#ff9a3c');
  const intensity = parseNumber(props.intensity, 3.4, 0);
  const range = parseNumber(props.range, 9.5, 0.5);
  const decay = parseNumber(props.decay, 1.6, 0);

  const root = new THREE.Group();
  root.position.set(pos.x, 0, pos.z);

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

  // Parent the PointLight to the scene (not to `root`) so the camera-frustum
  // cull on `root` doesn't toggle light.visible. Toggling light visibility
  // changes Three's NUM_POINT_LIGHTS define and forces every lit material to
  // recompile its shader — that was the source of the traversal stutter.
  const light = new THREE.PointLight(color, intensity, range, decay);
  light.position.set(pos.x, flameHeight, pos.z);
  scene.add(light);

  scene.add(root);
  const unregisterCull = registerTopDownCullable(root, range);

  registerEmberPointEmitter({
    id: entity.id,
    position: { x: pos.x, y: flameHeight, z: pos.z },
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
    unregisterCull,
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

  // The light stays in the scene (parented to scene, not torch.root) so its
  // visibility — and therefore Three's NUM_POINT_LIGHTS define — never changes.
  // When the torch's visual is culled, drive intensity to 0 instead.
  if (torch.root.visible && !getLightsDisabled()) {
    torch.light.intensity = torch.baseIntensity * (0.82 + flicker * 0.38);
    torch.light.distance = torch.baseRange * (0.9 + flicker * 0.16);
  } else {
    torch.light.intensity = 0;
  }

  const worldPos = new THREE.Vector3();
  torch.flameRoot.getWorldPosition(worldPos);
  updateEmberPointEmitter(torch.id, { x: worldPos.x, y: worldPos.y, z: worldPos.z });
}

export function destroyFireTorch(scene: THREE.Scene, torch: FireTorch): void {
  unregisterEmberPointEmitter(torch.id);
  torch.unregisterCull();
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
  // Light is parented directly to the scene now, so remove it explicitly.
  scene.remove(torch.light);
}
