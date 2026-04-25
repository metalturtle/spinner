import sharedTextures from 'virtual:shared-textures';

export interface TextureDefinition {
  id: string;
  src: string;
  worldScale: number;
}

export const TEXTURE_LIBRARY: TextureDefinition[] = sharedTextures
  .map((texture) => ({
    id: texture.id,
    src: texture.src,
    worldScale: 4,
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

export function getTextureDefinition(textureId?: string): TextureDefinition | undefined {
  if (!textureId) return undefined;
  return TEXTURE_LIBRARY.find((texture) => texture.id === textureId);
}
