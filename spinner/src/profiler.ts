import {
  createEmptyPhaseDurations,
  type FrameCounts,
  type FrameMode,
  type FrameSample,
  type OverlaySummary,
  type ProfilerConfig,
  type ProfilerPhase,
  type ProfilerWorkerOutMessage,
  type RenderStats,
  type SceneStats,
} from './profilerTypes';

export class GameProfiler {
  private readonly worker: Worker;
  private readonly overlayEl: HTMLDivElement;
  private currentSample: FrameSample | null = null;
  private currentPhase: ProfilerPhase = 'frameStart';
  private frameStartMs = 0;
  private phaseStartMs = 0;
  private overlayVisible: boolean;
  private enabled = true;
  private lastOverlayText = '';

  constructor(private readonly config: ProfilerConfig) {
    this.overlayVisible = config.overlayEnabled;
    this.overlayEl = document.createElement('div');
    this.overlayEl.style.cssText = [
      'position:fixed',
      'top:18px',
      'right:18px',
      'min-width:230px',
      'padding:12px 14px',
      'border:1px solid rgba(125,242,255,0.28)',
      'background:rgba(8,15,24,0.82)',
      'backdrop-filter:blur(8px)',
      'box-shadow:0 10px 28px rgba(0,0,0,0.28)',
      'color:#dffcff',
      'font:600 0.73rem/1.45 monospace',
      'letter-spacing:0.03em',
      'white-space:pre',
      'pointer-events:none',
      'z-index:9',
      'display:none',
    ].join(';');
    this.overlayEl.textContent = 'Profiler active\nWaiting for samples...';
    document.body.appendChild(this.overlayEl);
    this.syncOverlayVisibility();

    this.worker = new Worker(new URL('./telemetry.worker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', (event: MessageEvent<ProfilerWorkerOutMessage>) => {
      if (event.data.type !== 'summary') return;
      this.renderOverlay(event.data.summary);
    });
    this.worker.addEventListener('error', (event) => {
      console.warn('[profiler] Worker failed; disabling profiler.', event.error ?? event.message);
      this.disable();
    });
    this.worker.postMessage({
      type: 'init',
      batchWindowMs: config.batchWindowMs,
      collectorBaseUrl: config.collectorBaseUrl,
    });

    window.addEventListener('beforeunload', () => this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
  }

  toggleOverlay(): void {
    if (!this.enabled) return;
    this.overlayVisible = !this.overlayVisible;
    this.syncOverlayVisibility();
  }

  startFrame(deltaMs: number, mode: FrameMode): void {
    if (!this.enabled) return;

    const phaseMs = createEmptyPhaseDurations();
    const timestamp = performance.timeOrigin + performance.now();
    this.frameStartMs = performance.now();
    this.phaseStartMs = this.frameStartMs;
    this.currentPhase = 'frameStart';
    this.currentSample = {
      timestamp,
      deltaMs,
      frameMs: 0,
      mode,
      phaseMs,
      renderStats: { drawCalls: 0, triangles: 0, lines: 0 },
      counts: {
        projectiles: 0,
        pickups: 0,
        explosions: 0,
        enemies: 0,
        bosses: 0,
        collidables: 0,
        collidablesTotal: 0,
        torches: 0,
      },
      sceneStats: {
        totalObjects: 0,
        visibleMeshes: 0,
        totalMeshes: 0,
        pointLights: 0,
        shadowCasters: 0,
      },
    };
  }

  nextPhase(nextPhase: ProfilerPhase): void {
    if (!this.enabled || !this.currentSample) return;

    const now = performance.now();
    this.currentSample.phaseMs[this.currentPhase] += now - this.phaseStartMs;
    this.currentPhase = nextPhase;
    this.phaseStartMs = now;
  }

  finishFrame(renderStats: RenderStats, counts: FrameCounts, sceneStats: SceneStats): void {
    if (!this.enabled || !this.currentSample) return;

    const now = performance.now();
    this.currentSample.phaseMs[this.currentPhase] += now - this.phaseStartMs;

    const frameEndStart = performance.now();
    this.currentSample.phaseMs.frameEnd += performance.now() - frameEndStart;
    this.currentSample.frameMs = performance.now() - this.frameStartMs;
    this.currentSample.renderStats = renderStats;
    this.currentSample.counts = counts;
    this.currentSample.sceneStats = sceneStats;

    this.worker.postMessage({ type: 'sample', sample: this.currentSample });
    this.currentSample = null;
  }

  flush(): void {
    if (!this.enabled) return;
    this.worker.postMessage({ type: 'flush' });
  }

  private disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.currentSample = null;
    this.overlayEl.style.display = 'none';
    this.worker.terminate();
  }

  private syncOverlayVisibility(): void {
    this.overlayEl.style.display = this.overlayVisible ? '' : 'none';
  }

  private renderOverlay(summary: OverlaySummary): void {
    if (!this.overlayVisible) return;

    const collectorLabel = summary.collectorConnected ? 'collector on' : 'collector off';
    const next = [
      `Profiler ${collectorLabel} ${summary.dominantMode}`,
      `FPS ${summary.fps.toFixed(1)}`,
      `Frame ${summary.frameAvgMs.toFixed(2)} / ${summary.frameMaxMs.toFixed(2)} ms`,
      `Render ${summary.renderAvgMs.toFixed(2)} / ${summary.renderMaxMs.toFixed(2)} ms`,
      `Collision ${summary.collisionAvgMs.toFixed(2)} / ${summary.collisionMaxMs.toFixed(2)} ms`,
      `Draw ${summary.drawCallsAvg.toFixed(1)} calls`,
      `Tris ${Math.round(summary.trianglesAvg)}`,
      `Meshes ${summary.visibleMeshesAvg.toFixed(1)}  Lights ${summary.pointLightsAvg.toFixed(1)}`,
      `Projectiles ${summary.projectilesAvg.toFixed(1)}`,
      `Pickups ${summary.pickupsAvg.toFixed(1)}`,
      'P toggle overlay',
    ].join('\n');
    if (next === this.lastOverlayText) return;
    this.lastOverlayText = next;
    this.overlayEl.textContent = next;
  }
}

export function createProfiler(config: ProfilerConfig): GameProfiler | null {
  if (!config.enabled) return null;

  try {
    return new GameProfiler(config);
  } catch (error) {
    console.warn('[profiler] Failed to initialize profiler.', error);
    return null;
  }
}
