import {
  keys, setShiftHeld, setSpinningLaserHeld, triggerCombo, triggerHeat, type Direction,
} from './input';

const STICK_AXIS_THRESHOLD = 0.32;

interface JoystickState {
  pointerId: number | null;
  centerX: number;
  centerY: number;
  radius: number;
}

let rootEl: HTMLDivElement | null = null;
let stickEl: HTMLDivElement;
let stickKnobEl: HTMLDivElement;
const joystick: JoystickState = { pointerId: null, centerX: 0, centerY: 0, radius: 0 };
const heldButtons = new Map<number, HTMLButtonElement>();

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(pointer: coarse)').matches) return true;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function initTouchInput(): void {
  if (rootEl || !isTouchDevice()) return;

  rootEl = document.createElement('div');
  rootEl.className = 'touch-controls';
  rootEl.innerHTML = `
    <div class="touch-stick" id="touch-stick">
      <div class="touch-stick-knob"></div>
    </div>
    <div class="touch-buttons">
      <button type="button" class="touch-btn touch-btn-sprint" data-action="sprint">SPRT</button>
      <button type="button" class="touch-btn touch-btn-combo"  data-action="combo">X</button>
      <button type="button" class="touch-btn touch-btn-heat"   data-action="heat">C</button>
      <button type="button" class="touch-btn touch-btn-laser"  data-action="laser">V</button>
    </div>
  `;
  document.body.appendChild(rootEl);
  document.body.classList.add('touch-mode');

  stickEl = rootEl.querySelector<HTMLDivElement>('#touch-stick')!;
  stickKnobEl = stickEl.querySelector<HTMLDivElement>('.touch-stick-knob')!;

  setupJoystick();
  setupButtons();
}

export function setTouchControlsVisible(visible: boolean): void {
  if (!rootEl) return;
  rootEl.style.display = visible ? 'block' : 'none';
  if (!visible) releaseAllInputs();
}

function setupJoystick(): void {
  stickEl.addEventListener('pointerdown', (e) => {
    if (joystick.pointerId !== null) return;
    e.preventDefault();
    const rect = stickEl.getBoundingClientRect();
    joystick.pointerId = e.pointerId;
    joystick.centerX = rect.left + rect.width / 2;
    joystick.centerY = rect.top + rect.height / 2;
    joystick.radius = Math.min(rect.width, rect.height) * 0.42;
    stickEl.setPointerCapture(e.pointerId);
    updateStick(e.clientX, e.clientY);
  });

  stickEl.addEventListener('pointermove', (e) => {
    if (joystick.pointerId !== e.pointerId) return;
    e.preventDefault();
    updateStick(e.clientX, e.clientY);
  });

  const release = (e: PointerEvent): void => {
    if (joystick.pointerId !== e.pointerId) return;
    e.preventDefault();
    joystick.pointerId = null;
    stickKnobEl.style.transform = '';
    setMoveKey('w', false);
    setMoveKey('a', false);
    setMoveKey('s', false);
    setMoveKey('d', false);
  };
  stickEl.addEventListener('pointerup', release);
  stickEl.addEventListener('pointercancel', release);
}

function updateStick(clientX: number, clientY: number): void {
  const dx = clientX - joystick.centerX;
  const dy = clientY - joystick.centerY;
  const dist = Math.hypot(dx, dy);
  const max = joystick.radius;
  const clamped = Math.min(dist, max);
  const angle = Math.atan2(dy, dx);
  const knobX = Math.cos(angle) * clamped;
  const knobY = Math.sin(angle) * clamped;
  const normX = max > 0 ? knobX / max : 0;
  const normY = max > 0 ? knobY / max : 0;
  stickKnobEl.style.transform = `translate(${knobX}px, ${knobY}px)`;

  setMoveKey('a', normX < -STICK_AXIS_THRESHOLD);
  setMoveKey('d', normX >  STICK_AXIS_THRESHOLD);
  setMoveKey('w', normY < -STICK_AXIS_THRESHOLD);
  setMoveKey('s', normY >  STICK_AXIS_THRESHOLD);
}

function setMoveKey(d: Direction, value: boolean): void {
  keys[d] = value;
}

function setupButtons(): void {
  rootEl!.querySelectorAll<HTMLButtonElement>('.touch-btn').forEach((btn) => {
    const action = btn.dataset.action ?? '';
    btn.addEventListener('pointerdown', (e) => onButtonDown(e, btn, action));
    btn.addEventListener('pointerup',     (e) => onButtonUp(e, btn, action));
    btn.addEventListener('pointercancel', (e) => onButtonUp(e, btn, action));
    btn.addEventListener('pointerleave',  (e) => onButtonUp(e, btn, action));
    // Suppress double-tap zoom and synthetic mouse events.
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

function onButtonDown(e: PointerEvent, btn: HTMLButtonElement, action: string): void {
  if (heldButtons.has(e.pointerId)) return;
  e.preventDefault();
  heldButtons.set(e.pointerId, btn);
  btn.classList.add('pressed');
  btn.setPointerCapture(e.pointerId);
  applyButtonDown(action);
}

function onButtonUp(e: PointerEvent, btn: HTMLButtonElement, action: string): void {
  if (heldButtons.get(e.pointerId) !== btn) return;
  e.preventDefault();
  heldButtons.delete(e.pointerId);
  btn.classList.remove('pressed');
  applyButtonUp(action);
}

function applyButtonDown(action: string): void {
  if (action === 'sprint') setShiftHeld(true);
  else if (action === 'laser') setSpinningLaserHeld(true);
  else if (action === 'combo') triggerCombo();
  else if (action === 'heat') triggerHeat();
}

function applyButtonUp(action: string): void {
  if (action === 'sprint') setShiftHeld(false);
  else if (action === 'laser') setSpinningLaserHeld(false);
  // combo/heat are edge-triggered — nothing to release.
}

function releaseAllInputs(): void {
  setMoveKey('w', false);
  setMoveKey('a', false);
  setMoveKey('s', false);
  setMoveKey('d', false);
  setShiftHeld(false);
  setSpinningLaserHeld(false);
  joystick.pointerId = null;
  stickKnobEl.style.transform = '';
  for (const btn of heldButtons.values()) btn.classList.remove('pressed');
  heldButtons.clear();
}
