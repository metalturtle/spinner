// ─── Level Data Types ────────────────────────────────────────────────────────

export interface LevelEntity {
  id:          string;
  name?:       string;
  type:        string;
  position:    { x: number; y: number };
  rotation?:   number;
  properties?: Record<string, unknown>;
}

export interface LevelPolygon {
  id:          string;
  name?:       string;
  layer?:      'floor' | 'wall' | 'trigger' | 'decoration';
  vertices:    { x: number; y: number }[];
  holes?:      { x: number; y: number }[][];
  properties?: Record<string, unknown>;
  color?:      string;
  textureId?:  string;
  textureScale?: number;
  useReliefMap?: boolean;
}

export interface LevelCircle {
  id:          string;
  name?:       string;
  layer?:      'floor' | 'wall' | 'trigger' | 'decoration';
  center:      { x: number; y: number };
  radius:      number;
  properties?: Record<string, unknown>;
  color?:      string;
  textureId?:  string;
  textureScale?: number;
  useReliefMap?: boolean;
}

export interface LevelData {
  version:   number;
  unit?:     string;
  gridSize:  number;
  polygons?: LevelPolygon[];
  circles?:  LevelCircle[];
  entities:  LevelEntity[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert level 2D position {x,y} to game world {x,z}. */
export function lvPos(p: { x: number; y: number }): { x: number; z: number } {
  return { x: p.x, z: p.y };
}
