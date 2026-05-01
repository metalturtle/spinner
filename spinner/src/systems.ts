import { collidables, type Collidable, type Vec2, type CircleHit } from './physics';

// ─── Entity IDs ──────────────────────────────────────────────────────────────

let _nextId = 0;
export function nextEntityId(): number { return ++_nextId; }

// ─── Entity Update Registry (called in registration order) ──────────────────

interface UpdateEntry { id: number; fn: (delta: number) => void; }
const updates: UpdateEntry[] = [];

export function registerUpdate(id: number, fn: (delta: number) => void): void {
  updates.push({ id, fn });
}

export function entityUpdateSystem(delta: number): void {
  for (const e of updates) e.fn(delta);
}

// ─── Movement Registry ──────────────────────────────────────────────────────

interface MovementEntry {
  id: number;
  collidable: Collidable;
  maxSpeed:   number;
  friction:   number;
}
const movables: MovementEntry[] = [];

export function registerMovement(
  id: number, collidable: Collidable, maxSpeed: number, friction: number
): void {
  movables.push({ id, collidable, maxSpeed, friction });
}

export function setMovementMaxSpeed(id: number, maxSpeed: number): void {
  const entry = movables.find(m => m.id === id);
  if (entry) entry.maxSpeed = maxSpeed;
}

/** Apply friction, speed clamp, and position update for all registered movables. */
export function movementSystem(delta: number): void {
  for (const m of movables) {
    const c = m.collidable;
    if (c.enabled === false) {
      if (!c.prevPos) c.prevPos = { x: c.pos.x, z: c.pos.z };
      else {
        c.prevPos.x = c.pos.x;
        c.prevPos.z = c.pos.z;
      }
      c.vel.x = 0;
      c.vel.z = 0;
      continue;
    }
    if (!c.prevPos) c.prevPos = { x: c.pos.x, z: c.pos.z };
    else {
      c.prevPos.x = c.pos.x;
      c.prevPos.z = c.pos.z;
    }
    c.vel.x *= m.friction;
    c.vel.z *= m.friction;

    const speed = Math.sqrt(c.vel.x ** 2 + c.vel.z ** 2);
    if (speed > m.maxSpeed) {
      const s = m.maxSpeed / speed;
      c.vel.x *= s;
      c.vel.z *= s;
    }

    c.pos.x += c.vel.x * delta;
    c.pos.z += c.vel.z * delta;
  }
}

// ─── Collision Pair Registry (commutative) ──────────────────────────────────
//
// Pair handlers are registered once per type-pair (e.g. 'player:turret').
// The handler receives the collidables in the order they were registered.
// Multiple entities of the same type share the same handler — the handler
// uses the collidable reference to look up which specific entity was hit.

type CollisionHandler = (colA: Collidable, colB: Collidable, hit: CircleHit) => void;

interface CollisionPairEntry {
  typeA:   string;
  typeB:   string;
  handler: CollisionHandler;
}

const collidableTypes = new Map<Collidable, string>();
const collisionPairs  = new Map<string, CollisionPairEntry>();

function pairKey(a: string, b: string): string {
  return a <= b ? `${a}:${b}` : `${b}:${a}`;
}

/** Tag a collidable so the collision system knows its entity type. */
export function tagCollidable(collidable: Collidable, type: string): void {
  collidableTypes.set(collidable, type);
}

export function untagCollidable(collidable: Collidable): void {
  collidableTypes.delete(collidable);
}

export function getCollidableType(collidable: Collidable): string | undefined {
  return collidableTypes.get(collidable);
}

/** Register a handler for collisions between two entity types. Order-independent. */
export function registerCollisionPair(
  typeA: string, typeB: string, handler: CollisionHandler
): void {
  collisionPairs.set(pairKey(typeA, typeB), { typeA, typeB, handler });
}

/** Dispatch collision handlers for all circleHits. One loop, all pairs. */
export function collisionSystem(circleHits: CircleHit[]): void {
  for (const hit of circleHits) {
    const a  = collidables[hit.i];
    const b  = collidables[hit.j];
    const tA = collidableTypes.get(a);
    const tB = collidableTypes.get(b);
    if (!tA || !tB) continue;

    const entry = collisionPairs.get(pairKey(tA, tB));
    if (!entry) continue;

    // Deliver args in registration order (typeA first, typeB second)
    if (tA === entry.typeA) entry.handler(a, b, hit);
    else                    entry.handler(b, a, hit);
  }
}

// ─── Proximity Pair Registry (commutative) ──────────────────────────────────
//
// Proximity bodies are registered per type. The system checks all pairs of
// matching types and dispatches to the handler. Unlike collision, proximity
// is a simple distance check — no physics resolution.

export interface ProximityBody {
  pos:    Vec2;
  radius: number;
  active: boolean;
  owner:  unknown;   // back-reference to owning entity (cast by handler)
}

