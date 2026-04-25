import sharedTextures from 'virtual:shared-textures';

export interface TextureDefinition {
  id: string;
  name: string;
  src: string;
  worldScale: number;
}

function toTextureDefinition(textureId: string, src: string): TextureDefinition {
  return {
    id: textureId,
    name: humanizeTextureName(textureId),
    src,
    worldScale: 4,
  };
}

function humanizeTextureName(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export const TEXTURE_LIBRARY: TextureDefinition[] = sharedTextures
  .map((texture) => toTextureDefinition(texture.id, texture.src))
  .sort((a, b) => a.name.localeCompare(b.name));

export function getTextureDefinition(textureId?: string): TextureDefinition | undefined {
  if (!textureId) return undefined;
  return TEXTURE_LIBRARY.find((texture) => texture.id === textureId);
}
