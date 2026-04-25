import { Editor } from './editor/Editor';
import { PolygonTool } from './tools/PolygonTool';
import { RectangleTool } from './tools/RectangleTool';
import { RoomTool } from './tools/RoomTool';
import { CircleTool } from './tools/CircleTool';
import { SelectTool } from './tools/SelectTool';
import { EntityTool } from './tools/EntityTool';
import { RegularPolygonTool } from './tools/RegularPolygonTool';
import { PolygonRenderer } from './rendering/PolygonRenderer';
import { CircleRenderer } from './rendering/CircleRenderer';
import { EntityRenderer } from './rendering/EntityRenderer';
import { GizmoRenderer } from './rendering/GizmoRenderer';
import { SnapCursor } from './rendering/SnapCursor';
import { LightingPreviewManager } from './rendering/LightingPreviewManager';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { saveLevel, loadLevel, loadActiveLevel } from './data/Serializer';
import { BooleanOpCmd } from './commands/BooleanOpCmd';
import type { BooleanOp } from './utils/csg';
import {
  CUSTOM_ENTITY_TYPE_VALUE,
  ENTITY_TYPE_OPTIONS,
  isKnownEntityType,
} from './data/entityTypes';

const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
const editor = new Editor(canvas);

// Renderers
const polygonRenderer = new PolygonRenderer(editor.scene, editor.levelData);
const circleRenderer = new CircleRenderer(editor.scene, editor.levelData);
const entityRenderer = new EntityRenderer(editor.scene, editor.levelData);
const gizmoRenderer = new GizmoRenderer(editor.scene, editor.levelData, editor.selection);
const lightingPreview = new LightingPreviewManager(editor.scene, editor.levelData);
const snapCursor = new SnapCursor(editor.scene);
editor.input.setSnapCursor(snapCursor);

// Tools
const selectTool = new SelectTool(editor, polygonRenderer, entityRenderer, circleRenderer, gizmoRenderer);
const polygonTool = new PolygonTool(editor);
const rectangleTool = new RectangleTool(editor);
const roomTool = new RoomTool(editor);
const circleTool = new CircleTool(editor);
const entityTool = new EntityTool(editor);
const regPolyTool = new RegularPolygonTool(editor);

editor.registerTool(selectTool);
editor.registerTool(polygonTool);
editor.registerTool(rectangleTool);
editor.registerTool(roomTool);
editor.registerTool(circleTool);
editor.registerTool(entityTool);
editor.registerTool(regPolyTool);

// Default to select tool
editor.setActiveTool('select');

// Properties panel
new PropertiesPanel(editor);

void loadActiveLevel(editor.levelData);

// Start render loop
editor.start();

// --- Toolbar wiring ---
const toolButtons = document.querySelectorAll<HTMLButtonElement>('.tool-btn');
const statusTool = document.getElementById('status-tool')!;
const entityTypeSelector = document.getElementById('entity-type-selector')!;
const entityTypeDropdown = document.getElementById('entity-type-dropdown') as HTMLSelectElement;
const entityTypeCustom = document.getElementById('entity-type-custom') as HTMLInputElement;
const entityTypeSuggestions = document.getElementById('entity-type-suggestions') as HTMLDataListElement;
const roomConfig = document.getElementById('room-config')!;
const regpolyConfig = document.getElementById('regpoly-config')!;
const wallThicknessInput = document.getElementById('wall-thickness') as HTMLInputElement;

