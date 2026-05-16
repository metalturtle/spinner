import { getSpinner1ModelConfig, updateSpinner1ModelConfig, type Spinner1ModelConfig } from './top';

const PANEL_ID = 'spinner1-model-controls';
const STYLE_ID = 'spinner1-model-controls-style';

let panelEl: HTMLDivElement | null = null;

interface SliderSpec {
  key: keyof Spinner1ModelConfig;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: SliderSpec[] = [
  { key: 'rotationXDeg', label: 'Rot X', min: -180, max: 180, step: 1 },
  { key: 'rotationYDeg', label: 'Rot Y', min: -180, max: 180, step: 1 },
  { key: 'rotationZDeg', label: 'Rot Z', min: -180, max: 180, step: 1 },
  { key: 'spinSpeedScale', label: 'Spin', min: 0, max: 1, step: 0.01 },
];

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .spinner1-model-controls {
      position: fixed;
      top: 18px;
      right: 318px;
      z-index: 30;
      width: 220px;
      padding: 12px 14px;
      border-radius: 12px;
      background: rgba(8, 12, 18, 0.88);
      border: 1px solid rgba(180, 210, 255, 0.18);
      color: #edf4ff;
      font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      backdrop-filter: blur(10px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
    }
    .spinner1-model-controls__title {
      margin: 0 0 10px;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #b8d8ff;
    }
    .spinner1-model-controls__row {
      display: grid;
      grid-template-columns: 48px 1fr 44px;
      gap: 8px;
      align-items: center;
      margin: 6px 0;
    }
    .spinner1-model-controls__label {
      color: #c7d5ea;
    }
    .spinner1-model-controls__value {
      text-align: right;
      color: #ffffff;
      opacity: 0.9;
    }
    .spinner1-model-controls input[type="range"] {
      width: 100%;
      accent-color: #9cd6ff;
    }
  `;
  document.head.appendChild(style);
}

function buildPanel(): HTMLDivElement {
  ensureStyles();
  const root = document.createElement('div');
  root.id = PANEL_ID;
  root.className = 'spinner1-model-controls';
  root.innerHTML = `<div class="spinner1-model-controls__title">Spinner1 FBX</div>`;

  for (const slider of SLIDERS) {
    const row = document.createElement('div');
    row.className = 'spinner1-model-controls__row';
    row.innerHTML = `
      <label class="spinner1-model-controls__label">${slider.label}</label>
      <input data-key="${slider.key}" type="range" min="${slider.min}" max="${slider.max}" step="${slider.step}">
      <div class="spinner1-model-controls__value" data-value="${slider.key}"></div>
    `;
    root.appendChild(row);
  }

  document.body.appendChild(root);
  return root;
}

function syncPanel(): void {
  if (!panelEl) return;
  const config = getSpinner1ModelConfig();
  for (const slider of SLIDERS) {
    const input = panelEl.querySelector<HTMLInputElement>(`input[data-key="${slider.key}"]`);
    const valueEl = panelEl.querySelector<HTMLDivElement>(`[data-value="${slider.key}"]`);
    if (!input || !valueEl) continue;
    const value = config[slider.key];
    input.value = String(value);
    valueEl.textContent = Number(value).toFixed(slider.step < 1 ? 2 : 0);
  }
}

export function initSpinner1ModelControls(): void {
  if (panelEl) return;
  panelEl = buildPanel();
  panelEl.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const key = target.dataset.key as keyof Spinner1ModelConfig | undefined;
    if (!key) return;
    updateSpinner1ModelConfig({ [key]: Number(target.value) });
    syncPanel();
  });
  syncPanel();
}
