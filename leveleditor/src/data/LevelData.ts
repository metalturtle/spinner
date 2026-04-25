import type { PolygonData } from './Polygon';
import type { EntityData } from './Entity';
import type { CircleData } from './Circle';

export interface LevelDataSnapshot {
  version: 2;
  unit: string;
  gridSize: number;
  polygons: PolygonData[];
  circles: CircleData[];
  entities: EntityData[];
}

type EventType =
  | 'polygon-added'
  | 'polygon-removed'
  | 'polygon-changed'
  | 'entity-added'
  | 'entity-removed'
  | 'entity-changed'
  | 'circle-added'
  | 'circle-removed'
  | 'circle-changed'
  | 'level-loaded';

type Listener = (data?: any) => void;

export class LevelData {
  polygons: PolygonData[] = [];
  circles: CircleData[] = [];
  entities: EntityData[] = [];
  gridSize = 1;
  unit = 'm';

  private listeners = new Map<EventType, Set<Listener>>();

  on(event: EventType, listener: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }

  off(event: EventType, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: EventType, data?: any): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  // Polygons
  addPolygon(poly: PolygonData): void {
    this.polygons.push(poly);
    this.emit('polygon-added', poly);
  }

  removePolygon(id: string): PolygonData | undefined {
    const idx = this.polygons.findIndex((p) => p.id === id);
    if (idx === -1) return undefined;
    const [removed] = this.polygons.splice(idx, 1);
    this.emit('polygon-removed', removed);
    return removed;
  }

  getPolygon(id: string): PolygonData | undefined {
    return this.polygons.find((p) => p.id === id);
  }

  notifyPolygonChanged(id: string): void {
    const poly = this.getPolygon(id);
    if (poly) this.emit('polygon-changed', poly);
  }

  // Circles
  addCircle(circle: CircleData): void {
    this.circles.push(circle);
    this.emit('circle-added', circle);
  }

  removeCircle(id: string): CircleData | undefined {
    const idx = this.circles.findIndex((c) => c.id === id);
    if (idx === -1) return undefined;
    const [removed] = this.circles.splice(idx, 1);
    this.emit('circle-removed', removed);
    return removed;
  }

  getCircle(id: string): CircleData | undefined {
    return this.circles.find((c) => c.id === id);
  }

  notifyCircleChanged(id: string): void {
    const circle = this.getCircle(id);
    if (circle) this.emit('circle-changed', circle);
  }

  // Entities
  addEntity(entity: EntityData): void {
    this.entities.push(entity);
    this.emit('entity-added', entity);
  }

  removeEntity(id: string): EntityData | undefined {
    const idx = this.entities.findIndex((e) => e.id === id);
    if (idx === -1) return undefined;
    const [removed] = this.entities.splice(idx, 1);
    this.emit('entity-removed', removed);
    return removed;
  }

  getEntity(id: string): EntityData | undefined {
    return this.entities.find((e) => e.id === id);
  }

  notifyEntityChanged(id: string): void {
    const entity = this.getEntity(id);
    if (entity) this.emit('entity-changed', entity);
  }

  // Serialization
  toSnapshot(): LevelDataSnapshot {
    return {
      version: 2,
      unit: this.unit,
      gridSize: this.gridSize,
      polygons: JSON.parse(JSON.stringify(this.polygons)),
      circles: JSON.parse(JSON.stringify(this.circles)),
      entities: JSON.parse(JSON.stringify(this.entities)),
    };
  }

  fromSnapshot(snapshot: LevelDataSnapshot): void {
    this.polygons = snapshot.polygons ?? [];
    this.circles = snapshot.circles ?? [];
    this.entities = snapshot.entities ?? [];
    this.gridSize = snapshot.gridSize ?? 1;
    this.unit = snapshot.unit ?? 'm';

    // Backfill layer for v1 polygons that lack it
    for (const poly of this.polygons) {
      if (!poly.layer) {
        poly.layer = poly.properties.type === 'floor' ? 'floor' : 'wall';
      }
    }

    this.emit('level-loaded');
  }

  clear(): void {
    this.polygons = [];
    this.circles = [];
    this.entities = [];
    this.emit('level-loaded');
  }
}
