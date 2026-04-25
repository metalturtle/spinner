import { Editor } from '../editor/Editor';
import { EditPropertyCmd } from '../commands/EditPropertyCmd';
import type { PolygonLayer } from '../data/Polygon';

const LAYERS: PolygonLayer[] = ['floor', 'wall', 'trigger', 'decoration'];

export class PropertiesPanel {
  private editor: Editor;
  private container: HTMLElement;

  constructor(editor: Editor) {
    this.editor = editor;
    this.container = document.getElementById('properties-content')!;

    editor.selection.onChange(() => this.refresh());
    editor.levelData.on('polygon-changed', () => this.refreshIfSelected());
    editor.levelData.on('entity-changed', () => this.refreshIfSelected());
    editor.levelData.on('circle-changed', () => this.refreshIfSelected());
  }

  private refreshIfSelected(): void {
    if (this.editor.selection.selected) this.refresh();
  }

  private layerOptions(current: PolygonLayer): string {
    return LAYERS.map((l) => `<option value="${l}"${l === current ? ' selected' : ''}>${l}</option>`).join('');
  }

  refresh(): void {
    const sel = this.editor.selection.selected;
    if (!sel) {
      this.container.innerHTML = '<p class="empty-msg">Nothing selected</p>';
      return;
    }

    if (sel.type === 'polygon') {
      const poly = this.editor.levelData.getPolygon(sel.id);
      if (!poly) { this.container.innerHTML = ''; return; }

      this.container.innerHTML = `
        <div class="prop-row">
          <label>Name</label>
          <input type="text" data-field="name" value="${this.esc(poly.name)}" />
        </div>
        <div class="prop-row">
          <label>Layer</label>
          <select data-field="layer">${this.layerOptions(poly.layer)}</select>
        </div>
        <div class="prop-row">
          <label>Color</label>
          <input type="color" data-field="color" value="${poly.color}" />
        </div>
        <div class="prop-row">
          <label>Vertices</label>
          <span>${poly.vertices.length}</span>
        </div>
        ${this.kvSection(poly.properties)}
      `;

      this.wireInputs('polygon', sel.id);
      this.wireKV('polygon', sel.id);
    } else if (sel.type === 'circle') {
      const circle = this.editor.levelData.getCircle(sel.id);
      if (!circle) { this.container.innerHTML = ''; return; }

      this.container.innerHTML = `
        <div class="prop-row">
          <label>Name</label>
          <input type="text" data-field="name" value="${this.esc(circle.name)}" />
        </div>
        <div class="prop-row">
          <label>Layer</label>
          <select data-field="layer">${this.layerOptions(circle.layer)}</select>
        </div>
        <div class="prop-row">
          <label>Color</label>
          <input type="color" data-field="color" value="${circle.color}" />
        </div>
        <div class="prop-row">
          <label>Center</label>
          <span>${circle.center.x.toFixed(1)}, ${circle.center.y.toFixed(1)}</span>
        </div>
        <div class="prop-row">
          <label>Radius</label>
          <input type="number" data-field="radius" value="${circle.radius.toFixed(2)}" step="0.5" min="0.1" />
        </div>
        ${this.kvSection(circle.properties)}
      `;

      this.wireInputs('circle', sel.id);
      this.wireKV('circle', sel.id);
    } else if (sel.type === 'entity') {
      const entity = this.editor.levelData.getEntity(sel.id);
      if (!entity) { this.container.innerHTML = ''; return; }

      this.container.innerHTML = `
        <div class="prop-row">
          <label>Name</label>
          <input type="text" data-field="name" value="${this.esc(entity.name)}" />
        </div>
        <div class="prop-row">
          <label>Type</label>
          <input type="text" data-field="type" value="${this.esc(entity.type)}" />
        </div>
        <div class="prop-row">
          <label>Position</label>
          <span>${entity.position.x.toFixed(1)}, ${entity.position.y.toFixed(1)}</span>
        </div>
        <div class="prop-row">
          <label>Rotation</label>
          <input type="number" data-field="rotation" value="${entity.rotation}" step="15" />
        </div>
        ${this.kvSection(entity.properties)}
      `;

      this.wireInputs('entity', sel.id);
      this.wireKV('entity', sel.id);
    }
  }

  private kvSection(properties: Record<string, string>): string {
    return `
      <div class="prop-section">
        <h4>Custom Properties</h4>
        <div id="kv-container">
          ${Object.entries(properties).map(([k, v]) => `
            <div class="kv-row">
              <input type="text" class="kv-key" value="${this.esc(k)}" data-old-key="${this.esc(k)}" />
              <input type="text" class="kv-val" value="${this.esc(v)}" data-key="${this.esc(k)}" />
              <button class="kv-del" data-key="${this.esc(k)}">×</button>
            </div>
          `).join('')}
        </div>
        <button class="btn-add-prop" id="btn-add-kv">+ Add</button>
      </div>
    `;
  }

  private wireInputs(type: 'polygon' | 'entity' | 'circle', id: string): void {
    this.container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[data-field], select[data-field]').forEach((input) => {
      input.addEventListener('change', () => {
        const field = input.dataset.field!;
        let oldValue = '';
        if (type === 'polygon') {
          const poly = this.editor.levelData.getPolygon(id);
          if (!poly) return;
          if (field === 'name') oldValue = poly.name;
          else if (field === 'layer') oldValue = poly.layer;
          else if (field === 'color') oldValue = poly.color;
        } else if (type === 'circle') {
          const circle = this.editor.levelData.getCircle(id);
          if (!circle) return;
          if (field === 'name') oldValue = circle.name;
          else if (field === 'layer') oldValue = circle.layer;
          else if (field === 'color') oldValue = circle.color;
          else if (field === 'radius') oldValue = String(circle.radius);
        } else {
          const entity = this.editor.levelData.getEntity(id);
          if (!entity) return;
          if (field === 'name') oldValue = entity.name;
          else if (field === 'type') oldValue = entity.type;
          else if (field === 'rotation') oldValue = String(entity.rotation);
        }
        const cmd = new EditPropertyCmd(this.editor.levelData, type, id, field, oldValue, input.value);
        this.editor.commandHistory.execute(cmd);
      });
    });
  }

  private wireKV(type: 'polygon' | 'entity' | 'circle', id: string): void {
    const getObj = () => {
      if (type === 'polygon') return this.editor.levelData.getPolygon(id);
      if (type === 'circle') return this.editor.levelData.getCircle(id);
      return this.editor.levelData.getEntity(id);
    };
    const notifyChange = () => {
      if (type === 'polygon') this.editor.levelData.notifyPolygonChanged(id);
      else if (type === 'circle') this.editor.levelData.notifyCircleChanged(id);
      else this.editor.levelData.notifyEntityChanged(id);
    };

    this.container.querySelectorAll<HTMLInputElement>('.kv-val').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.key!;
        const obj = getObj();
        if (!obj) return;
        const oldValue = obj.properties[key] ?? '';
        const cmd = new EditPropertyCmd(this.editor.levelData, type, id, key, oldValue, input.value);
        this.editor.commandHistory.execute(cmd);
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('.kv-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key!;
        const obj = getObj();
        if (!obj) return;
        delete obj.properties[key];
        notifyChange();
        this.refresh();
      });
    });

    const addBtn = document.getElementById('btn-add-kv');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const obj = getObj();
        if (!obj) return;
        let key = 'newKey';
        let i = 1;
        while (obj.properties[key] !== undefined) { key = `newKey${i++}`; }
        obj.properties[key] = '';
        notifyChange();
        this.refresh();
      });
    }
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}