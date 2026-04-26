import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { getTextureDefinition } from './textureLibrary';

export function getTextureScale(textureId?: string, sizeMultiplier?: number): number | null {
  const texture = getTextureDefinition(textureId);
  if (!texture) return null;

  const multiplier = sizeMultiplier && sizeMultiplier > 0 ? sizeMultiplier : 1;
  return texture.worldScale * multiplier;
}

export function applyWorldUVs(
  geometry: THREE.BufferGeometry,
  scale: number,
  offsetX = 0,
  offsetY = 0
): void {
  const position = geometry.getAttribute('position');
  const uvs = new Float32Array(position.count * 2);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + offsetX;
    const y = position.getY(i) + offsetY;
    uvs[i * 2] = x / scale;
    uvs[i * 2 + 1] = y / scale;
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

export function applyWallExtrusionUVs(
  geometry: THREE.BufferGeometry,
  scale: number
): void {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uvs = new Float32Array(position.count * 2);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);

    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));

    if (nz >= nx && nz >= ny) {
      uvs[i * 2] = x / scale;
      uvs[i * 2 + 1] = y / scale;
      continue;
    }

    if (nx >= ny) {
      uvs[i * 2] = y / scale;
      uvs[i * 2 + 1] = z / scale;
      continue;
    }

    uvs[i * 2] = x / scale;
    uvs[i * 2 + 1] = z / scale;
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

export class TextureManager {
  private static cache = new Map<string, THREE.Texture>();
  private static loader = new THREE.TextureLoader();
  private static exrLoader = new EXRLoader();

  private static load(src: string, isColor: boolean): THREE.Texture {
    const cacheKey = `${isColor ? 'color' : 'data'}:${src}`;
    const existing = this.cache.get(cacheKey);
    if (existing) return existing;

    const isExr = src.toLowerCase().endsWith('.exr');
    const loader = isExr ? this.exrLoader : this.loader;
    const texture = loader.load(src);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = isExr ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = !isExr;
    texture.needsUpdate = true;
    this.cache.set(cacheKey, texture);
    return texture;
  }

  static get(textureId?: string): THREE.Texture | null {
    const definition = getTextureDefinition(textureId);
    if (!definition) return null;
    return this.load(definition.src, true);
  }

  static getNormal(textureId?: string, enabled?: boolean): THREE.Texture | null {
    if (!enabled) return null;
    const definition = getTextureDefinition(textureId);
    if (!definition?.normalSrc) return null;
    if (definition.normalSrc.toLowerCase().endsWith('.exr')) return null;
    return this.load(definition.normalSrc, false);
  }

  static getBump(textureId?: string, enabled?: boolean): THREE.Texture | null {
    if (!enabled) return null;
    const definition = getTextureDefinition(textureId);
    if (!definition?.bumpSrc) return null;
    return this.load(definition.bumpSrc, false);
  }
}
