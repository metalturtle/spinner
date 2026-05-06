import type { Spector } from 'spectorjs';

interface SpectorModule {
  Spector: typeof Spector;
}

export interface SpectorCaptureController {
  captureFrame(): void;
}

export async function createSpectorCaptureController(
  canvas: HTMLCanvasElement,
): Promise<SpectorCaptureController | null> {
  // No build-environment gate here. The caller (game.ts) decides via the
  // ?spector=1 URL flag, so this can be triggered from production builds
  // when intentionally debugging GPU work.
  try {
    const mod = await import('spectorjs') as unknown as SpectorModule;
    const spector = new mod.Spector();
    spector.displayUI();
    spector.spyCanvases();

    console.info('[spector] Ready. Press O to capture the current canvas frame.');

    return {
      captureFrame(): void {
        try {
          spector.captureCanvas(canvas);
          console.info('[spector] Capture requested for the current canvas frame.');
        } catch (error) {
          console.warn('[spector] Failed to capture canvas frame.', error);
        }
      },
    };
  } catch (error) {
    console.warn('[spector] Failed to initialize Spector.js.', error);
    return null;
  }
}
