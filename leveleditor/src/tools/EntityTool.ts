import type { Tool, EditorPointerEvent } from './Tool';
import { Editor } from '../editor/Editor';
import { AddEntityCmd } from '../commands/AddEntityCmd';
import { generateId } from '../utils/ids';
import { getEntityTypeLabel } from '../data/entityTypes';

export class EntityTool implements Tool {
  name = 'entity';
  cursor = 'crosshair';

  private editor: Editor;
  private entityType = 'player_spawn';

  constructor(editor: Editor) {
    this.editor = editor;
  }

  setEntityType(type: string): void {
    this.entityType = type;
  }

  getEntityType(): string {
    return this.entityType;
  }

  activate(): void {}
  deactivate(): void {}

  onPointerDown(event: EditorPointerEvent): void {
    const id = generateId('ent');
    const properties = this.defaultPropertiesForType(this.entityType);
    const label = getEntityTypeLabel(this.entityType);
    const cmd = new AddEntityCmd(this.editor.levelData, {
      id,
      name: `${label} ${this.editor.levelData.entities.length + 1}`,
      type: this.entityType,
      position: { x: event.worldPos.x, y: event.worldPos.y },
      rotation: 0,
      properties,
    });
    this.editor.commandHistory.execute(cmd);
  }

  onPointerMove(_event: EditorPointerEvent): void {}
  onPointerUp(_event: EditorPointerEvent): void {}
  onKeyDown(_event: KeyboardEvent): void {}
  onKeyUp(_event: KeyboardEvent): void {}

  private defaultPropertiesForType(type: string): Record<string, string> {
    if (type === 'light_point') {
      return {
        color: '#ffd080',
        intensity: '2.0',
        range: '8',
        decay: '1.5',
        height: '1.5',
      };
    }

    if (type === 'fire_torch') {
      return {
        color: '#ff9a3c',
        intensity: '3.4',
        range: '9.5',
        decay: '1.6',
        height: '1.8',
        poleHeight: '1.55',
        flameSize: '0.22',
      };
    }

    return {};
  }
}
