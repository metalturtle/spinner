/// <reference lib="webworker" />

import {
  PROFILER_PHASES,
  type FrameCounts,
  type FrameMode,
  type FrameSample,
  type NumericAggregate,
  type OverlaySummary,
  type PerfWindowRecord,
  type ProfilerPhase,
  type ProfilerWorkerInMessage,
  type ProfilerWorkerOutMessage,
  type RangeAggregate,
  type RenderStats,
  type SceneStats,
} from './profilerTypes';

const workerScope = self as DedicatedWorkerGlobalScope;

let batchWindowMs = 500;
let collectorBaseUrl = '/api/perf-log';
let sessionId: null | string = null;
let collectorConnected = false;
let collectorWarningIssued = false;
let appendChain: Promise<void> = Promise.resolve();
let windowSamples: FrameSample[] = [];

function warnCollector(message: string, error?: unknown): void {
  if (collectorWarningIssued) return;
  collectorWarningIssued = true;
  console.warn(message, error);
}

function getNumericAggregate(values: number[]): NumericAggregate {
  if (values.length === 0) return { avg: 0, max: 0, p95: 0 };

  let total = 0;
  let max = values[0];
  const sorted = [...values].sort((a, b) => a - b);
  for (const value of values) {
    total += value;
    if (value > max) max = value;
  }

  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));
  return {
    avg: total / values.length,
    max,
    p95: sorted[index],
  };
}

