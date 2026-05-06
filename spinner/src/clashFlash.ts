import * as THREE from 'three';

const MAX_FLASHES = 36;
const BASE_DURATION = 0.1;
const DURATION_RANGE = 0.12;
const BASE_START_SCALE = 1.5;
const BASE_END_SCALE = 4.0;
const SCALE_RANGE = 3.0;

interface ClashFlash {
  mesh: THREE.Sprite;
  material: THREE.SpriteMaterial;
  alive: boolean;
  elapsed: number;
  duration: number;
  startScale: number;
  endScale: number;
}

const flashes: ClashFlash[] = [];
let nextFlashIndex = 0;

function createFlashTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;

  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.0, 'rgba(255,255,245,1)');
  grad.addColorStop(0.18, 'rgba(255,244,210,0.98)');
  grad.addColorStop(0.45, 'rgba(255,210,120,0.78)');
  grad.addColorStop(0.78, 'rgba(255,150,35,0.22)');
  grad.addColorStop(1.0, 'rgba(255,120,0,0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

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

  const texture = createFlashTexture();

  for (let i = 0; i < MAX_FLASHES; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: 0xffcc72,
      opacity: 0,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    const mesh = new THREE.Sprite(material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 40;
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
  flash.startScale = BASE_START_SCALE + clamped * 0.75;
  flash.endScale = BASE_END_SCALE + clamped * SCALE_RANGE;
  flash.mesh.position.set(point.x, point.y + 0.8, point.z);
  flash.mesh.scale.set(flash.startScale, flash.startScale, 1);
  flash.material.opacity = 1.75;
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
      flash.material.opacity = 0;
      continue;
    }

    const eased = 1 - Math.pow(1 - t, 3);
    const opacity = Math.pow(1 - t, 1.85);
    const scale = THREE.MathUtils.lerp(flash.startScale, flash.endScale, eased);

    flash.mesh.scale.set(scale, scale, 1);
    flash.material.opacity = opacity * 1.75;
  }
}

export function resetClashFlashes(): void {
  nextFlashIndex = 0;
  for (const flash of flashes) {
    flash.alive = false;
    flash.elapsed = 0;
    flash.mesh.visible = false;
    flash.material.opacity = 0;
  }
}

