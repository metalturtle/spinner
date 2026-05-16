import * as THREE from 'three';
import { scene } from './renderer';

const textureLoader = new THREE.TextureLoader();
const cloudyTextureUrl = new URL('../../water/public/cloudy.jpeg', import.meta.url).href;

let initialized = false;

export function initSpaceBackground(): void {
  if (initialized) return;
  initialized = true;

  const texture = textureLoader.load(cloudyTextureUrl);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  scene.background = texture;
}

export function updateSpaceBackground(_time: number): void {
  // Skybox is static for now; keep the function to preserve the existing call site.
}
