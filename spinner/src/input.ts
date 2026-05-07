export type Direction = 'w' | 'a' | 's' | 'd';

const TRACKED_KEYS = new Set<string>(['w', 'a', 's', 'd']);

export const keys: Record<Direction, boolean> = { w: false, a: false, s: false, d: false };
export let shiftHeld = false;
export let spinningLaserHeld = false;
let comboPressed = false;
let heatPressed = false;
let profilerTogglePressed = false;
let spectorCapturePressed = false;

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (TRACKED_KEYS.has(key)) keys[key as Direction] = true;
  if (e.key === 'Shift') shiftHeld = true;
  if (key === 'x' && !e.repeat) comboPressed = true;
  if (key === 'c' && !e.repeat) heatPressed = true;
  if (key === 'v') spinningLaserHeld = true;
  if (key === 'p' && !e.repeat) profilerTogglePressed = true;
  if (key === 'o' && !e.repeat) spectorCapturePressed = true;
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (TRACKED_KEYS.has(key)) keys[key as Direction] = false;
  if (e.key === 'Shift') shiftHeld = false;
  if (key === 'v') spinningLaserHeld = false;
});

export function consumeComboPressed(): boolean {
  if (!comboPressed) return false;
  comboPressed = false;
  return true;
}

export function consumeHeatPressed(): boolean {
  if (!heatPressed) return false;
  heatPressed = false;
  return true;
}

export function consumeProfilerTogglePressed(): boolean {
  if (!profilerTogglePressed) return false;
  profilerTogglePressed = false;
  return true;
}

export function consumeSpectorCapturePressed(): boolean {
  if (!spectorCapturePressed) return false;
  spectorCapturePressed = false;
  return true;
}

// ─── Mutators (used by touch input to drive the same state as the keyboard) ──

export function setShiftHeld(value: boolean): void {
  shiftHeld = value;
}

export function setSpinningLaserHeld(value: boolean): void {
  spinningLaserHeld = value;
}

export function triggerCombo(): void {
  comboPressed = true;
}

export function triggerHeat(): void {
  heatPressed = true;
}
