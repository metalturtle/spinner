import type { LevelCircle, LevelData, LevelPolygon } from './levelLoader';

export interface TexturePreloadRequest {
  textureId: string;
  useReliefMap: boolean;
}

export interface LevelAssetManifest {
  textures: TexturePreloadRequest[];
  ambientTracks: string[];
  includesRobotAssets: boolean;
  includesZombieAssets: boolean;
  includesWaterRippleAssets: boolean;
}

function readAmbientTrack(properties: Record<string, unknown> | undefined): string | null {
  const keys = ['ambientTrack', 'ambientSound', 'musicTrack', 'musicSound'] as const;
  for (const key of keys) {
    const raw = properties?.[key];
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function collectTextureRequest(
  requests: Map<string, TexturePreloadRequest>,
  surface: LevelPolygon | LevelCircle,
): void {
  if (!surface.textureId) return;
  const existing = requests.get(surface.textureId);
  if (existing) {
    existing.useReliefMap = existing.useReliefMap || Boolean(surface.useReliefMap);
    return;
  }

  requests.set(surface.textureId, {
    textureId: surface.textureId,
    useReliefMap: Boolean(surface.useReliefMap),
  });
}

export function collectLevelAssetManifest(level: LevelData): LevelAssetManifest {
  const textureRequests = new Map<string, TexturePreloadRequest>();
  const ambientTracks = new Set<string>();
  let includesRobotAssets = false;
  let includesZombieAssets = false;
  let includesWaterRippleAssets = false;

  for (const poly of level.polygons ?? []) {
    collectTextureRequest(textureRequests, poly);
    const ambientTrack = readAmbientTrack(poly.properties);
    if (ambientTrack) ambientTracks.add(ambientTrack);
    if (poly.properties?.waterRippleEnabled === true || poly.properties?.waterRippleEnabled === 'true' || poly.properties?.waterRippleEnabled === '1') {
      includesWaterRippleAssets = true;
    }
  }

  for (const circle of level.circles ?? []) {
    collectTextureRequest(textureRequests, circle);
    const ambientTrack = readAmbientTrack(circle.properties);
    if (ambientTrack) ambientTracks.add(ambientTrack);
    if (circle.properties?.waterRippleEnabled === true || circle.properties?.waterRippleEnabled === 'true' || circle.properties?.waterRippleEnabled === '1') {
      includesWaterRippleAssets = true;
    }
  }

  for (const entity of level.entities) {
    switch (entity.type) {
      case 'robot':
      case 'octoboss':
        includesRobotAssets = true;
        break;
      case 'zombie':
        includesZombieAssets = true;
        break;
      case 'sliding_door':
        // Door panels render with the sci-fi tile texture; preload its base + normal map.
        if (!textureRequests.has('sci-fi')) {
          textureRequests.set('sci-fi', { textureId: 'sci-fi', useReliefMap: true });
        } else {
          const existing = textureRequests.get('sci-fi')!;
          existing.useReliefMap = true;
        }
        break;
    }
  }

  return {
    textures: [...textureRequests.values()].sort((a, b) => a.textureId.localeCompare(b.textureId)),
    ambientTracks: [...ambientTracks].sort((a, b) => a.localeCompare(b)),
    includesRobotAssets,
    includesZombieAssets,
    includesWaterRippleAssets,
  };
}
