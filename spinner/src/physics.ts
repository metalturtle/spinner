import { RESTITUTION } from './constants';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  z: number;
}

export interface Collidable {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  mass: number;
  isStatic: boolean;
  rpm: number;         // current RPM
  rpmCapacity: number; // spinner's power level — effective mass uses rpm / rpmCapacity
  heatFactor: number;  // damage multiplier (1.0 = normal, >1 = dangerous enemy)
}

export interface Segment {
  p1: Vec2;
  p2: Vec2;
}

export interface FloorZone {
  minX?: number;
  maxX?: number;
  minZ?: number;
  maxZ?: number;
  vertices?: Vec2[];
  holes?: Vec2[][];
  drainRate: number; // RPM drained per second while inside
}

export interface CircleHit {
  i: number;          // index of first collidable
  j: number;          // index of second collidable
  impactForce: number; // magnitude of relative velocity along normal at impact
}

export interface WallHit {
  collidableIndex: number;
  contactPoint:    Vec2;     // closest point on the wall segment
  normal:          Vec2;     // outward normal from wall surface
  impactSpeed:     number;   // velocity component into wall (0 = positional correction only)
}

// ─── Shared State ────────────────────────────────────────────────────────────

export const collidables: Collidable[] = [];
export const walls: Segment[] = [];
export const zones: FloorZone[] = [];

// ─── Circle ↔ Segment ────────────────────────────────────────────────────────

/** Resolve a circle-segment collision. Returns wall hit data, or null if no collision. */
export function resolveCircleSegment(c: Collidable, seg: Segment, index: number): WallHit | null {
  const dx = seg.p2.x - seg.p1.x;
  const dz = seg.p2.z - seg.p1.z;
  const segLenSq = dx * dx + dz * dz;
  if (segLenSq === 0) return null;

  const t = Math.max(0, Math.min(1,
    ((c.pos.x - seg.p1.x) * dx + (c.pos.z - seg.p1.z) * dz) / segLenSq
  ));

  const closestX = seg.p1.x + t * dx;
  const closestZ = seg.p1.z + t * dz;

  const nx = c.pos.x - closestX;
  const nz = c.pos.z - closestZ;
  const dist = Math.sqrt(nx * nx + nz * nz);

  if (dist >= c.radius || dist === 0) return null;

  const invDist = 1 / dist;
  const normalX = nx * invDist;
  const normalZ = nz * invDist;

  const penetration = c.radius - dist;
  c.pos.x += normalX * penetration;
  c.pos.z += normalZ * penetration;

  const contact = { x: closestX, z: closestZ };
  const wallNormal = { x: normalX, z: normalZ };

  const velDotN = c.vel.x * normalX + c.vel.z * normalZ;
  if (velDotN >= 0) {
    return { collidableIndex: index, contactPoint: contact, normal: wallNormal, impactSpeed: 0 };
  }

  c.vel.x -= (1 + RESTITUTION) * velDotN * normalX;
  c.vel.z -= (1 + RESTITUTION) * velDotN * normalZ;
  return { collidableIndex: index, contactPoint: contact, normal: wallNormal, impactSpeed: Math.abs(velDotN) };
}

// ─── Circle ↔ Circle ─────────────────────────────────────────────────────────

/**
 * Resolves a circle-circle collision.
 * Positional separation uses true mass to prevent tunnelling.
 * Impulse uses RPM-weighted effective mass: high RPM = harder hits.
 * RPM fraction is relative to each body's own rpmCapacity, so high-capacity
 * spinners at their soft cap hit just as hard as low-capacity ones at theirs.
 * Returns the impact force (relative velocity along normal), or 0 if no collision.
 */
