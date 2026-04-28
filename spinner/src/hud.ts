import { RPM_SOFT_CAP_RATIO } from './constants';
import { spinnerConfig } from './spinnerConfig';

let el!: HTMLDivElement;
let labelEl!: HTMLDivElement;
let fpsEl!: HTMLDivElement;
let comboWrapEl!: HTMLDivElement;
let comboFillEl!: HTMLDivElement;
let comboLabelEl!: HTMLDivElement;
let smoothedFps = 60;

export interface ComboHudState {
  cooldownFraction: number;
  active: boolean;
  ready: boolean;
  blockedByRpm: boolean;
}

export function initHud(): void {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;bottom:24px;left:28px;pointer-events:none;z-index:5';

  el = document.createElement('div');
  el.style.cssText = 'font:bold 2.6rem monospace;letter-spacing:.05em;transition:color .15s';

  labelEl = document.createElement('div');
  labelEl.style.cssText = 'font:600 0.75rem monospace;opacity:0.4;color:#fff;margin-top:-2px';
  labelEl.textContent = 'RPM';

  comboWrapEl = document.createElement('div');
  comboWrapEl.style.cssText = 'width:148px;height:7px;margin-top:12px;border:1px solid rgba(255,255,255,0.24);background:rgba(7,13,18,0.55);box-shadow:0 0 12px rgba(0,0,0,0.18) inset';

  comboFillEl = document.createElement('div');
  comboFillEl.style.cssText = 'height:100%;width:0%;transform-origin:left center;transition:width .08s linear, background-color .15s linear, box-shadow .15s linear';
  comboWrapEl.appendChild(comboFillEl);

  comboLabelEl = document.createElement('div');
  comboLabelEl.style.cssText = 'font:600 0.7rem monospace;letter-spacing:.06em;opacity:0.68;color:#d7e8ef;margin-top:5px';

  fpsEl = document.createElement('div');
  fpsEl.style.cssText = 'font:600 0.8rem monospace;opacity:0.75;color:#cfd8dc;margin-top:10px';

  wrap.appendChild(el);
  wrap.appendChild(labelEl);
  wrap.appendChild(comboWrapEl);
  wrap.appendChild(comboLabelEl);
  wrap.appendChild(fpsEl);
  document.body.appendChild(wrap);
}

export function updateHud(rpm: number, time: number, delta: number, combo: ComboHudState): void {
  const softCap  = spinnerConfig.rpmCapacity * RPM_SOFT_CAP_RATIO;
  const value    = Math.ceil(Math.max(0, rpm));
  const fraction = Math.max(0, Math.min(rpm, softCap) / softCap);
  const instantFps = delta > 0 ? 1 / delta : smoothedFps;
  smoothedFps += (instantFps - smoothedFps) * 0.1;

  el.textContent = value.toString();
  fpsEl.textContent = `FPS ${Math.round(smoothedFps)}`;

  if (rpm > softCap) {
    // Overcharged — cyan/white pulse
    const pulse = 0.75 + 0.25 * Math.sin(time * 6 * Math.PI * 2);
    const g = Math.round(220 * pulse);
    const b = Math.round(255 * pulse);
    el.style.color      = `rgb(0,${g},${b})`;
    el.style.textShadow = `0 0 22px rgba(0,${g},${b},${pulse * 0.9})`;
  } else if (fraction < 0.25 && fraction > 0) {
    // Critical pulse
    const pulse = 0.6 + 0.4 * Math.sin(time * 8 * Math.PI * 2);
    const r = Math.round(233 * pulse);
    el.style.color      = `rgb(${r},${Math.round(69 * pulse)},${Math.round(96 * pulse)})`;
    el.style.textShadow = `0 0 18px rgba(233,69,96,${pulse * 0.8})`;
  } else {
    const [r, g, b] = rpmRgb(fraction);
    el.style.color      = `rgb(${r},${g},${b})`;
    el.style.textShadow = `0 0 14px rgba(${r},${g},${b},0.5)`;
  }

  const comboFrac = Math.max(0, Math.min(1, combo.cooldownFraction));
  comboFillEl.style.width = `${comboFrac * 100}%`;

  if (combo.active) {
    comboFillEl.style.backgroundColor = '#d7fbff';
    comboFillEl.style.boxShadow = '0 0 14px rgba(215,251,255,0.85)';
    comboLabelEl.textContent = 'X ACTIVE';
    comboLabelEl.style.color = '#f2fdff';
  } else if (combo.ready && !combo.blockedByRpm) {
    comboFillEl.style.backgroundColor = '#7ff9ff';
    comboFillEl.style.boxShadow = '0 0 12px rgba(127,249,255,0.72)';
    comboLabelEl.textContent = 'X READY';
    comboLabelEl.style.color = '#dffcff';
  } else if (combo.ready) {
    comboFillEl.style.backgroundColor = '#ff9a5c';
    comboFillEl.style.boxShadow = '0 0 10px rgba(255,154,92,0.55)';
    comboLabelEl.textContent = 'LOW RPM';
    comboLabelEl.style.color = '#ffbf97';
  } else {
    comboFillEl.style.backgroundColor = '#8ac6df';
    comboFillEl.style.boxShadow = '0 0 8px rgba(138,198,223,0.35)';
    comboLabelEl.textContent = 'X CHARGING';
    comboLabelEl.style.color = '#a9c6d4';
  }
}

function rpmRgb(f: number): [number, number, number] {
  if (f >= 0.6) return [0, 255, 136];                          // green
  if (f >= 0.4) return lerp3([255, 204, 0], [0, 255, 136], (f - 0.4) / 0.2);
  if (f >= 0.2) return lerp3([255, 102, 0], [255, 204, 0],  (f - 0.2) / 0.2);
  return lerp3([233, 69, 96], [255, 102, 0], f / 0.2);         // red → orange
}

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
