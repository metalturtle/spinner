import * as THREE from 'three';
import { camera } from './renderer';

const MAX_FLASHES = 36;
const BASE_DURATION = 0.08;
const DURATION_RANGE = 0.08;
const BASE_START_SCALE = 0.45;
const BASE_END_SCALE = 1.5;
const SCALE_RANGE = 1.7;

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;

varying vec2 vUv;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float radius = length(p);

  float core = 1.0 - smoothstep(0.0, 0.38, radius);
  float halo = 1.0 - smoothstep(0.18, 1.0, radius);
  float alpha = (core * 0.7 + halo * 0.5) * uOpacity;

  vec3 color = mix(uColor * 0.42, vec3(1.0, 0.98, 0.92), core * 0.72);
  gl_FragColor = vec4(color, alpha);
}
`;

interface ClashFlash {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  alive: boolean;
  elapsed: number;
  duration: number;
  startScale: number;
  endScale: number;
}

const flashes: ClashFlash[] = [];
let nextFlashIndex = 0;

function getReusableFlash(): ClashFlash {
  for (const flash of flashes) {
    if (!flash.alive) return flash;
  }

  const flash = flashes[nextFlashIndex];
  nextFlashIndex = (nextFlashIndex + 1) % flashes.length;
  return flash;
}

export function initClashFlashes(scene: THREE.Scene): void {
  if (flashes.length > 0) return;

  const geometry = new THREE.PlaneGeometry(1, 1);

  for (let i = 0; i < MAX_FLASHES; i++) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xffc874) },
        uOpacity: { value: 0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);

    flashes.push({
      mesh,
      material,
      alive: false,
      elapsed: 0,
      duration: BASE_DURATION,
      startScale: BASE_START_SCALE,
      endScale: BASE_END_SCALE,
    });
  }
}

export function emitClashFlash(
  point: { x: number; y: number; z: number },
  intensity: number,
): void {
  if (flashes.length === 0 || intensity <= 0) return;

  const clamped = Math.min(1, intensity);
  const flash = getReusableFlash();
  flash.alive = true;
  flash.elapsed = 0;
  flash.duration = BASE_DURATION + DURATION_RANGE * clamped;
  flash.startScale = BASE_START_SCALE + clamped * 0.2;
  flash.endScale = BASE_END_SCALE + clamped * SCALE_RANGE;
  flash.mesh.position.set(point.x, point.y + 0.06, point.z);
  flash.mesh.scale.setScalar(flash.startScale);
  flash.mesh.quaternion.copy(camera.quaternion);
  flash.material.uniforms.uOpacity.value = 0.95;
  flash.mesh.visible = true;
}

export function updateClashFlashes(delta: number): void {
  for (const flash of flashes) {
    if (!flash.alive) continue;

    flash.elapsed += delta;
    const t = flash.elapsed / flash.duration;
    if (t >= 1) {
      flash.alive = false;
      flash.mesh.visible = false;
      flash.material.uniforms.uOpacity.value = 0;
      continue;
    }

    const eased = 1 - Math.pow(1 - t, 3);
    const opacity = Math.pow(1 - t, 1.85);
    const scale = THREE.MathUtils.lerp(flash.startScale, flash.endScale, eased);

    flash.mesh.quaternion.copy(camera.quaternion);
    flash.mesh.scale.setScalar(scale);
    flash.material.uniforms.uOpacity.value = opacity;
  }
}

export function resetClashFlashes(): void {
  nextFlashIndex = 0;
  for (const flash of flashes) {
    flash.alive = false;
    flash.elapsed = 0;
    flash.mesh.visible = false;
    flash.material.uniforms.uOpacity.value = 0;
  }
}