export function resolveCircleCircle(a: Collidable, b: Collidable): number {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const distSq = dx * dx + dz * dz;
  const minDist = a.radius + b.radius;

  if (distSq >= minDist * minDist || distSq === 0) return 0;

  const dist = Math.sqrt(distSq);
  const invDist = 1 / dist;
  const nx = dx * invDist;
  const nz = dz * invDist;

  // Positional separation — uses true mass
  const penetration = minDist - dist;
  if (a.isStatic && b.isStatic) return 0;

  if (a.isStatic) {
    b.pos.x += nx * penetration;
    b.pos.z += nz * penetration;
  } else if (b.isStatic) {
    a.pos.x -= nx * penetration;
    a.pos.z -= nz * penetration;
  } else {
    const totalMass = a.mass + b.mass;
    a.pos.x -= nx * penetration * (b.mass / totalMass);
    a.pos.z -= nz * penetration * (b.mass / totalMass);
    b.pos.x += nx * penetration * (a.mass / totalMass);
    b.pos.z += nz * penetration * (a.mass / totalMass);
  }

  // Relative velocity along normal
  const relVelX = a.vel.x - b.vel.x;
  const relVelZ = a.vel.z - b.vel.z;
  const relVelDotN = relVelX * nx + relVelZ * nz;
  if (relVelDotN <= 0) return 0;

  const impactForce = Math.abs(relVelDotN);

  // Impulse — RPM-weighted effective mass: 20% base + 80% from rpm / rpmCapacity
  const rpmFracA = Math.max(0.01, a.rpm) / a.rpmCapacity;
  const rpmFracB = Math.max(0.01, b.rpm) / b.rpmCapacity;
  const effMassA = a.mass * (0.2 + 0.8 * rpmFracA);
  const effMassB = b.mass * (0.2 + 0.8 * rpmFracB);

  let invEffMassSum = 0;
  if (!a.isStatic) invEffMassSum += 1 / effMassA;
  if (!b.isStatic) invEffMassSum += 1 / effMassB;

  const j = -(1 + RESTITUTION) * relVelDotN / invEffMassSum;

  if (!a.isStatic) { a.vel.x += (j / effMassA) * nx; a.vel.z += (j / effMassA) * nz; }
  if (!b.isStatic) { b.vel.x -= (j / effMassB) * nx; b.vel.z -= (j / effMassB) * nz; }

  return impactForce;
}

// ─── Run All Collisions ──────────────────────────────────────────────────────

/** Runs all collision checks. collidables[0] is always treated as the player. */
export function runCollisions(): { wallHits: WallHit[]; circleHits: CircleHit[] } {
  const wallHits: WallHit[] = [];
  const circleHits: CircleHit[] = [];

  // All collidables vs walls
  for (let i = 0; i < collidables.length; i++) {
    for (const seg of walls) {
      const wh = resolveCircleSegment(collidables[i], seg, i);
      if (wh) wallHits.push(wh);
    }
  }

  // Circle ↔ Circle
  for (let i = 0; i < collidables.length; i++) {
    for (let j = i + 1; j < collidables.length; j++) {
      const impactForce = resolveCircleCircle(collidables[i], collidables[j]);
      if (impactForce > 0) circleHits.push({ i, j, impactForce });
    }
  }

  return { wallHits, circleHits };
}

/** Check if any wall hit belongs to the player (index 0). */
export function hasPlayerWallHit(wallHits: WallHit[]): boolean {
  return wallHits.some(wh => wh.collidableIndex === 0);
}

// ─── Hit Lookup ──────────────────────────────────────────────────────────────

/** Find the first circleHit where the player (index 0) collided with a specific collidable. */
export function findPlayerHit(circleHits: CircleHit[], target: Collidable): CircleHit | null {
  for (const hit of circleHits) {
    const playerIsA = hit.i === 0;
    const playerIsB = hit.j === 0;
    if (!playerIsA && !playerIsB) continue;
    const enemyIdx = playerIsA ? hit.j : hit.i;
    if (collidables[enemyIdx] === target) return hit;
  }
  return null;
}

function isPointInPolygon(point: Vec2, vertices: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const zi = vertices[i].z;
    const xj = vertices[j].x;
    const zj = vertices[j].z;
    const intersects = ((zi > point.z) !== (zj > point.z))
      && (point.x < ((xj - xi) * (point.z - zi)) / ((zj - zi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isPointInFloorZone(point: Vec2, zone: FloorZone): boolean {
  if (zone.vertices && zone.vertices.length >= 3) {
    if (!isPointInPolygon(point, zone.vertices)) return false;
    for (const hole of zone.holes ?? []) {
      if (hole.length >= 3 && isPointInPolygon(point, hole)) return false;
    }
    return true;
  }

  return (
    point.x >= (zone.minX ?? Infinity * -1) && point.x <= (zone.maxX ?? Infinity) &&
    point.z >= (zone.minZ ?? Infinity * -1) && point.z <= (zone.maxZ ?? Infinity)
  );
}
