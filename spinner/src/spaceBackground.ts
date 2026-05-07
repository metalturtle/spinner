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
        radial-gradient(122% 84% at 50% 110%, rgba(255, 179, 88, 0.96) 0%, rgba(244, 115, 18, 0.82) 24%, rgba(82, 22, 10, 0.12) 66%, rgba(0, 0, 0, 0) 86%),
        linear-gradient(180deg, #020202 0%, #090403 18%, #1a0804 38%, #4a180c 66%, #c66023 100%);
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
        radial-gradient(56% 36% at 74% 80%, rgba(255, 124, 48, 0.46) 0%, rgba(255, 124, 48, 0) 72%),
        radial-gradient(44% 30% at 24% 76%, rgba(255, 171, 74, 0.28) 0%, rgba(255, 171, 74, 0) 74%);
      animation: sunsetGlowDrift 28s ease-in-out infinite alternate;
    }

    .sunset-background__veil {
      inset: -12%;
      background:
        radial-gradient(66% 40% at 70% 30%, rgba(218, 84, 30, 0.22) 0%, rgba(218, 84, 30, 0) 72%),
        radial-gradient(54% 26% at 18% 26%, rgba(108, 26, 12, 0.16) 0%, rgba(108, 26, 12, 0) 76%);
      animation: sunsetVeilDrift 36s ease-in-out infinite alternate;
      opacity: 0.78;
    }

    .sunset-background__mist {
      inset: 22% -8% -10% -8%;
      background:
        linear-gradient(180deg, rgba(255, 185, 126, 0) 0%, rgba(255, 162, 88, 0.08) 30%, rgba(232, 104, 32, 0.22) 56%, rgba(125, 36, 12, 0.18) 100%);
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
