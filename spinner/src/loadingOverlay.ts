import type { LoadProgressState } from './assetLoader';

let overlayEl: HTMLDivElement | null = null;
let titleEl: HTMLHeadingElement | null = null;
let detailEl: HTMLParagraphElement | null = null;
let fillEl: HTMLDivElement | null = null;
let countEl: HTMLDivElement | null = null;

function ensureOverlay(): void {
  if (overlayEl) return;

  overlayEl = document.createElement('div');
  overlayEl.className = 'app-overlay loading-overlay';
  overlayEl.innerHTML = `
    <div class="overlay-card overlay-card-compact loading-card">
      <div class="overlay-kicker">Spinner</div>
      <h2 class="loading-title">Loading Arena</h2>
      <p class="overlay-copy loading-detail">Preparing systems...</p>
      <div class="loading-meter" aria-hidden="true">
        <div class="loading-meter-fill"></div>
      </div>
      <div class="loading-meta">0%</div>
    </div>
  `;
  document.body.appendChild(overlayEl);

  titleEl = overlayEl.querySelector<HTMLHeadingElement>('.loading-title');
  detailEl = overlayEl.querySelector<HTMLParagraphElement>('.loading-detail');
  fillEl = overlayEl.querySelector<HTMLDivElement>('.loading-meter-fill');
  countEl = overlayEl.querySelector<HTMLDivElement>('.loading-meta');
}

export function showLoadingOverlay(title = 'Loading Arena', detail = 'Preparing systems...'): void {
  ensureOverlay();
  if (!overlayEl || !titleEl || !detailEl || !fillEl || !countEl) return;
  titleEl.textContent = title;
  detailEl.textContent = detail;
  fillEl.style.width = '0%';
  countEl.textContent = '0%';
  overlayEl.style.display = 'flex';
}

export function updateLoadingOverlay(state: LoadProgressState): void {
  ensureOverlay();
  if (!detailEl || !fillEl || !countEl) return;
  const percent = Math.round(state.progress * 100);
  detailEl.textContent = state.activeLabel;
  fillEl.style.width = `${percent}%`;
  countEl.textContent = `${percent}% · ${state.completedTasks}/${state.totalTasks}`;
}

export function hideLoadingOverlay(): void {
  if (!overlayEl) return;
  overlayEl.style.display = 'none';
}
