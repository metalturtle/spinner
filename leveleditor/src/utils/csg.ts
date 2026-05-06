import polygonClipping from 'polygon-clipping';
import type { Polygon, MultiPolygon } from 'polygon-clipping';
import type { PolygonData } from '../data/Polygon';
import type { PolygonLayer } from '../data/Polygon';
import { generateId } from './ids';

export type BooleanOp = 'union' | 'difference' | 'intersection';

function toClipperPolygon(poly: PolygonData): Polygon {
  const rings: [number, number][][] = [
    poly.vertices.map((v) => [v.x, v.y]),
  ];

  for (const hole of poly.holes ?? []) {
    rings.push(hole.map((v) => [v.x, v.y]));
  }

  return rings;
}

function fromClipperResult(
  multiPoly: MultiPolygon,
  baseName: string,
  layer: PolygonLayer,
  color: string,
  properties: Record<string, string>,
  textureId?: string
): PolygonData[] {
  return multiPoly.map((polygon, i) => {
    const [exterior, ...holes] = polygon;
    return {
      id: generateId('poly'),
      name: multiPoly.length === 1 ? baseName : `${baseName} ${i + 1}`,
      layer,
      vertices: exterior.map(([x, y]) => ({ x, y })),
      holes: holes.length > 0 ? holes.map((hole) => hole.map(([x, y]) => ({ x, y }))) : undefined,
      properties: { ...properties },
      color,
      textureId,
    };
  });
}

export function performBooleanOp(
  op: BooleanOp,
  polyA: PolygonData,
  polyB: PolygonData
): PolygonData[] {
  const a = toClipperPolygon(polyA);
  const b = toClipperPolygon(polyB);

  let result: MultiPolygon;
  switch (op) {
    case 'union':
      result = polygonClipping.union(a, b);
      break;
    case 'difference':
      result = polygonClipping.difference(a, b);
      break;
    case 'intersection':
      result = polygonClipping.intersection(a, b);
      break;
  }

  const opLabel = op === 'union' ? '+' : op === 'difference' ? '-' : '&';
  const baseName = `${polyA.name} ${opLabel} ${polyB.name}`;

  return fromClipperResult(result, baseName, polyA.layer, polyA.color, { ...polyA.properties }, polyA.textureId);
}
