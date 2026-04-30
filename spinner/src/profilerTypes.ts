export const PROFILER_PHASES = [
  'frameStart',
  'entityUpdate',
  'movement',
  'sync',
  'collision',
  'collisionDispatch',
  'proximity',
  'rpm',
  'deathChecks',
  'visuals',
  'effects',
  'render',
  'frameEnd',
] as const;

export type ProfilerPhase = typeof PROFILER_PHASES[number];

export interface ProfilerConfig {
  enabled: boolean;
  overlayEnabled: boolean;
  batchWindowMs: number;
  collectorBaseUrl: string;
}

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  lines: number;
}

export type FrameMode = 'menu' | 'gameplay' | 'gameOver' | 'respawn';

export interface FrameCounts {
  projectiles: number;
  pickups: number;
  explosions: number;
  enemies: number;
  bosses: number;
  collidables: number;
  collidablesTotal: number;
  torches: number;
}

export interface SceneStats {
  totalObjects: number;
  visibleMeshes: number;
  totalMeshes: number;
  pointLights: number;
  shadowCasters: number;
}

export interface FrameSample {
  timestamp: number;
  deltaMs: number;
  frameMs: number;
  mode: FrameMode;
  phaseMs: Record<ProfilerPhase, number>;
  renderStats: RenderStats;
  counts: FrameCounts;
  sceneStats: SceneStats;
}

export interface NumericAggregate {
  avg: number;
  max: number;
  p95: number;
}

export interface RangeAggregate {
  min: number;
  max: number;
  avg: number;
}

export interface PerfWindowRecord {
  sessionId: null | string;
  windowStart: number;
  windowDurationMs: number;
  dominantMode: FrameMode;
  frameMs: NumericAggregate;
  phaseMs: Record<ProfilerPhase, NumericAggregate>;
  renderStats: Record<keyof RenderStats, RangeAggregate>;
  counts: Record<keyof FrameCounts, RangeAggregate>;
  sceneStats: Record<keyof SceneStats, RangeAggregate>;
}

export interface OverlaySummary {
  sessionId: null | string;
  collectorConnected: boolean;
  dominantMode: FrameMode;
  fps: number;
  frameAvgMs: number;
  frameMaxMs: number;
  renderAvgMs: number;
  renderMaxMs: number;
  collisionAvgMs: number;
  collisionMaxMs: number;
  drawCallsAvg: number;
  trianglesAvg: number;
  projectilesAvg: number;
  pickupsAvg: number;
  visibleMeshesAvg: number;
  pointLightsAvg: number;
}

export type ProfilerWorkerInMessage =
  | {
      type: 'init';
      batchWindowMs: number;
      collectorBaseUrl: string;
    }
  | {
      type: 'sample';
      sample: FrameSample;
    }
  | {
      type: 'flush';
    };

export type ProfilerWorkerOutMessage =
  | {
      type: 'summary';
      summary: OverlaySummary;
    };

export function createEmptyPhaseDurations(): Record<ProfilerPhase, number> {
  return {
    frameStart: 0,
    entityUpdate: 0,
    movement: 0,
    sync: 0,
    collision: 0,
    collisionDispatch: 0,
    proximity: 0,
    rpm: 0,
    deathChecks: 0,
    visuals: 0,
    effects: 0,
    render: 0,
    frameEnd: 0,
  };
}
