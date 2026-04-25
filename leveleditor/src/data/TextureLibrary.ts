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

type TextureKind = 'base' | 'normal' | 'bump' | 'roughness' | 'other';

interface SharedTextureEntry {
  id: string;
  src: string;
}

function toTextureDefinition(textureId: string, src: string, normalSrc?: string, bumpSrc?: string): TextureDefinition {
  return {
    id: textureId,
    name: humanizeTextureName(textureId),
    src,
    worldScale: 4,
    normalSrc,
    bumpSrc,
    hasRelief: Boolean(normalSrc || bumpSrc),
  };
}

function parseTextureName(name: string): { family: string; kind: TextureKind } {
  const patterns: Array<{ regex: RegExp; kind: TextureKind }> = [
    { regex: /(?:^|_)(diff|albedo|basecolor)(?:_|$)/i, kind: 'base' },
    { regex: /(?:^|_)(nor_gl|normalgl|normal|nor)(?:_|$)/i, kind: 'normal' },
    { regex: /(?:^|_)(disp|height|bump)(?:_|$)/i, kind: 'bump' },
    { regex: /(?:^|_)(rough)(?:_|$)/i, kind: 'roughness' },
  ];

  for (const { regex, kind } of patterns) {
    const match = name.match(regex);
    if (!match) continue;
    const family = name.replace(match[0], '_').replace(/__+/g, '_').replace(/^_+|_+$/g, '');
    return { family, kind };
  }

  return { family: name, kind: 'other' };
}

function humanizeTextureName(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export const TEXTURE_LIBRARY: TextureDefinition[] = (() => {
  const families = new Map<string, { base?: SharedTextureEntry; normal?: SharedTextureEntry; bump?: SharedTextureEntry }>();

  for (const texture of sharedTextures as SharedTextureEntry[]) {
    const parsed = parseTextureName(texture.id);
    const entry = families.get(parsed.family) ?? {};
    if (parsed.kind === 'base') entry.base = texture;
    else if (parsed.kind === 'normal') entry.normal = texture;
    else if (parsed.kind === 'bump') entry.bump = texture;
    families.set(parsed.family, entry);
  }

  return Array.from(families.values())
    .filter((entry): entry is { base: SharedTextureEntry; normal?: SharedTextureEntry; bump?: SharedTextureEntry } => Boolean(entry.base))
    .map((entry) => toTextureDefinition(entry.base.id, entry.base.src, entry.normal?.src, entry.bump?.src))
    .sort((a, b) => a.name.localeCompare(b.name));
})();

export function getTextureDefinition(textureId?: string): TextureDefinition | undefined {
  if (!textureId) return undefined;
  return TEXTURE_LIBRARY.find((texture) => texture.id === textureId);
}