function getRangeAggregate(values: number[]): RangeAggregate {
  if (values.length === 0) return { min: 0, max: 0, avg: 0 };

  let total = 0;
  let min = values[0];
  let max = values[0];
  for (const value of values) {
    total += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  return {
    min,
    max,
    avg: total / values.length,
  };
}

function buildPhaseAggregates(samples: FrameSample[]): Record<ProfilerPhase, NumericAggregate> {
  const phaseMs = {} as Record<ProfilerPhase, NumericAggregate>;
  for (const phase of PROFILER_PHASES) {
    phaseMs[phase] = getNumericAggregate(samples.map((sample) => sample.phaseMs[phase]));
  }
  return phaseMs;
}

function buildRenderAggregates(samples: FrameSample[]): Record<keyof RenderStats, RangeAggregate> {
  return {
    drawCalls: getRangeAggregate(samples.map((sample) => sample.renderStats.drawCalls)),
    triangles: getRangeAggregate(samples.map((sample) => sample.renderStats.triangles)),
    lines: getRangeAggregate(samples.map((sample) => sample.renderStats.lines)),
  };
}

function buildCountAggregates(samples: FrameSample[]): Record<keyof FrameCounts, RangeAggregate> {
  return {
    projectiles: getRangeAggregate(samples.map((sample) => sample.counts.projectiles)),
    pickups: getRangeAggregate(samples.map((sample) => sample.counts.pickups)),
    explosions: getRangeAggregate(samples.map((sample) => sample.counts.explosions)),
    enemies: getRangeAggregate(samples.map((sample) => sample.counts.enemies)),
    bosses: getRangeAggregate(samples.map((sample) => sample.counts.bosses)),
    collidables: getRangeAggregate(samples.map((sample) => sample.counts.collidables)),
    collidablesTotal: getRangeAggregate(samples.map((sample) => sample.counts.collidablesTotal)),
    torches: getRangeAggregate(samples.map((sample) => sample.counts.torches)),
  };
}

function buildSceneAggregates(samples: FrameSample[]): Record<keyof SceneStats, RangeAggregate> {
  return {
    totalObjects: getRangeAggregate(samples.map((sample) => sample.sceneStats.totalObjects)),
    visibleMeshes: getRangeAggregate(samples.map((sample) => sample.sceneStats.visibleMeshes)),
    totalMeshes: getRangeAggregate(samples.map((sample) => sample.sceneStats.totalMeshes)),
    pointLights: getRangeAggregate(samples.map((sample) => sample.sceneStats.pointLights)),
    shadowCasters: getRangeAggregate(samples.map((sample) => sample.sceneStats.shadowCasters)),
  };
}

function getDominantMode(samples: FrameSample[]): FrameMode {
  const counts = new Map<FrameMode, number>();
  for (const sample of samples) {
    counts.set(sample.mode, (counts.get(sample.mode) ?? 0) + 1);
  }

  let dominantMode: FrameMode = 'gameplay';
  let dominantCount = -1;
  for (const [mode, count] of counts) {
    if (count > dominantCount) {
      dominantMode = mode;
      dominantCount = count;
    }
  }

  return dominantMode;
}

function buildWindowRecord(samples: FrameSample[]): PerfWindowRecord {
  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  return {
    sessionId,
    windowStart: firstSample.timestamp,
    windowDurationMs: Math.max(lastSample.timestamp - firstSample.timestamp + lastSample.deltaMs, lastSample.frameMs),
    dominantMode: getDominantMode(samples),
    frameMs: getNumericAggregate(samples.map((sample) => sample.frameMs)),
    phaseMs: buildPhaseAggregates(samples),
    renderStats: buildRenderAggregates(samples),
    counts: buildCountAggregates(samples),
    sceneStats: buildSceneAggregates(samples),
  };
}

function buildOverlaySummary(record: PerfWindowRecord): OverlaySummary {
  return {
    sessionId: record.sessionId,
    collectorConnected,
    dominantMode: record.dominantMode,
    fps: record.frameMs.avg > 0 ? 1000 / record.frameMs.avg : 0,
    frameAvgMs: record.frameMs.avg,
    frameMaxMs: record.frameMs.max,
    renderAvgMs: record.phaseMs.render.avg,
    renderMaxMs: record.phaseMs.render.max,
    collisionAvgMs: record.phaseMs.collision.avg + record.phaseMs.collisionDispatch.avg,
    collisionMaxMs: record.phaseMs.collision.max + record.phaseMs.collisionDispatch.max,
    drawCallsAvg: record.renderStats.drawCalls.avg,
    trianglesAvg: record.renderStats.triangles.avg,
    projectilesAvg: record.counts.projectiles.avg,
    pickupsAvg: record.counts.pickups.avg,
    visibleMeshesAvg: record.sceneStats.visibleMeshes.avg,
    pointLightsAvg: record.sceneStats.pointLights.avg,
  };
}

async function startCollectorSession(): Promise<void> {
  try {
    const response = await fetch(`${collectorBaseUrl}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!response.ok) throw new Error(await response.text());

    const payload = await response.json() as { sessionId?: string };
    if (!payload.sessionId) throw new Error('Missing session id from collector');
    sessionId = payload.sessionId;
    collectorConnected = true;
  } catch (error) {
    collectorConnected = false;
    warnCollector('[profiler] Failed to start local collector; continuing with overlay-only summaries.', error);
  }
}

async function appendWindowRecord(record: PerfWindowRecord): Promise<void> {
  if (!collectorConnected || !sessionId) return;

  try {
    const response = await fetch(`${collectorBaseUrl}/append`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, record }),
    });
    if (!response.ok) throw new Error(await response.text());
  } catch (error) {
    collectorConnected = false;
    warnCollector('[profiler] Failed to append profiler window; continuing with overlay-only summaries.', error);
  }
}

function emitWindow(samples: FrameSample[]): void {
  if (samples.length === 0) return;

  const record = buildWindowRecord(samples);
  const message: ProfilerWorkerOutMessage = {
    type: 'summary',
    summary: buildOverlaySummary(record),
  };
  workerScope.postMessage(message);

  appendChain = appendChain.then(() => appendWindowRecord(record));
}

function flushWindow(): void {
  if (windowSamples.length === 0) return;
  const samples = windowSamples;
  windowSamples = [];
  emitWindow(samples);
}

function maybeFlushWindow(nextSample: FrameSample): void {
  if (windowSamples.length === 0) {
    windowSamples.push(nextSample);
    return;
  }

  const start = windowSamples[0].timestamp;
  if (nextSample.timestamp - start >= batchWindowMs) flushWindow();
  windowSamples.push(nextSample);
}

workerScope.addEventListener('message', (event: MessageEvent<ProfilerWorkerInMessage>) => {
  const message = event.data;

  if (message.type === 'init') {
    batchWindowMs = message.batchWindowMs;
    collectorBaseUrl = message.collectorBaseUrl;
    void startCollectorSession();
    return;
  }

  if (message.type === 'sample') {
    maybeFlushWindow(message.sample);
    return;
  }

  if (message.type === 'flush') {
    flushWindow();
  }
});

export {};
