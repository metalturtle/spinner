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
        ${poly.layer === 'wall' ? this.wallSection(poly.properties) : ''}
        ${poly.layer === 'trigger' ? this.triggerSection(poly.properties) : ''}
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
        ${circle.layer === 'floor' ? this.surfaceSection(circle.properties) : ''}
        ${circle.layer === 'trigger' ? this.triggerSection(circle.properties) : ''}
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
          <label>Pos X</label>
          <input type="number" data-field="positionX" value="${entity.position.x.toFixed(2)}" step="0.5" />
        </div>
        <div class="prop-row">
          <label>Pos Y</label>
          <input type="number" data-field="positionY" value="${entity.position.y.toFixed(2)}" step="0.5" />
        </div>
        <div class="prop-row">
          <label>Rotation</label>
          <input type="number" data-field="rotation" value="${entity.rotation}" step="15" />
        </div>
        ${this.spawnSection(entity.properties)}
        ${this.isSlidingDoorEntity(entity.type) ? this.slidingDoorSection(entity.properties) : ''}
        ${this.isLightEmitterEntity(entity.type) ? this.lightSection(entity.properties) : ''}
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

  private wallSection(properties: Record<string, string>): string {
    const invisible = properties.invisible === 'true';
    const mirror = properties.mirror === 'true';
    return `
      <div class="prop-section">
        <h4>Wall</h4>
        <div class="prop-row">
          <label>Invisible</label>
          <input type="checkbox" data-field="invisible"${invisible ? ' checked' : ''} />
        </div>
        <div class="prop-row">
          <label>Mirror</label>
          <input type="checkbox" data-field="mirror"${mirror ? ' checked' : ''} />
        </div>
      </div>
    `;
  }

  private triggerSection(properties: Record<string, string>): string {
    const triggerKind = properties.triggerKind ?? (properties.triggerAction === 'kill_fall' ? 'kill_fall' : 'awaken');
    const lightEnabled = properties.lightEnabled === 'true';
    const sprinklerEnabled = properties.sprinklerEnabled === 'true';
    return `
      <div class="prop-section">
        <h4>Trigger</h4>
        <div class="prop-row">
          <label>Trigger ID</label>
          <input type="text" data-field="triggerId" value="${this.esc(properties.triggerId ?? '')}" placeholder="arena_wave_1" />
        </div>
        <div class="prop-row">
          <label>Kind</label>
          <select data-field="triggerKind">
            <option value="awaken"${triggerKind === 'awaken' ? ' selected' : ''}>Awaken Encounter</option>
            <option value="visibility"${triggerKind === 'visibility' ? ' selected' : ''}>Visibility Zone</option>
            <option value="kill_fall"${triggerKind === 'kill_fall' ? ' selected' : ''}>Kill Fall</option>
          </select>
        </div>
        <div class="prop-row">
          <label>Light Zone</label>
          <input type="checkbox" data-field="lightEnabled"${lightEnabled ? ' checked' : ''} />
        </div>
        <div class="prop-row">
          <label>Ambient Color</label>
          <input type="color" data-field="lightAmbientColor" value="${this.esc(properties.lightAmbientColor ?? '#ffffff')}" />
        </div>
        <div class="prop-row">
          <label>Ambient Intensity</label>
          <input type="number" data-field="lightAmbientIntensity" value="${this.esc(properties.lightAmbientIntensity ?? '0.10')}" step="0.01" min="0" />
        </div>
        <div class="prop-row">
          <label>Dir Color</label>
          <input type="color" data-field="lightDirectionalColor" value="${this.esc(properties.lightDirectionalColor ?? '#cccccc')}" />
        </div>
        <div class="prop-row">
          <label>Dir Intensity</label>
          <input type="number" data-field="lightDirectionalIntensity" value="${this.esc(properties.lightDirectionalIntensity ?? '0.45')}" step="0.01" min="0" />
        </div>
        <div class="prop-row">
          <label>Transition</label>
          <input type="number" data-field="lightTransition" value="${this.esc(properties.lightTransition ?? '0.75')}" step="0.05" min="0.01" />
        </div>
        <div class="prop-row">
          <label>Priority</label>
          <input type="number" data-field="lightPriority" value="${this.esc(properties.lightPriority ?? '0')}" step="1" />
        </div>
        <div class="prop-row">
          <label>Sprinkler Zone</label>
          <input type="checkbox" data-field="sprinklerEnabled"${sprinklerEnabled ? ' checked' : ''} />
        </div>
        <div class="prop-row">
          <label>Water Color</label>
          <input type="color" data-field="sprinklerColor" value="${this.esc(properties.sprinklerColor ?? '#8fdcff')}" />
        </div>
        <div class="prop-row">
          <label>Mode</label>
          <select data-field="sprinklerMode">
            <option value="uniform"${(properties.sprinklerMode ?? 'uniform') === 'uniform' ? ' selected' : ''}>Uniform</option>
            <option value="center_falloff"${properties.sprinklerMode === 'center_falloff' ? ' selected' : ''}>Center Falloff</option>
          </select>
        </div>
        <div class="prop-row">
          <label>Density</label>
          <input type="number" data-field="sprinklerDensity" value="${this.esc(properties.sprinklerDensity ?? '2.4')}" step="0.1" min="0.1" />
        </div>
        <div class="prop-row">
          <label>Center Falloff</label>
          <input type="number" data-field="sprinklerFalloff" value="${this.esc(properties.sprinklerFalloff ?? '1.6')}" step="0.1" min="0.2" />
        </div>
        <div class="prop-row">
          <label>Ceiling Height</label>
          <input type="number" data-field="sprinklerCeilingHeight" value="${this.esc(properties.sprinklerCeilingHeight ?? '3.4')}" step="0.1" min="0.5" />
        </div>
        <div class="prop-row">
          <label>Drop Speed</label>
          <input type="number" data-field="sprinklerDropSpeed" value="${this.esc(properties.sprinklerDropSpeed ?? '1.9')}" step="0.1" min="0.1" />
        </div>
      </div>
    `;
  }

  private spawnSection(properties: Record<string, string>): string {
    const fallable = properties.fallable === 'true';
    return `
      <div class="prop-section">
        <h4>Spawn</h4>
        <div class="prop-row">
          <label>Spawn Trigger</label>
          <input type="text" data-field="spawnTrigger" value="${this.esc(properties.spawnTrigger ?? '')}" placeholder="arena_wave_1" />
        </div>
        <div class="prop-row">
          <label>Fallable</label>
          <input type="checkbox" data-field="fallable"${fallable ? ' checked' : ''} />
        </div>
      </div>
    `;
  }

  private isLightEmitterEntity(type: string): boolean {
    return type === 'light_point' || type === 'fire_torch';
  }

  private isSlidingDoorEntity(type: string): boolean {
    return type === 'sliding_door';
  }

  private slidingDoorSection(properties: Record<string, string>): string {
    const startOpen = properties.startOpen === 'true';
    return `
      <div class="prop-section">
        <h4>Sliding Door</h4>
        <div class="prop-row">
          <label>Close Trigger</label>
          <input type="text" data-field="closeTriggerId" value="${this.esc(properties.closeTriggerId ?? '')}" placeholder="arena_entry_1" />
        </div>
        <div class="prop-row">
          <label>Encounter ID</label>
          <input type="text" data-field="encounterId" value="${this.esc(properties.encounterId ?? '')}" placeholder="arena_wave_1" />
        </div>
        <div class="prop-row">
          <label>Width</label>
          <input type="number" data-field="width" value="${this.esc(properties.width ?? '5')}" step="0.25" min="1.5" />
        </div>
        <div class="prop-row">
          <label>Height</label>
          <input type="number" data-field="height" value="${this.esc(properties.height ?? '1.85')}" step="0.1" min="0.5" />
        </div>
        <div class="prop-row">
          <label>Thickness</label>
          <input type="number" data-field="thickness" value="${this.esc(properties.thickness ?? '0.5')}" step="0.05" min="0.1" />
        </div>
        <div class="prop-row">
          <label>Travel</label>
          <input type="number" data-field="travel" value="${this.esc(properties.travel ?? '1.8')}" step="0.1" min="0" />
        </div>
        <div class="prop-row">
          <label>Open Speed</label>
          <input type="number" data-field="openSpeed" value="${this.esc(properties.openSpeed ?? '1.9')}" step="0.1" min="0.1" />
        </div>
        <div class="prop-row">
          <label>Start Open</label>
          <input type="checkbox" data-field="startOpen"${startOpen ? ' checked' : ''} />
        </div>
      </div>
    `;
  }

  private surfaceSection(properties: Record<string, string>): string {
    const rawSurfaceType = properties.surfaceType ?? 'normal';
    const surfaceType = rawSurfaceType === 'water' ? 'lava' : rawSurfaceType;
    const drainRate = properties.drainRate ?? '8';
    const waterRippleEnabled = properties.waterRippleEnabled === 'true';
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
        <div class="prop-row">
          <label>Water Ripple</label>
          <input type="checkbox" data-field="waterRippleEnabled"${waterRippleEnabled ? ' checked' : ''} />
        </div>
      </div>
    `;
  }

  private reliefRow(textureId: string | undefined, enabled: boolean | undefined): string {
    const texture = TEXTURE_LIBRARY.find((entry) => entry.id === textureId);
    if (!texture?.hasRelief) return '';
    const isEnabled = enabled === true;
    return `
      <div class="prop-row">
        <label>Use Relief</label>
        <input type="checkbox" data-field="useReliefMap"${isEnabled ? ' checked' : ''} />
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
          else if (field === 'useReliefMap') oldValue = String(poly.useReliefMap === true);
          else if (field === 'surfaceType') oldValue = (poly.properties.surfaceType === 'water' ? 'lava' : (poly.properties.surfaceType ?? 'normal'));
          else if (field === 'drainRate') oldValue = poly.properties.drainRate ?? '8';
          else oldValue = String(poly.properties[field] ?? '');
        } else if (type === 'circle') {
          const circle = this.editor.levelData.getCircle(id);
          if (!circle) return;
          if (field === 'name') oldValue = circle.name;
          else if (field === 'layer') oldValue = circle.layer;
          else if (field === 'color') oldValue = circle.color;
          else if (field === 'textureId') oldValue = circle.textureId ?? '';
          else if (field === 'textureScale') oldValue = String(circle.textureScale ?? 1);
          else if (field === 'useReliefMap') oldValue = String(circle.useReliefMap === true);
          else if (field === 'radius') oldValue = String(circle.radius);
          else oldValue = String(circle.properties[field] ?? '');
        } else {
          const entity = this.editor.levelData.getEntity(id);
          if (!entity) return;
          if (field === 'name') oldValue = entity.name;
          else if (field === 'type') oldValue = entity.type;
          else if (field === 'positionX') oldValue = String(entity.position.x);
          else if (field === 'positionY') oldValue = String(entity.position.y);
          else if (field === 'rotation') oldValue = String(entity.rotation);
          else if (field.startsWith('light:')) oldValue = entity.properties[field.slice(6)] ?? '';
          else oldValue = String(entity.properties[field] ?? '');
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
