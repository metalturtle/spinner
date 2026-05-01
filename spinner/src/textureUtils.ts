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
  private static pending = new Map<string, Promise<THREE.Texture>>();
  private static loader = new THREE.TextureLoader();
  private static exrLoader = new EXRLoader();

  private static configureTexture(texture: THREE.Texture, isColor: boolean, isExr: boolean): THREE.Texture {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = isExr ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = !isExr;
    texture.needsUpdate = true;
    return texture;
  }

  private static load(src: string, isColor: boolean): THREE.Texture {
    const cacheKey = `${isColor ? 'color' : 'data'}:${src}`;
    const existing = this.cache.get(cacheKey);
    if (existing) return existing;

    const isExr = src.toLowerCase().endsWith('.exr');
    const loader = isExr ? this.exrLoader : this.loader;
    const texture = this.configureTexture(loader.load(src), isColor, isExr);
    this.cache.set(cacheKey, texture);
    return texture;
  }

  private static async preload(src: string, isColor: boolean): Promise<THREE.Texture> {
    const cacheKey = `${isColor ? 'color' : 'data'}:${src}`;
    const existing = this.cache.get(cacheKey);
    if (existing) return existing;

    const pending = this.pending.get(cacheKey);
    if (pending) return pending;

    const isExr = src.toLowerCase().endsWith('.exr');
    const loader = isExr ? this.exrLoader : this.loader;
    const promise = loader.loadAsync(src).then((texture) => {
      const configured = this.configureTexture(texture, isColor, isExr);
      this.cache.set(cacheKey, configured);
      this.pending.delete(cacheKey);
      return configured;
    }).catch((error) => {
      console.log("pre load error", error, src)
      this.pending.delete(cacheKey);
      throw error;
    });
    this.pending.set(cacheKey, promise);
    return promise;
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
    return this.load(definition.normalSrc, false);
  }

  static getBump(textureId?: string, enabled?: boolean): THREE.Texture | null {
    if (!enabled) return null;
    const definition = getTextureDefinition(textureId);
    if (!definition?.bumpSrc) return null;
    return this.load(definition.bumpSrc, false);
  }

  static async preloadTextureSet(textureId?: string, useReliefMap = false): Promise<void> {
    console.log("textureId: ", textureId);
    const definition = getTextureDefinition(textureId);
    if (!definition) return;

    await this.preload(definition.src, true);
    if (!useReliefMap) return;

    const extraLoads: Promise<THREE.Texture>[] = [];
    if (definition.normalSrc) {
      extraLoads.push(this.preload(definition.normalSrc, false));
    }
    if (definition.bumpSrc) {
      extraLoads.push(this.preload(definition.bumpSrc, false));
    }
    await Promise.all(extraLoads);
  }
}
