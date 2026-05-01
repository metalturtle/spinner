import type { Command } from './Command';
import { LevelData } from '../data/LevelData';

export type MovableObjectType = 'polygon' | 'entity' | 'circle';

export interface MoveObjectTarget {
  type: MovableObjectType;
  id: string;
}

export class MoveObjectsCmd implements Command {
  description: string;
  private levelData: LevelData;
  private targets: MoveObjectTarget[];
  private dx: number;
  private dy: number;

  constructor(levelData: LevelData, targets: ReadonlyArray<MoveObjectTarget>, dx: number, dy: number) {
    this.levelData = levelData;
    this.targets = targets.map((target) => ({ ...target }));
    this.dx = dx;
    this.dy = dy;
    this.description = `Move ${this.targets.length} object${this.targets.length === 1 ? '' : 's'}`;
  }

  execute(): void {
    this.apply(this.dx, this.dy);
  }

  undo(): void {
    this.apply(-this.dx, -this.dy);
  }

  private apply(dx: number, dy: number): void {
    for (const target of this.targets) {
      if (target.type === 'polygon') {
        const poly = this.levelData.getPolygon(target.id);
        if (!poly) continue;
        for (const v of poly.vertices) {
          v.x += dx;
          v.y += dy;
        }
        if (poly.holes) {
          for (const hole of poly.holes) {
            for (const v of hole) {
              v.x += dx;
              v.y += dy;
            }
          }
        }
        this.levelData.notifyPolygonChanged(target.id);
      } else if (target.type === 'circle') {
        const circle = this.levelData.getCircle(target.id);
        if (!circle) continue;
        circle.center.x += dx;
        circle.center.y += dy;
        this.levelData.notifyCircleChanged(target.id);
      } else {
        const entity = this.levelData.getEntity(target.id);
        if (!entity) continue;
        entity.position.x += dx;
        entity.position.y += dy;
        this.levelData.notifyEntityChanged(target.id);
      }
    }
  }
}
