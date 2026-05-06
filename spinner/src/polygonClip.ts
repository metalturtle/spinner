// Sutherland-Hodgman polygon clipping against an axis-aligned rectangle.
// Used at level load to split walls and floors at chunk boundaries so each
// chunk only owns the geometry that physically lives inside it — no
// duplication, no overdraw, and chunks far from the camera get culled
// without leaving "holes" where long polygons used to span.
//
// All math is in 2D; the caller is responsible for matching coordinate
// systems (level XY in this codebase).

export interface Vec2 { x: number; y: number }
export interface Rect { minX: number; maxX: number; minY: number; maxY: number }

type Inside = (p: Vec2) => boolean;
type Intersect = (a: Vec2, b: Vec2) => Vec2;

function clipAgainstEdge(poly: Vec2[], inside: Inside, intersect: Intersect): Vec2[] {
  if (poly.length === 0) return poly;
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out;
}

/**
 * Clip a polygon (closed, vertex order preserved) against an axis-aligned
 * rectangle. Result is the intersection — possibly empty, possibly with new
 * vertices inserted on the rectangle's edges. Self-intersection-free as
 * long as the input polygon is simple.
 */
export function clipPolygonToRect(poly: Vec2[], rect: Rect): Vec2[] {
  let result = poly;
  // minX edge — keep points with x >= minX
  result = clipAgainstEdge(
    result,
    (p) => p.x >= rect.minX,
    (a, b) => {
      const t = (rect.minX - a.x) / (b.x - a.x);
      return { x: rect.minX, y: a.y + t * (b.y - a.y) };
    },
  );
  // maxX edge — keep points with x <= maxX
  result = clipAgainstEdge(
    result,
    (p) => p.x <= rect.maxX,
    (a, b) => {
      const t = (rect.maxX - a.x) / (b.x - a.x);
      return { x: rect.maxX, y: a.y + t * (b.y - a.y) };
    },
  );
  // minY edge
  result = clipAgainstEdge(
    result,
    (p) => p.y >= rect.minY,
    (a, b) => {
      const t = (rect.minY - a.y) / (b.y - a.y);
      return { x: a.x + t * (b.x - a.x), y: rect.minY };
    },
  );
  // maxY edge
  result = clipAgainstEdge(
    result,
    (p) => p.y <= rect.maxY,
    (a, b) => {
      const t = (rect.maxY - a.y) / (b.y - a.y);
      return { x: a.x + t * (b.x - a.x), y: rect.maxY };
    },
  );
  return result;
}

/** Bounding box of a polygon. Returns null for empty input. */
export function polygonBbox(poly: Vec2[]): Rect | null {
  if (poly.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const v of poly) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  return { minX, maxX, minY, maxY };
}

/** Test whether two AABBs overlap (touching counts as not overlapping). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.maxX > b.minX && a.minX < b.maxX
    && a.maxY > b.minY && a.minY < b.maxY;
}

/** Whether `inner` is fully contained in `outer`. */
export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX
    && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

/** Absolute polygon area via the shoelace formula. Used to drop degenerate
 *  zero-area clip results that would otherwise produce empty meshes. */
export function polygonAreaAbs(poly: Vec2[]): number {
  if (poly.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) * 0.5;
}

/** Tessellate a circle into a closed polygon with `segments` vertices.
 *  Used to convert circular floors into something the clipper can handle. */
export function circleToPolygon(centerX: number, centerY: number, radius: number, segments: number): Vec2[] {
  const out: Vec2[] = new Array(segments);
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    out[i] = {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  }
  return out;
}
