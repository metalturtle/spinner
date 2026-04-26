import type { Command } from './Command';
import type { PolygonLayer } from '../data/Polygon';
import { LevelData } from '../data/LevelData';

type ObjType = 'polygon' | 'entity' | 'circle';

function parseTextureScale(value: string): number | undefined {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed === 1 ? undefined : parsed;
}

function parseBoolean(value: string): boolean {
  return value === 'true';
}

export class EditPropertyCmd implements Command {
  description: string;
  private levelData: LevelData;
  private objectType: ObjType;
  private objectId: string;
  private field: string;
  private oldValue: string;
  private newValue: string;

  constructor(
    levelData: LevelData,
    objectType: ObjType,
    objectId: string,
    field: string,
    oldValue: string,
    newValue: string
  ) {
    this.levelData = levelData;
    this.objectType = objectType;
    this.objectId = objectId;
    this.field = field;
    this.oldValue = oldValue;
    this.newValue = newValue;
    this.description = `Edit ${field} of ${objectType} ${objectId}`;
  }

  execute(): void {
    this.applyValue(this.newValue);
  }

  undo(): void {
    this.applyValue(this.oldValue);
  }

  private applyValue(value: string): void {
    if (this.objectType === 'polygon') {
      const poly = this.levelData.getPolygon(this.objectId);
      if (!poly) return;
      if (this.field === 'name') poly.name = value;
      else if (this.field === 'layer') poly.layer = value as PolygonLayer;
      else if (this.field === 'color') poly.color = value;
      else if (this.field === 'textureId') poly.textureId = value || undefined;
      else if (this.field === 'textureScale') poly.textureScale = parseTextureScale(value);
      else if (this.field === 'useReliefMap') poly.useReliefMap = parseBoolean(value);
      else poly.properties[this.field] = value;
      this.levelData.notifyPolygonChanged(this.objectId);
    } else if (this.objectType === 'circle') {
      const circle = this.levelData.getCircle(this.objectId);
      if (!circle) return;
      if (this.field === 'name') circle.name = value;
      else if (this.field === 'layer') circle.layer = value as PolygonLayer;
      else if (this.field === 'color') circle.color = value;
      else if (this.field === 'textureId') circle.textureId = value || undefined;
      else if (this.field === 'textureScale') circle.textureScale = parseTextureScale(value);
      else if (this.field === 'useReliefMap') circle.useReliefMap = parseBoolean(value);
      else if (this.field === 'radius') circle.radius = parseFloat(value) || 1;
      else circle.properties[this.field] = value;
      this.levelData.notifyCircleChanged(this.objectId);
    } else {
      const entity = this.levelData.getEntity(this.objectId);
      if (!entity) return;
      if (this.field === 'name') entity.name = value;
      else if (this.field === 'type') entity.type = value;
      else if (this.field === 'rotation') entity.rotation = parseFloat(value) || 0;
      else entity.properties[this.field] = value;
      this.levelData.notifyEntityChanged(this.objectId);
    }
  }
}
