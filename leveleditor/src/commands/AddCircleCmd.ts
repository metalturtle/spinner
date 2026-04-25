import type { Command } from './Command';
import type { CircleData } from '../data/Circle';
import { LevelData } from '../data/LevelData';

export class AddCircleCmd implements Command {
  description: string;
  private levelData: LevelData;
  private circle: CircleData;

  constructor(levelData: LevelData, circle: CircleData) {
    this.levelData = levelData;
    this.circle = circle;
    this.description = `Add circle ${circle.name}`;
  }

  execute(): void {
    this.levelData.addCircle({
      ...this.circle,
      center: { ...this.circle.center },
      properties: { ...this.circle.properties },
    });
  }

  undo(): void {
    this.levelData.removeCircle(this.circle.id);
  }
}
