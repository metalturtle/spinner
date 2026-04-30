import { RPM_SOFT_CAP_RATIO } from './constants';
import { spinnerConfig } from './spinnerConfig';

let el!: HTMLDivElement;
let labelEl!: HTMLDivElement;
let fpsEl!: HTMLDivElement;
let wrapEl!: HTMLDivElement;
let smoothedFps = 60;
const abilityWrapEls: HTMLDivElement[] = [];
const abilityFillEls: HTMLDivElement[] = [];
const abilityLabelEls: HTMLDivElement[] = [];

export interface AbilityHudState {
  keyLabel: string;
  cooldownFraction: number;
  active: boolean;
  ready: boolean;
  blockedByRpm: boolean;
  unlocked: boolean;
  accent: 'combo' | 'heat' | 'spinning';
}

export function initHud(): void {
  wrapEl = document.createElement('div');
  wrapEl.style.cssText = 'position:fixed;bottom:24px;left:28px;pointer-events:none;z-index:5';

  el = document.createElement('div');
  el.style.cssText = 'font:bold 2.6rem monospace;letter-spacing:.05em;transition:color .15s';

  labelEl = document.createElement('div');
  labelEl.style.cssText = 'font:600 0.75rem monospace;opacity:0.4;color:#fff;margin-top:-2px';
  labelEl.textContent = 'RPM';

  abilityWrapEls.length = 0;
  abilityFillEls.length = 0;
  abilityLabelEls.length = 0;
  for (let i = 0; i < 3; i += 1) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:158px;height:7px;margin-top:12px;border:1px solid rgba(255,255,255,0.24);background:rgba(7,13,18,0.55);box-shadow:0 0 12px rgba(0,0,0,0.18) inset';

    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;width:0%;transform-origin:left center;transition:width .08s linear, background-color .15s linear, box-shadow .15s linear';
    wrap.appendChild(fill);

    const label = document.createElement('div');
    label.style.cssText = 'font:600 0.7rem monospace;letter-spacing:.06em;opacity:0.68;color:#d7e8ef;margin-top:5px';

    abilityWrapEls.push(wrap);
    abilityFillEls.push(fill);
    abilityLabelEls.push(label);
  }

  fpsEl = document.createElement('div');
  fpsEl.style.cssText = 'font:600 0.8rem monospace;opacity:0.75;color:#cfd8dc;margin-top:10px';

  wrapEl.appendChild(el);
  wrapEl.appendChild(labelEl);
  for (let i = 0; i < abilityWrapEls.length; i += 1) {
    wrapEl.appendChild(abilityWrapEls[i]);
    wrapEl.appendChild(abilityLabelEls[i]);
  }
  wrapEl.appendChild(fpsEl);
  document.body.appendChild(wrapEl);
}

export function setHudVisible(visible: boolean): void {
  if (!wrapEl) return;
  wrapEl.style.display = visible ? '' : 'none';
}

function getAbilityPalette(accent: AbilityHudState['accent']): {
  readyFill: string;
  readyGlow: string;
  activeFill: string;
  activeGlow: string;
} {
  switch (accent) {
    case 'heat':
      return {
        readyFill: '#ffb36b',
        readyGlow: '0 0 12px rgba(255,179,107,0.72)',
        activeFill: '#ffe3c0',
        activeGlow: '0 0 14px rgba(255,227,192,0.85)',
      };
    case 'spinning':
      return {
        readyFill: '#ff79ea',
        readyGlow: '0 0 12px rgba(255,121,234,0.72)',
        activeFill: '#ffd5fa',
        activeGlow: '0 0 14px rgba(255,213,250,0.85)',
      };
    default:
      return {
        readyFill: '#7ff9ff',
        readyGlow: '0 0 12px rgba(127,249,255,0.72)',
        activeFill: '#d7fbff',
        activeGlow: '0 0 14px rgba(215,251,255,0.85)',
      };
  }
}

export function updateHud(rpm: number, time: number, delta: number, abilities: AbilityHudState[]): void {
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

  for (let i = 0; i < abilityFillEls.length; i += 1) {
    const ability = abilities[i];
    const fill = abilityFillEls[i];
    const label = abilityLabelEls[i];
    const palette = getAbilityPalette(ability?.accent ?? 'combo');

    if (!ability) {
      fill.style.width = '0%';
      fill.style.backgroundColor = '#445566';
      fill.style.boxShadow = 'none';
      label.textContent = '';
      continue;
    }

    fill.style.width = `${Math.max(0, Math.min(1, ability.cooldownFraction)) * 100}%`;

    if (!ability.unlocked) {
      fill.style.backgroundColor = '#4f6370';
      fill.style.boxShadow = '0 0 8px rgba(79,99,112,0.25)';
      label.textContent = `${ability.keyLabel} LOCKED`;
      label.style.color = '#8fa4af';
    } else if (ability.active) {
      fill.style.backgroundColor = palette.activeFill;
      fill.style.boxShadow = palette.activeGlow;
      label.textContent = `${ability.keyLabel} ACTIVE`;
      label.style.color = '#f6fbff';
    } else if (ability.ready && !ability.blockedByRpm) {
      fill.style.backgroundColor = palette.readyFill;
      fill.style.boxShadow = palette.readyGlow;
      label.textContent = `${ability.keyLabel} READY`;
      label.style.color = '#f1f8fc';
    } else if (ability.ready) {
      fill.style.backgroundColor = '#ff9a5c';
      fill.style.boxShadow = '0 0 10px rgba(255,154,92,0.55)';
      label.textContent = `${ability.keyLabel} LOW RPM`;
      label.style.color = '#ffbf97';
    } else {
      fill.style.backgroundColor = '#8ac6df';
      fill.style.boxShadow = '0 0 8px rgba(138,198,223,0.35)';
      label.textContent = `${ability.keyLabel} CHARGING`;
      label.style.color = '#a9c6d4';
    }
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
