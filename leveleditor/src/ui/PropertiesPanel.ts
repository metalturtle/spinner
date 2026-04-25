import { Editor } from '../editor/Editor';
import { EditPropertyCmd } from '../commands/EditPropertyCmd';
import type { PolygonLayer } from '../data/Polygon';
import { TEXTURE_LIBRARY } from '../data/TextureLibrary';
import {
  CUSTOM_ENTITY_TYPE_VALUE,
  ENTITY_TYPE_OPTIONS,
  isKnownEntityType,
} from '../data/entityTypes';

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

  private textureOptions(current?: string): string {
    const options = ['<option value="">None</option>'];
    for (const texture of TEXTURE_LIBRARY) {
      const selected = texture.id === current ? ' selected' : '';
      options.push(`<option value="${texture.id}"${selected}>${texture.name}</option>`);
    }
    return options.join('');
  }

  private entityTypeOptions(current: string): string {
    return [
      ...ENTITY_TYPE_OPTIONS.map((option) =>
        `<option value="${option.value}"${option.value === current ? ' selected' : ''}>${option.label}</option>`),
      `<option value="${CUSTOM_ENTITY_TYPE_VALUE}"${isKnownEntityType(current) ? '' : ' selected'}>Custom</option>`,
    ].join('');
  }

  private entityTypeDatalistOptions(): string {
    return ENTITY_TYPE_OPTIONS
      .map((option) => `<option value="${option.value}">${option.label}</option>`)
      .join('');
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
          <label>Texture</label>
          <select data-field="textureId">${this.textureOptions(poly.textureId)}</select>
        </div>
        <div class="prop-row">
          <label>Tex Size</label>
          <input type="number" data-field="textureScale" value="${(poly.textureScale ?? 1).toFixed(2)}" step="0.25" min="0.25" />
        </div>
        ${this.reliefRow(poly.textureId, poly.useReliefMap)}
        <div class="prop-row">
          <label>Vertices</label>
          <span>${poly.vertices.length}</span>
        </div>
        ${poly.layer === 'floor' ? this.surfaceSection(poly.properties) : ''}
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
          <label>Texture</label>
          <select data-field="textureId">${this.textureOptions(circle.textureId)}</select>
        </div>
        <div class="prop-row">
          <label>Tex Size</label>
          <input type="number" data-field="textureScale" value="${(circle.textureScale ?? 1).toFixed(2)}" step="0.25" min="0.25" />
        </div>
        ${this.reliefRow(circle.textureId, circle.useReliefMap)}
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
          <select id="entity-type-preset">${this.entityTypeOptions(entity.type)}</select>
        </div>
        <div class="prop-row">
          <label>Custom</label>
          <input
            type="text"
            data-field="type"
            value="${this.esc(entity.type)}"
            list="entity-type-suggestions-panel"
            placeholder="Enter entity type"
          />
          <datalist id="entity-type-suggestions-panel">${this.entityTypeDatalistOptions()}</datalist>
        </div>
        <div class="prop-row">
          <label>Position</label>
          <span>${entity.position.x.toFixed(1)}, ${entity.position.y.toFixed(1)}</span>
        </div>
        <div class="prop-row">
          <label>Rotation</label>
          <input type="number" data-field="rotation" value="${entity.rotation}" step="15" />
        </div>
        ${entity.type === 'light_point' ? this.lightSection(entity.properties) : ''}
        ${this.kvSection(entity.properties)}
      `;

      this.wireInputs('entity', sel.id);
      this.wireEntityTypePreset();
      this.wireKV('entity', sel.id);
    }
  }

  private wireEntityTypePreset(): void {
    const preset = this.container.querySelector<HTMLSelectElement>('#entity-type-preset');
    const typeInput = this.container.querySelector<HTMLInputElement>('input[data-field="type"]');
    if (!preset || !typeInput) return;

    preset.addEventListener('change', () => {
      if (preset.value === CUSTOM_ENTITY_TYPE_VALUE) {
        typeInput.focus();
        typeInput.select();
        return;
      }

      if (typeInput.value === preset.value) return;
      typeInput.value = preset.value;
      typeInput.dispatchEvent(new Event('change'));
    });
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

  private lightSection(properties: Record<string, string>): string {
    return `
      <div class="prop-section">
        <h4>Light</h4>
        <div class="prop-row">
          <label>Color</label>
          <input type="color" data-field="light:color" value="${this.esc(properties.color ?? '#ffd080')}" />
        </div>
        <div class="prop-row">
          <label>Intensity</label>
          <input type="number" data-field="light:intensity" value="${this.esc(properties.intensity ?? '2.0')}" step="0.1" min="0" />
        </div>
        <div class="prop-row">
          <label>Range</label>
          <input type="number" data-field="light:range" value="${this.esc(properties.range ?? '8')}" step="0.5" min="0.5" />
        </div>
        <div class="prop-row">
          <label>Decay</label>
          <input type="number" data-field="light:decay" value="${this.esc(properties.decay ?? '1.5')}" step="0.1" min="0" />
        </div>
        <div class="prop-row">
          <label>Height</label>
          <input type="number" data-field="light:height" value="${this.esc(properties.height ?? '1.5')}" step="0.1" min="0" />
        </div>
      </div>
    `;
  }

  private surfaceSection(properties: Record<string, string>): string {
    const rawSurfaceType = properties.surfaceType ?? 'normal';
    const surfaceType = rawSurfaceType === 'water' ? 'lava' : rawSurfaceType;
    const drainRate = properties.drainRate ?? '8';
    return `
      <div class="prop-section">
        <h4>Surface</h4>
        <div class="prop-row">
          <label>Type</label>
          <select data-field="surfaceType">
            <option value="normal"${surfaceType === 'normal' ? ' selected' : ''}>Normal</option>
            <option value="lava"${surfaceType === 'lava' ? ' selected' : ''}>Lava</option>
          </select>
        </div>
        <div class="prop-row">
          <label>Drain</label>
          <input type="number" data-field="drainRate" value="${this.esc(drainRate)}" step="0.5" min="0" />
        </div>
      </div>
    `;
  }

  private reliefRow(textureId: string | undefined, enabled: boolean | undefined): string {
    const texture = TEXTURE_LIBRARY.find((entry) => entry.id === textureId);
    if (!texture?.hasRelief) return '';
    return `
      <div class="prop-row">
        <label>Use Relief</label>
        <input type="checkbox" data-field="useReliefMap"${enabled ? ' checked' : ''} />
      </div>
    `;
  }

  private wireInputs(type: 'polygon' | 'entity' | 'circle', id: string): void {
    this.container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[data-field], select[data-field]').forEach((input) => {
      input.addEventListener('change', () => {
        const field = input.dataset.field!;
        const newValue = input instanceof HTMLInputElement && input.type === 'checkbox'
          ? String(input.checked)
          : input.value;
        let oldValue = '';
        if (type === 'polygon') {
          const poly = this.editor.levelData.getPolygon(id);
          if (!poly) return;
          if (field === 'name') oldValue = poly.name;
          else if (field === 'layer') oldValue = poly.layer;
          else if (field === 'color') oldValue = poly.color;
          else if (field === 'textureId') oldValue = poly.textureId ?? '';
          else if (field === 'textureScale') oldValue = String(poly.textureScale ?? 1);
          else if (field === 'useReliefMap') oldValue = String(Boolean(poly.useReliefMap));
          else if (field === 'surfaceType') oldValue = (poly.properties.surfaceType === 'water' ? 'lava' : (poly.properties.surfaceType ?? 'normal'));
          else if (field === 'drainRate') oldValue = poly.properties.drainRate ?? '8';
        } else if (type === 'circle') {
          const circle = this.editor.levelData.getCircle(id);
          if (!circle) return;
          if (field === 'name') oldValue = circle.name;
          else if (field === 'layer') oldValue = circle.layer;
          else if (field === 'color') oldValue = circle.color;
          else if (field === 'textureId') oldValue = circle.textureId ?? '';
          else if (field === 'textureScale') oldValue = String(circle.textureScale ?? 1);
          else if (field === 'useReliefMap') oldValue = String(Boolean(circle.useReliefMap));
          else if (field === 'radius') oldValue = String(circle.radius);
        } else {
          const entity = this.editor.levelData.getEntity(id);
          if (!entity) return;
          if (field === 'name') oldValue = entity.name;
          else if (field === 'type') oldValue = entity.type;
          else if (field === 'rotation') oldValue = String(entity.rotation);
          else if (field.startsWith('light:')) oldValue = entity.properties[field.slice(6)] ?? '';
        }
        const targetField = type === 'entity' && field.startsWith('light:') ? field.slice(6) : field;
        const cmd = new EditPropertyCmd(this.editor.levelData, type, id, targetField, oldValue, newValue);
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