function renderEntityTypeControls(): void {
  entityTypeDropdown.innerHTML = [
    ...ENTITY_TYPE_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`),
    `<option value="${CUSTOM_ENTITY_TYPE_VALUE}">Custom</option>`,
  ].join('');

  entityTypeSuggestions.innerHTML = ENTITY_TYPE_OPTIONS
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join('');
}

function syncEntityTypeControls(type: string): void {
  entityTypeCustom.value = type;
  entityTypeDropdown.value = isKnownEntityType(type) ? type : CUSTOM_ENTITY_TYPE_VALUE;
}

function setToolbarEntityType(type: string): void {
  const nextType = type.trim();
  if (!nextType) {
    syncEntityTypeControls(entityTool.getEntityType());
    return;
  }

  entityTool.setEntityType(nextType);
  syncEntityTypeControls(nextType);
}

renderEntityTypeControls();
syncEntityTypeControls(entityTool.getEntityType());

function activateTool(toolName: string) {
  editor.setActiveTool(toolName);
  toolButtons.forEach((b) => b.classList.remove('active'));
  document.querySelector(`.tool-btn[data-tool="${toolName}"]`)?.classList.add('active');
  statusTool.textContent = `Tool: ${toolName.charAt(0).toUpperCase() + toolName.slice(1)}`;
  entityTypeSelector.style.display = toolName === 'entity' ? '' : 'none';
  roomConfig.style.display = toolName === 'room' ? '' : 'none';
  regpolyConfig.style.display = toolName === 'regpoly' ? '' : 'none';
}

toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => activateTool(btn.dataset.tool!));
});

// Keyboard shortcuts for tool switching
window.addEventListener('keydown', (e) => {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
  if (e.key === '1') activateTool('select');
  else if (e.key === '2') activateTool('polygon');
  else if (e.key === '3') activateTool('rectangle');
  else if (e.key === '4') activateTool('room');
  else if (e.key === '5') activateTool('circle');
  else if (e.key === '6') activateTool('entity');
  else if (e.key === '7') activateTool('regpoly');
});

// Entity type dropdown
entityTypeDropdown.addEventListener('change', () => {
  if (entityTypeDropdown.value === CUSTOM_ENTITY_TYPE_VALUE) {
    entityTypeCustom.focus();
    entityTypeCustom.select();
    return;
  }

  setToolbarEntityType(entityTypeDropdown.value);
});

entityTypeCustom.addEventListener('change', () => {
  setToolbarEntityType(entityTypeCustom.value);
});

// Room config
wallThicknessInput.addEventListener('change', () => {
  roomTool.setWallThickness(parseFloat(wallThicknessInput.value) || 1);
});

// Regular polygon config
const regpolySidesInput = document.getElementById('regpoly-sides') as HTMLInputElement;
regpolySidesInput.addEventListener('change', () => {
  regPolyTool.setSides(parseInt(regpolySidesInput.value, 10) || 6);
});

const roomShapeSelect = document.getElementById('room-shape') as HTMLSelectElement;
roomShapeSelect.addEventListener('change', () => {
  roomTool.setRoomShape(roomShapeSelect.value as 'rect' | 'circle');
});

// --- CSG panel wiring ---
const csgPanel = document.getElementById('csg-panel')!;

editor.selection.onMultiChange((items) => {
  const twoPolygons = items.length === 2
    && items[0].type === 'polygon'
    && items[1].type === 'polygon';
  csgPanel.style.display = twoPolygons ? '' : 'none';
});

function executeCsg(op: BooleanOp) {
  const items = editor.selection.selectedItems;
  if (items.length !== 2 || items[0].type !== 'polygon' || items[1].type !== 'polygon') return;

  const cmd = new BooleanOpCmd(editor.levelData, op, items[0].id, items[1].id);
  editor.selection.deselect();
  editor.commandHistory.execute(cmd);

  // Auto-select first result
  const resultIds = cmd.getResultIds();
  if (resultIds.length > 0) {
    editor.selection.select('polygon', resultIds[0]);
  }
}

document.getElementById('btn-csg-union')!.addEventListener('click', () => executeCsg('union'));
document.getElementById('btn-csg-subtract')!.addEventListener('click', () => executeCsg('difference'));
document.getElementById('btn-csg-intersect')!.addEventListener('click', () => executeCsg('intersection'));

// Snap toggle
const snapCheckbox = document.getElementById('snap-checkbox') as HTMLInputElement;
snapCheckbox.addEventListener('change', () => {
  editor.input.setSnapEnabled(snapCheckbox.checked);
});

const lightingPreviewCheckbox = document.getElementById('lighting-preview-checkbox') as HTMLInputElement;
lightingPreviewCheckbox.addEventListener('change', () => {
  const enabled = lightingPreviewCheckbox.checked;
  lightingPreview.setEnabled(enabled);
  polygonRenderer.setLightingPreviewEnabled(enabled);
  circleRenderer.setLightingPreviewEnabled(enabled);
  entityRenderer.setLightingPreviewEnabled(enabled);
});

// Undo/Redo buttons
document.getElementById('btn-undo')!.addEventListener('click', () => editor.commandHistory.undo());
document.getElementById('btn-redo')!.addEventListener('click', () => editor.commandHistory.redo());

// Save/Load
document.getElementById('btn-save')!.addEventListener('click', async () => {
  await saveLevel(editor.levelData);
});
document.getElementById('btn-load')!.addEventListener('click', () => loadLevel(editor.levelData));

// Status bar updates
const statusPos = document.getElementById('status-pos')!;
const statusZoom = document.getElementById('status-zoom')!;

canvas.addEventListener('pointermove', (e) => {
  const cam = editor.camera.camera;
  const ndcX = (e.clientX / canvas.clientWidth) * 2 - 1;
  const ndcY = -(e.clientY / canvas.clientHeight) * 2 + 1;
  const worldX = ndcX * (cam.right - cam.left) / (2 * cam.zoom) + cam.position.x;
  const worldY = ndcY * (cam.top - cam.bottom) / (2 * cam.zoom) + cam.position.y;
  statusPos.textContent = `X: ${worldX.toFixed(1)} Y: ${worldY.toFixed(1)}`;
});

canvas.addEventListener('wheel', () => {
  statusZoom.textContent = `Zoom: ${Math.round(editor.camera.camera.zoom * 100)}%`;
});

// Expose editor globally for debugging
(window as any).editor = editor;
