import type { Command } from './Command';
import { LevelData } from '../data/LevelData';

export class MoveObjectCmd implements Command {
  description: string;
  private levelData: LevelData;
  private objectType: 'polygon' | 'entity' | 'circle';
  private objectId: string;
  private dx: number;
  private dy: number;

  constructor(levelData: LevelData, objectType: 'polygon' | 'entity' | 'circle', objectId: string, dx: number, dy: number) {
    this.levelData = levelData;
    this.objectType = objectType;
    this.objectId = objectId;
    this.dx = dx;
    this.dy = dy;
    this.description = `Move ${objectType} ${objectId}`;
  }

  execute(): void {
    this.apply(this.dx, this.dy);
  }

  undo(): void {
    this.apply(-this.dx, -this.dy);
  }

  private apply(dx: number, dy: number): void {
    if (this.objectType === 'polygon') {
      const poly = this.levelData.getPolygon(this.objectId);
      if (!poly) return;
      for (const v of poly.vertices) {
        v.x += dx;
        v.y += dy;
      }
      this.levelData.notifyPolygonChanged(this.objectId);
    } else if (this.objectType === 'circle') {
      const circle = this.levelData.getCircle(this.objectId);
      if (!circle) return;
      circle.center.x += dx;
      circle.center.y += dy;
      this.levelData.notifyCircleChanged(this.objectId);
    } else {
      const entity = this.levelData.getEntity(this.objectId);
      if (!entity) return;
      entity.position.x += dx;
      entity.position.y += dy;
      this.levelData.notifyEntityChanged(this.objectId);
    }
  }
}
