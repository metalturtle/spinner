export type Direction = 'w' | 'a' | 's' | 'd';

const TRACKED_KEYS = new Set<string>(['w', 'a', 's', 'd']);

export const keys: Record<Direction, boolean> = { w: false, a: false, s: false, d: false };
export let shiftHeld = false;
let specialPressed = false;
let profilerTogglePressed = false;
let spectorCapturePressed = false;

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (TRACKED_KEYS.has(key)) keys[key as Direction] = true;
  if (e.key === 'Shift') shiftHeld = true;
  if (key === 'x' && !e.repeat) specialPressed = true;
  if (key === 'p' && !e.repeat) profilerTogglePressed = true;
  if (key === 'o' && !e.repeat) spectorCapturePressed = true;
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (TRACKED_KEYS.has(key)) keys[key as Direction] = false;
  if (e.key === 'Shift') shiftHeld = false;
});

export function consumeSpecialPressed(): boolean {
  if (!specialPressed) return false;
  specialPressed = false;
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
