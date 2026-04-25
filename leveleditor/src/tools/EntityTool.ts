import type { Tool, EditorPointerEvent } from './Tool';
import { Editor } from '../editor/Editor';
import { AddEntityCmd } from '../commands/AddEntityCmd';
import { generateId } from '../utils/ids';

export class EntityTool implements Tool {
  name = 'entity';
  cursor = 'crosshair';

  private editor: Editor;
  private entityType = 'spawn';

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
    const cmd = new AddEntityCmd(this.editor.levelData, {
      id,
      name: `${this.entityType.charAt(0).toUpperCase() + this.entityType.slice(1)} ${this.editor.levelData.entities.length + 1}`,
      type: this.entityType,
      position: { x: event.worldPos.x, y: event.worldPos.y },
      rotation: 0,
      properties: {},
    });
    this.editor.commandHistory.execute(cmd);
  }

  onPointerMove(_event: EditorPointerEvent): void {}
  onPointerUp(_event: EditorPointerEvent): void {}
  onKeyDown(_event: KeyboardEvent): void {}
  onKeyUp(_event: KeyboardEvent): void {}
}
