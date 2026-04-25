import type { Command } from './Command';
import { LevelData } from '../data/LevelData';

export class MoveVertexCmd implements Command {
  description: string;
  private levelData: LevelData;
  private polygonId: string;
  private vertexIndex: number;
  private dx: number;
  private dy: number;

  constructor(levelData: LevelData, polygonId: string, vertexIndex: number, dx: number, dy: number) {
    this.levelData = levelData;
    this.polygonId = polygonId;
    this.vertexIndex = vertexIndex;
    this.dx = dx;
    this.dy = dy;
    this.description = `Move vertex ${vertexIndex} of ${polygonId}`;
  }

  execute(): void {
    this.apply(this.dx, this.dy);
  }

  undo(): void {
    this.apply(-this.dx, -this.dy);
  }

  private apply(dx: number, dy: number): void {
    const poly = this.levelData.getPolygon(this.polygonId);
    if (!poly || this.vertexIndex >= poly.vertices.length) return;
    poly.vertices[this.vertexIndex].x += dx;
    poly.vertices[this.vertexIndex].y += dy;
    this.levelData.notifyPolygonChanged(this.polygonId);
  }
}
