import sharedTextures from 'virtual:shared-textures';

export interface TextureDefinition {
  id: string;
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

function parseTextureName(name: string): { family: string; kind: TextureKind } {
  const lowerName = name.toLowerCase();
  const normalSuffix = '_normal';
  const ignoredPattern = /(?:^|[_-])(ao|bump|diff|disp|displacement|height|metallic|nor|nor_gl|normalgl|rough|roughness|spec)(?:[_-]|$)/i;

  console.log("lowerName: ", lowerName)
  if (lowerName.match(normalSuffix)) {
    let ind = lowerName.indexOf(normalSuffix);
    console.log("checking normal map name: ", name.substring(0, ind));
    return {
      family: name.substring(0, ind),
      kind: 'normal',
    };
  }

  if (ignoredPattern.test(name)) {
    return { family: name, kind: 'ignored' };
  }

  return { family: name, kind: 'base' };
}

export const TEXTURE_LIBRARY: TextureDefinition[] = (() => {
  const families = new Map<string, { base?: SharedTextureEntry; normal?: SharedTextureEntry }>();

  console.log("initializing texture library")
  for (const texture of sharedTextures as SharedTextureEntry[]) {
    const parsed = parseTextureName(texture.id);
    if (parsed.kind === 'ignored') continue;
    const entry = families.get(parsed.family) ?? {};
    if (parsed.kind === 'base') entry.base = texture;
    else if (parsed.kind === 'normal') {
      entry.normal = texture;
    }
    families.set(parsed.family, entry);
  }

  console.log("validing normal texture: ", families.values());
  return Array.from(families.values())
    .filter((entry): entry is { base: SharedTextureEntry; normal?: SharedTextureEntry } => Boolean(entry.base))
    .map((entry) => ({
      id: entry.base.id,
      src: entry.base.src,
      worldScale: 4,
      normalSrc: entry.normal?.src,
      hasRelief: Boolean(entry.normal),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
})();

export function getTextureDefinition(textureId?: string): TextureDefinition | undefined {
  if (!textureId) return undefined;
  return TEXTURE_LIBRARY.find((texture) => texture.id === textureId);
}
