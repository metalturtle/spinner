import type { PolygonLayer } from './Polygon';

export interface CircleData {
  id: string;
  name: string;
  layer: PolygonLayer;
  center: { x: number; y: number };
  radius: number;
  properties: Record<string, string>;
  color: string;
}
