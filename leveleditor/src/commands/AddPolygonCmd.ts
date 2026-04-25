import type { Command } from './Command';
import type { PolygonData } from '../data/Polygon';
import { LevelData } from '../data/LevelData';

export class AddPolygonCmd implements Command {
  description: string;
  private levelData: LevelData;
  private polygon: PolygonData;

  constructor(levelData: LevelData, polygon: PolygonData) {
    this.levelData = levelData;
    this.polygon = polygon;
    this.description = `Add polygon ${polygon.name}`;
  }

  execute(): void {
    this.levelData.addPolygon({
      ...this.polygon,
      vertices: this.polygon.vertices.map((v) => ({ ...v })),
      holes: this.polygon.holes?.map((hole) => hole.map((v) => ({ ...v }))),
      properties: { ...this.polygon.properties },
    });
  }

  undo(): void {
    this.levelData.removePolygon(this.polygon.id);
  }
}
