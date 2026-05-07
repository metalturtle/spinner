let rootEl: HTMLDivElement | null = null;

const STYLE_ID = 'spinner-sunset-background-style';

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .sunset-background {
      position: fixed;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      z-index: 0;
      background:
        radial-gradient(120% 82% at 50% 108%, rgba(255, 195, 120, 0.94) 0%, rgba(236, 121, 62, 0.74) 26%, rgba(164, 58, 46, 0.42) 47%, rgba(44, 12, 25, 0.08) 72%, rgba(8, 6, 12, 0) 88%),
        linear-gradient(180deg, #0b0710 0%, #1d0c18 22%, #45202a 48%, #7f3a2d 73%, #d77d4f 100%);
    }

    .sunset-background__glow,
    .sunset-background__veil,
    .sunset-background__mist {
      position: absolute;
      inset: -18%;
      filter: blur(26px);
      opacity: 0.95;
      mix-blend-mode: screen;
      will-change: transform, opacity;
    }

    .sunset-background__glow {
      background:
        radial-gradient(52% 34% at 72% 78%, rgba(255, 133, 78, 0.42) 0%, rgba(255, 133, 78, 0) 72%),
        radial-gradient(42% 28% at 24% 74%, rgba(255, 177, 97, 0.24) 0%, rgba(255, 177, 97, 0) 74%);
      animation: sunsetGlowDrift 28s ease-in-out infinite alternate;
    }

    .sunset-background__veil {
      inset: -12%;
      background:
        radial-gradient(66% 40% at 70% 30%, rgba(214, 70, 44, 0.2) 0%, rgba(214, 70, 44, 0) 72%),
        radial-gradient(54% 26% at 18% 26%, rgba(155, 39, 57, 0.18) 0%, rgba(155, 39, 57, 0) 76%);
      animation: sunsetVeilDrift 36s ease-in-out infinite alternate;
      opacity: 0.78;
    }

    .sunset-background__mist {
      inset: 22% -8% -10% -8%;
      background:
        linear-gradient(180deg, rgba(255, 185, 126, 0) 0%, rgba(255, 160, 92, 0.09) 30%, rgba(239, 112, 67, 0.2) 56%, rgba(170, 54, 47, 0.18) 100%);
      filter: blur(34px);
      animation: sunsetMistBreath 18s ease-in-out infinite alternate;
      opacity: 0.9;
    }

    @keyframes sunsetGlowDrift {
      from { transform: translate3d(-2.5%, 0%, 0) scale(1.02); opacity: 0.88; }
      to { transform: translate3d(2.5%, -3%, 0) scale(1.08); opacity: 1; }
    }

    @keyframes sunsetVeilDrift {
      from { transform: translate3d(0%, 0%, 0) scale(1); opacity: 0.68; }
      to { transform: translate3d(-3.5%, 2.2%, 0) scale(1.06); opacity: 0.86; }
    }

    @keyframes sunsetMistBreath {
      from { transform: translate3d(0%, 0%, 0) scaleY(0.98); opacity: 0.72; }
      to { transform: translate3d(0%, -2%, 0) scaleY(1.06); opacity: 0.94; }
    }
  `;
  document.head.appendChild(style);
}

export function initSpaceBackground(): void {
  if (rootEl) return;

  ensureStyles();

  const root = document.createElement('div');
  root.className = 'sunset-background';

  const glow = document.createElement('div');
  glow.className = 'sunset-background__glow';
  root.appendChild(glow);

  const veil = document.createElement('div');
  veil.className = 'sunset-background__veil';
  root.appendChild(veil);

  const mist = document.createElement('div');
  mist.className = 'sunset-background__mist';
  root.appendChild(mist);

  rootEl = root;
  document.body.prepend(root);
}

export function updateSpaceBackground(time: number): void {
  if (!rootEl) return;
  rootEl.style.transform = `translate3d(0, ${Math.sin(time * 0.03) * -0.6}%, 0)`;
}
