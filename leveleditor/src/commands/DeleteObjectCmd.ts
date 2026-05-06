import type { Command } from './Command';
import type { PolygonData } from '../data/Polygon';
import type { EntityData } from '../data/Entity';
import type { CircleData } from '../data/Circle';
import { LevelData } from '../data/LevelData';

export class DeleteObjectCmd implements Command {
  description: string;
  private levelData: LevelData;
  private objectType: 'polygon' | 'entity' | 'circle';
  private objectId: string;
  private backup: PolygonData | EntityData | CircleData | null = null;

  constructor(levelData: LevelData, objectType: 'polygon' | 'entity' | 'circle', objectId: string) {
    this.levelData = levelData;
    this.objectType = objectType;
    this.objectId = objectId;
    this.description = `Delete ${objectType} ${objectId}`;
  }

  execute(): void {
    if (this.objectType === 'polygon') {
      const poly = this.levelData.getPolygon(this.objectId);
      if (poly) this.backup = JSON.parse(JSON.stringify(poly));
      this.levelData.removePolygon(this.objectId);
    } else if (this.objectType === 'circle') {
      const circle = this.levelData.getCircle(this.objectId);
      if (circle) this.backup = JSON.parse(JSON.stringify(circle));
      this.levelData.removeCircle(this.objectId);
    } else {
      const entity = this.levelData.getEntity(this.objectId);
      if (entity) this.backup = JSON.parse(JSON.stringify(entity));
      this.levelData.removeEntity(this.objectId);
    }
  }

  undo(): void {
    if (!this.backup) return;
    if (this.objectType === 'polygon') {
      this.levelData.addPolygon(this.backup as PolygonData);
    } else if (this.objectType === 'circle') {
      this.levelData.addCircle(this.backup as CircleData);
    } else {
      this.levelData.addEntity(this.backup as EntityData);
    }
  }
}
