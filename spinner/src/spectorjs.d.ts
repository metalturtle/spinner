declare module 'spectorjs' {
  export class Spector {
    constructor();
    displayUI(): void;
    spyCanvases(): void;
    captureCanvas(canvas: HTMLCanvasElement): void;
  }
}
