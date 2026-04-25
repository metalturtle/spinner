export type Direction = 'w' | 'a' | 's' | 'd';

const TRACKED_KEYS = new Set<string>(['w', 'a', 's', 'd']);

export const keys: Record<Direction, boolean> = { w: false, a: false, s: false, d: false };
export let shiftHeld = false;

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (TRACKED_KEYS.has(key)) keys[key as Direction] = true;
  if (e.key === 'Shift') shiftHeld = true;
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (TRACKED_KEYS.has(key)) keys[key as Direction] = false;
  if (e.key === 'Shift') shiftHeld = false;
});
