// Lightweight in-game notification toasts.
// One module-level stack near the top of the screen; each toast animates
// in via CSS, holds, then animates out and is removed from the DOM.

const TOAST_HOLD_MS = 1800;
const TOAST_EXIT_MS = 360;

export type ToastKind = 'checkpoint' | 'unlock' | 'info';

let stackEl: HTMLDivElement | null = null;

export function initToasts(): void {
  if (stackEl) return;
  stackEl = document.createElement('div');
  stackEl.className = 'toast-stack';
  document.body.appendChild(stackEl);
}

export function showToast(text: string, kind: ToastKind = 'info'): void {
  if (!stackEl) initToasts();
  const root = stackEl;
  if (!root) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${kind}`;
  toast.textContent = text;
  root.appendChild(toast);

  // Force a layout flush so the entry animation actually plays.
  void toast.offsetWidth;
  toast.classList.add('toast-enter');

  window.setTimeout(() => {
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-exit');
    window.setTimeout(() => toast.remove(), TOAST_EXIT_MS);
  }, TOAST_HOLD_MS);
}

export function clearToasts(): void {
  if (!stackEl) return;
  while (stackEl.firstChild) stackEl.removeChild(stackEl.firstChild);
}
