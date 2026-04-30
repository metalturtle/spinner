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
  if (!import.meta.env.DEV) return null;

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
