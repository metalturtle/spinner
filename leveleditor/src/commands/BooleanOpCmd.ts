import type { Command } from './Command';
import type { PolygonData } from '../data/Polygon';
import { LevelData } from '../data/LevelData';
import { performBooleanOp } from '../utils/csg';
import type { BooleanOp } from '../utils/csg';

export class BooleanOpCmd implements Command {
  description: string;
  private levelData: LevelData;
  private op: BooleanOp;
  private inputA: PolygonData;
  private inputB: PolygonData;
  private results: PolygonData[] | null = null;

  constructor(levelData: LevelData, op: BooleanOp, polyIdA: string, polyIdB: string) {
    this.levelData = levelData;
    this.op = op;
    this.inputA = JSON.parse(JSON.stringify(levelData.getPolygon(polyIdA)!));
    this.inputB = JSON.parse(JSON.stringify(levelData.getPolygon(polyIdB)!));

    const opLabel = op === 'union' ? 'Union' : op === 'difference' ? 'Subtract' : 'Intersect';
    this.description = `${opLabel}: ${this.inputA.name}, ${this.inputB.name}`;
  }

  execute(): void {
    // Compute results on first execute, reuse on redo
    if (this.results === null) {
      this.results = performBooleanOp(this.op, this.inputA, this.inputB);
    }

    this.levelData.removePolygon(this.inputA.id);
    this.levelData.removePolygon(this.inputB.id);

    for (const poly of this.results) {
      this.levelData.addPolygon(JSON.parse(JSON.stringify(poly)));
    }
  }

  undo(): void {
    if (this.results) {
      for (const poly of this.results) {
        this.levelData.removePolygon(poly.id);
      }
    }
    this.levelData.addPolygon(JSON.parse(JSON.stringify(this.inputA)));
    this.levelData.addPolygon(JSON.parse(JSON.stringify(this.inputB)));
  }

  getResultIds(): string[] {
    return this.results ? this.results.map((p) => p.id) : [];
  }
}