interface ProximityPairEntry {
  typeA:   string;
  typeB:   string;
  handler: (a: ProximityBody, b: ProximityBody) => void;
}

const proximityBodies = new Map<string, ProximityBody[]>();
const proximityPairs  = new Map<string, ProximityPairEntry>();

export function registerProximityBody(type: string, body: ProximityBody): void {
  let list = proximityBodies.get(type);
  if (!list) { list = []; proximityBodies.set(type, list); }
  list.push(body);
}

export function deregisterProximityBody(type: string, body: ProximityBody): void {
  const list = proximityBodies.get(type);
  if (!list) return;
  const idx = list.indexOf(body);
  if (idx !== -1) list.splice(idx, 1);
}

/** Register a handler for proximity between two entity types. Order-independent. */
export function registerProximityPair(
  typeA: string, typeB: string,
  handler: (a: ProximityBody, b: ProximityBody) => void
): void {
  proximityPairs.set(pairKey(typeA, typeB), { typeA, typeB, handler });
}

/** Check all registered proximity pairs and dispatch handlers. */
export function proximitySystem(): void {
  for (const [, entry] of proximityPairs) {
    const listA = proximityBodies.get(entry.typeA);
    const listB = proximityBodies.get(entry.typeB);
    if (!listA || !listB) continue;

    const sameType = entry.typeA === entry.typeB;

    for (let i = 0; i < listA.length; i++) {
      const a = listA[i];
      if (!a.active) continue;

      const startJ = sameType ? i + 1 : 0;
      for (let j = startJ; j < listB.length; j++) {
        const b = listB[j];
        if (!b.active) continue;

        const dx = a.pos.x - b.pos.x;
        const dz = a.pos.z - b.pos.z;
        if (Math.sqrt(dx * dx + dz * dz) < a.radius + b.radius) {
          entry.handler(a, b);
        }
      }
    }
  }
}

// ─── RPM Registry ───────────────────────────────────────────────────────────

interface RpmEntry {
  id:         number;
  collidable: Collidable;
  decayRate:  number;
  speedDrain: number;
}
const rpmEntries: RpmEntry[] = [];

export function registerRpm(
  id: number, collidable: Collidable, decayRate: number, speedDrain: number
): void {
  rpmEntries.push({ id, collidable, decayRate, speedDrain });
}

/** Apply natural RPM decay + speed drain for all registered RPM entities. */
export function rpmSystem(delta: number): void {
  for (const r of rpmEntries) {
    const speed = Math.sqrt(r.collidable.vel.x ** 2 + r.collidable.vel.z ** 2);
    r.collidable.rpm -= r.decayRate * delta;
    r.collidable.rpm -= speed * r.speedDrain * delta;
    r.collidable.rpm  = Math.max(0, r.collidable.rpm);
  }
}

// ─── Deregistration ─────────────────────────────────────────────────────────

function removeById<T extends { id: number }>(arr: T[], id: number): void {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].id === id) arr.splice(i, 1);
  }
}

/** Remove all per-entity registrations for the given ID. */
export function deregisterEntity(id: number): void {
  removeById(updates, id);
  removeById(movables, id);
  removeById(rpmEntries, id);
}

// ─── Entity Type Manager ─────────────────────────────────────────────────────
//
// Defines a typed spawn/destroy/list interface for a category of entity.
// Pair handlers and game-loop update order remain in game.ts — this only
// manages instance tracking so spawn/reset don't need manual arrays.

export interface EntityManager<TState, TArgs extends unknown[]> {
  /** Create an instance and start tracking it. */
  spawn:      (...args: TArgs) => TState;
  /** Destroy one instance and stop tracking it. */
  destroy:    (state: TState) => void;
  /** Destroy every tracked instance. */
  destroyAll: () => void;
  /** All currently live instances (read-only iteration). */
  getAll:     () => readonly TState[];
}

export function defineEntityType<TState, TArgs extends unknown[]>(def: {
  create:  (...args: TArgs) => TState;
  destroy: (state: TState) => void;
}): EntityManager<TState, TArgs> {
  const instances: TState[] = [];
  return {
    spawn:      (...args) => { const s = def.create(...args); instances.push(s); return s; },
    destroy:    (s)       => { def.destroy(s); const i = instances.indexOf(s); if (i !== -1) instances.splice(i, 1); },
    destroyAll: ()        => { for (const s of instances) def.destroy(s); instances.length = 0; },
    getAll:     ()        => instances,
  };
}

// ─── Reset ──────────────────────────────────────────────────────────────────

/** Clear all per-entity registrations. Pair handlers are NOT cleared. */
export function resetEntityRegistrations(): void {
  updates.length   = 0;
  movables.length  = 0;
  rpmEntries.length = 0;
  collidableTypes.clear();
  for (const [, list] of proximityBodies) list.length = 0;
  _nextId = 0;
}
