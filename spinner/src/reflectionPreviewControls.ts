import type { ReflectionPreviewSphere } from './top';

const PANEL_ID = 'reflection-preview-controls';
const STYLE_ID = 'reflection-preview-controls-style';
const REFLECTION_TOGGLE_ID = 'reflection-preview-toggle';

let panelEl: HTMLDivElement | null = null;
let boundSphere: ReflectionPreviewSphere | null = null;

interface SliderSpec {
  key: keyof ReflectionPreviewSphere['config'];
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: SliderSpec[] = [
  { key: 'repeatX', label: 'Repeat X', min: 0.1, max: 8, step: 0.1 },
  { key: 'repeatY', label: 'Repeat Y', min: 0.1, max: 8, step: 0.1 },
  { key: 'aoIntensity', label: 'AO', min: 0, max: 1.5, step: 0.01 },
  { key: 'normalScale', label: 'Normal', min: 0, max: 2.5, step: 0.01 },
  { key: 'roughness', label: 'Roughness', min: 0, max: 1, step: 0.01 },
  { key: 'metalness', label: 'Metalness', min: 0, max: 1, step: 0.01 },
  { key: 'emissiveIntensity', label: 'Emissive', min: 0, max: 0.5, step: 0.01 },
  { key: 'keyLightIntensity', label: 'Key', min: 0, max: 40, step: 0.25 },
  { key: 'fillLightIntensity', label: 'Fill', min: 0, max: 30, step: 0.25 },
  { key: 'rimLightIntensity', label: 'Rim', min: 0, max: 30, step: 0.25 },
];

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .reflection-preview-controls {
      position: fixed;
      top: 18px;
      right: 18px;
      z-index: 30;
      width: 280px;
      padding: 12px 14px;
      border-radius: 12px;
      background: rgba(8, 12, 18, 0.88);
      border: 1px solid rgba(180, 210, 255, 0.18);
      color: #edf4ff;
      font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      backdrop-filter: blur(10px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
    }
    .reflection-preview-controls__title {
      margin: 0 0 10px;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #b8d8ff;
    }
    .reflection-preview-controls__row {
      display: grid;
      grid-template-columns: 70px 1fr 48px;
      gap: 8px;
      align-items: center;
      margin: 6px 0;
    }
    .reflection-preview-controls__label {
      color: #c7d5ea;
    }
    .reflection-preview-controls__value {
      text-align: right;
      color: #ffffff;
      opacity: 0.9;
    }
    .reflection-preview-controls input[type="range"] {
      width: 100%;
      accent-color: #9cd6ff;
    }
    .reflection-preview-controls__toggle {
      width: 100%;
      margin: 0 0 10px;
      padding: 8px 10px;
      border-radius: 9px;
      border: 1px solid rgba(180, 210, 255, 0.22);
      background: rgba(18, 28, 40, 0.95);
      color: #eef7ff;
      cursor: pointer;
      font: inherit;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .reflection-preview-controls__toggle.is-off {
      opacity: 0.7;
      background: rgba(18, 22, 28, 0.95);
    }
  `;
  document.head.appendChild(style);
}

function buildPanel(): HTMLDivElement {
  ensureStyles();
  const root = document.createElement('div');
  root.id = PANEL_ID;
  root.className = 'reflection-preview-controls';
  root.innerHTML = `
    <div class="reflection-preview-controls__title">Sphere Material</div>
    <button id="${REFLECTION_TOGGLE_ID}" class="reflection-preview-controls__toggle" type="button">Reflections: On</button>
  `;

  for (const slider of SLIDERS) {
    const row = document.createElement('div');
    row.className = 'reflection-preview-controls__row';
    row.innerHTML = `
      <label class="reflection-preview-controls__label">${slider.label}</label>
      <input data-key="${slider.key}" type="range" min="${slider.min}" max="${slider.max}" step="${slider.step}">
      <div class="reflection-preview-controls__value" data-value="${slider.key}"></div>
    `;
    root.appendChild(row);
  }

  document.body.appendChild(root);
  return root;
}

function syncPanelFromSphere(): void {
  if (!panelEl || !boundSphere) return;
  const toggle = panelEl.querySelector<HTMLButtonElement>(`#${REFLECTION_TOGGLE_ID}`);
  if (toggle) {
    const on = boundSphere.config.reflectionsEnabled > 0.5;
    toggle.textContent = `Reflections: ${on ? 'On' : 'Off'}`;
    toggle.classList.toggle('is-off', !on);
  }
  for (const slider of SLIDERS) {
    const input = panelEl.querySelector<HTMLInputElement>(`input[data-key="${slider.key}"]`);
    const valueEl = panelEl.querySelector<HTMLDivElement>(`[data-value="${slider.key}"]`);
    if (!input || !valueEl) continue;
    const value = boundSphere.config[slider.key];
    input.value = String(value);
    valueEl.textContent = Number(value).toFixed(slider.step < 1 ? 2 : 1);
  }
}

export function initReflectionPreviewControls(): void {
  if (panelEl) return;
  panelEl = buildPanel();
  panelEl.addEventListener('click', (event) => {
    if (!boundSphere) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.id !== REFLECTION_TOGGLE_ID) return;
    const next = boundSphere.config.reflectionsEnabled > 0.5 ? 0 : 1;
    boundSphere.applyConfig({ reflectionsEnabled: next });
    syncPanelFromSphere();
  });
  panelEl.addEventListener('input', (event) => {
    if (!boundSphere) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const key = target.dataset.key as keyof ReflectionPreviewSphere['config'] | undefined;
    if (!key) return;
    boundSphere.applyConfig({ [key]: Number(target.value) });
    syncPanelFromSphere();
  });
}

export function bindReflectionPreviewSphere(sphere: ReflectionPreviewSphere | null): void {
  boundSphere = sphere;
  if (!panelEl) return;
  panelEl.style.display = sphere ? 'block' : 'none';
  syncPanelFromSphere();
}
