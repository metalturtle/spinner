export type PolygonLayer = 'floor' | 'wall' | 'trigger' | 'decoration';

export const LAYER_Z: Record<PolygonLayer, number> = {
  floor: 0.5,
  wall: 1,
  trigger: 1.5,
  decoration: 2,
};

export interface PolygonData {
  id: string;
  name: string;
  layer: PolygonLayer;
  vertices: { x: number; y: number }[];
  properties: Record<string, string>;
  color: string;
}
