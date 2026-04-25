import type { Command } from './Command';
import type { EntityData } from '../data/Entity';
import { LevelData } from '../data/LevelData';

export class AddEntityCmd implements Command {
  description: string;
  private levelData: LevelData;
  private entity: EntityData;

  constructor(levelData: LevelData, entity: EntityData) {
    this.levelData = levelData;
    this.entity = entity;
    this.description = `Add entity ${entity.name}`;
  }

  execute(): void {
    this.levelData.addEntity({ ...this.entity, position: { ...this.entity.position }, properties: { ...this.entity.properties } });
  }

  undo(): void {
    this.levelData.removeEntity(this.entity.id);
  }
}
