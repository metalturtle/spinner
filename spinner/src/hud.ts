import { RPM_SOFT_CAP_RATIO } from './constants';
import { spinnerConfig } from './spinnerConfig';

let el!: HTMLDivElement;
let labelEl!: HTMLDivElement;
let fpsEl!: HTMLDivElement;
let smoothedFps = 60;

export function initHud(): void {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;bottom:24px;left:28px;pointer-events:none;z-index:5';

  el = document.createElement('div');
  el.style.cssText = 'font:bold 2.6rem monospace;letter-spacing:.05em;transition:color .15s';

  labelEl = document.createElement('div');
  labelEl.style.cssText = 'font:600 0.75rem monospace;opacity:0.4;color:#fff;margin-top:-2px';
  labelEl.textContent = 'RPM';

  fpsEl = document.createElement('div');
  fpsEl.style.cssText = 'font:600 0.8rem monospace;opacity:0.75;color:#cfd8dc;margin-top:10px';

  wrap.appendChild(el);
  wrap.appendChild(labelEl);
  wrap.appendChild(fpsEl);
  document.body.appendChild(wrap);
}

export function updateHud(rpm: number, time: number, delta: number): void {
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
