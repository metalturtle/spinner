import sharedTextures from 'virtual:shared-textures';

export interface TextureDefinition {
  id: string;
  name: string;
  src: string;
  worldScale: number;
  normalSrc?: string;
  bumpSrc?: string;
  hasRelief: boolean;
}

type TextureKind = 'base' | 'normal' | 'ignored';

interface SharedTextureEntry {
  id: string;
  src: string;
}

function toTextureDefinition(textureId: string, src: string, normalSrc?: string): TextureDefinition {
  return {
    id: textureId,
    name: humanizeTextureName(textureId),
    src,
    worldScale: 4,
    normalSrc,
    hasRelief: Boolean(normalSrc),
  };
}

function parseTextureName(name: string): { family: string; kind: TextureKind } {
  const lowerName = name.toLowerCase();
  const normalSuffix = '_normal';
  const ignoredPattern = /(?:^|[_-])(ao|bump|diff|disp|displacement|height|metallic|nor|nor_gl|normalgl|rough|roughness|spec)(?:[_-]|$)/i;

  console.log("checking lower name", lowerName);
  if (lowerName.endsWith(normalSuffix)) {
    return {
      family: name.slice(0, -normalSuffix.length),
      kind: 'normal',
    };
  }

  if (ignoredPattern.test(name)) {
    return { family: name, kind: 'ignored' };
  }

  return { family: name, kind: 'base' };
}

function humanizeTextureName(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export const TEXTURE_LIBRARY: TextureDefinition[] = (() => {
  const families = new Map<string, { base?: SharedTextureEntry; normal?: SharedTextureEntry }>();

  for (const texture of sharedTextures as SharedTextureEntry[]) {
    console.log("shared texture: ", texture);
    const parsed = parseTextureName(texture.id);
    if (parsed.kind === 'ignored') continue;
    const entry = families.get(parsed.family) ?? {};
    if (parsed.kind === 'base') entry.base = texture;
    else if (parsed.kind === 'normal') entry.normal = texture;
    families.set(parsed.family, entry);
  }

  return Array.from(families.values())
    .filter((entry): entry is { base: SharedTextureEntry; normal?: SharedTextureEntry } => Boolean(entry.base))
    .map((entry) => toTextureDefinition(entry.base.id, entry.base.src, entry.normal?.src))
    .sort((a, b) => a.name.localeCompare(b.name));
})();

export function getTextureDefinition(textureId?: string): TextureDefinition | undefined {
  if (!textureId) return undefined;
  return TEXTURE_LIBRARY.find((texture) => texture.id === textureId);
}
