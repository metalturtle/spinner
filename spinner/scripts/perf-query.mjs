import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const perfLogDir = path.join(rootDir, 'perf-logs');
const perfDbPath = path.join(perfLogDir, 'perf.sqlite');

function ensureDb() {
  fs.mkdirSync(perfLogDir, { recursive: true });
  const db = new DatabaseSync(perfDbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 2000;
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      started_at_ms REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS windows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      window_start_ms REAL NOT NULL,
      window_duration_ms REAL NOT NULL,
      frame_avg_ms REAL NOT NULL,
      frame_max_ms REAL NOT NULL,
      frame_p95_ms REAL NOT NULL,
      render_avg_ms REAL NOT NULL,
      render_max_ms REAL NOT NULL,
      collision_avg_ms REAL NOT NULL,
      collision_max_ms REAL NOT NULL,
      effects_avg_ms REAL NOT NULL,
      visuals_avg_ms REAL NOT NULL,
      draw_calls_avg REAL NOT NULL,
      draw_calls_max REAL NOT NULL,
      triangles_avg REAL NOT NULL,
      projectiles_avg REAL NOT NULL,
      projectiles_max REAL NOT NULL,
      pickups_avg REAL NOT NULL,
      enemies_avg REAL NOT NULL,
      bosses_avg REAL NOT NULL,
      collidables_avg REAL NOT NULL,
      torches_avg REAL NOT NULL,
      record_json TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    );
    CREATE INDEX IF NOT EXISTS idx_perf_windows_session_start ON windows (session_id, window_start_ms);
    CREATE INDEX IF NOT EXISTS idx_perf_windows_frame_max ON windows (frame_max_ms DESC);
    CREATE INDEX IF NOT EXISTS idx_perf_windows_frame_avg ON windows (frame_avg_ms DESC);
  `);
  return db;
}

function syncJsonlIntoDb(db) {
  const files = fs.existsSync(perfLogDir)
    ? fs.readdirSync(perfLogDir)
        .filter((entry) => entry.endsWith('.jsonl'))
        .sort()
    : [];

  const sessionExistsStmt = db.prepare('SELECT 1 FROM sessions WHERE session_id = ? LIMIT 1');
  const insertSessionStmt = db.prepare(`
    INSERT OR REPLACE INTO sessions (session_id, file_name, file_path, started_at_ms)
    VALUES (?, ?, ?, ?)
  `);
  const insertWindowStmt = db.prepare(`
    INSERT INTO windows (
      session_id,
      window_start_ms,
      window_duration_ms,
      frame_avg_ms,
      frame_max_ms,
      frame_p95_ms,
      render_avg_ms,
      render_max_ms,
      collision_avg_ms,
      collision_max_ms,
      effects_avg_ms,
      visuals_avg_ms,
      draw_calls_avg,
      draw_calls_max,
      triangles_avg,
      projectiles_avg,
      projectiles_max,
      pickups_avg,
      enemies_avg,
      bosses_avg,
      collidables_avg,
      torches_avg,
      record_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const fileName of files) {
    const filePath = path.join(perfLogDir, fileName);
    const text = fs.readFileSync(filePath, 'utf8').trim();
    if (!text) continue;

    const lines = text.split('\n').filter(Boolean);
    const firstRecord = JSON.parse(lines[0]);
    if (!firstRecord.sessionId) continue;
    if (sessionExistsStmt.get(firstRecord.sessionId)) continue;

    insertSessionStmt.run(firstRecord.sessionId, fileName, filePath, firstRecord.windowStart);
    for (const line of lines) {
      const record = JSON.parse(line);
      insertWindowStmt.run(
        firstRecord.sessionId,
        record.windowStart,
        record.windowDurationMs,
        record.frameMs.avg,
        record.frameMs.max,
        record.frameMs.p95,
        record.phaseMs.render.avg,
        record.phaseMs.render.max,
        record.phaseMs.collision.avg + record.phaseMs.collisionDispatch.avg,
        record.phaseMs.collision.max + record.phaseMs.collisionDispatch.max,
        record.phaseMs.effects.avg,
        record.phaseMs.visuals.avg,
        record.renderStats.drawCalls.avg,
        record.renderStats.drawCalls.max,
        record.renderStats.triangles.avg,
        record.counts.projectiles.avg,
        record.counts.projectiles.max,
        record.counts.pickups.avg,
        record.counts.enemies.avg,
        record.counts.bosses.avg,
        record.counts.collidables.avg,
        record.counts.torches.avg,
        JSON.stringify(record),
      );
    }
  }
}

function resolveSessionId(db, token = 'latest') {
  if (token !== 'latest') return token;
  const row = db.prepare(`
    SELECT session_id
    FROM sessions
    ORDER BY started_at_ms DESC
    LIMIT 1
  `).get();
  if (!row?.session_id) {
    throw new Error('No profiler sessions found.');
  }
  return row.session_id;
}

function formatMs(value) {
  return `${Number(value).toFixed(2)} ms`;
}

function safeRangeAvg(record, path, fallback = 0) {
  const value = path.split('.').reduce((acc, key) => acc?.[key], record);
  if (value && typeof value.avg === 'number') return value.avg;
  return fallback;
}

function safePhaseAvg(record, phase) {
  return record?.phaseMs?.[phase]?.avg ?? 0;
}

function dominantPhase(record) {
  const phases = [
    ['render', safePhaseAvg(record, 'render')],
    ['visuals', safePhaseAvg(record, 'visuals')],
    ['effects', safePhaseAvg(record, 'effects')],
    ['collision', safePhaseAvg(record, 'collision') + safePhaseAvg(record, 'collisionDispatch')],
    ['entityUpdate', safePhaseAvg(record, 'entityUpdate')],
    ['sync', safePhaseAvg(record, 'sync')],
  ];
  phases.sort((a, b) => b[1] - a[1]);
  return { name: phases[0][0], value: phases[0][1] };
}

function getWindowRecords(db, sessionId) {
  const rows = db.prepare(`
    SELECT record_json
    FROM windows
    WHERE session_id = ?
    ORDER BY window_start_ms ASC
  `).all(sessionId);
  return rows.map((row) => JSON.parse(row.record_json));
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function printSessions(db) {
  const rows = db.prepare(`
    SELECT
      s.session_id,
      s.file_name,
      datetime(s.started_at_ms / 1000, 'unixepoch', 'localtime') AS started_local,
      COUNT(w.id) AS windows,
      ROUND(AVG(w.frame_avg_ms), 2) AS frame_avg_ms,
      ROUND(MAX(w.frame_max_ms), 2) AS frame_max_ms
    FROM sessions s
    LEFT JOIN windows w ON w.session_id = s.session_id
    GROUP BY s.session_id, s.file_name, s.started_at_ms
    ORDER BY s.started_at_ms DESC
  `).all();

  for (const row of rows) {
    console.log(`${row.session_id}  ${row.file_name}`);
    console.log(`  started: ${row.started_local}  windows: ${row.windows}  frame avg: ${row.frame_avg_ms ?? 'n/a'}  frame max: ${row.frame_max_ms ?? 'n/a'}`);
  }
}

function printSummary(db, sessionId) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS windows,
      AVG(frame_avg_ms) AS frame_avg_ms,
      MAX(frame_max_ms) AS frame_max_ms,
      AVG(render_avg_ms) AS render_avg_ms,
      MAX(render_max_ms) AS render_max_ms,
      AVG(collision_avg_ms) AS collision_avg_ms,
      MAX(collision_max_ms) AS collision_max_ms,
      AVG(effects_avg_ms) AS effects_avg_ms,
      AVG(visuals_avg_ms) AS visuals_avg_ms,
      AVG(draw_calls_avg) AS draw_calls_avg,
      MAX(draw_calls_max) AS draw_calls_max,
      AVG(triangles_avg) AS triangles_avg,
      AVG(projectiles_avg) AS projectiles_avg,
      MAX(projectiles_max) AS projectiles_max,
      AVG(pickups_avg) AS pickups_avg,
      AVG(enemies_avg) AS enemies_avg,
      AVG(bosses_avg) AS bosses_avg,
      AVG(collidables_avg) AS collidables_avg,
      AVG(torches_avg) AS torches_avg,
      SUM(CASE WHEN frame_avg_ms > 16.7 THEN 1 ELSE 0 END) AS over_16,
      SUM(CASE WHEN frame_avg_ms > 33.3 THEN 1 ELSE 0 END) AS over_33,
      SUM(CASE WHEN frame_avg_ms > 50 THEN 1 ELSE 0 END) AS over_50
    FROM windows
    WHERE session_id = ?
  `).get(sessionId);

  if (!row?.windows) {
    console.log(`No windows found for session ${sessionId}.`);
    return;
  }

  const records = getWindowRecords(db, sessionId);
  const modeCounts = new Map();
  for (const record of records) {
    const mode = record.dominantMode ?? 'unknown';
    modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
  }
  const modeSummary = [...modeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([mode, count]) => `${mode}:${count}`)
    .join('  ');
  const visibleMeshesAvg = average(records.map((record) => safeRangeAvg(record, 'sceneStats.visibleMeshes')));
  const pointLightsAvg = average(records.map((record) => safeRangeAvg(record, 'sceneStats.pointLights')));
  const shadowCastersAvg = average(records.map((record) => safeRangeAvg(record, 'sceneStats.shadowCasters')));
  const totalObjectsAvg = average(records.map((record) => safeRangeAvg(record, 'sceneStats.totalObjects')));
  const collidablesTotalAvg = average(records.map((record) => safeRangeAvg(record, 'counts.collidablesTotal')));

  console.log(`session ${sessionId}`);
  console.log(`windows: ${row.windows}`);
  console.log(`frame avg: ${formatMs(row.frame_avg_ms)}  worst: ${formatMs(row.frame_max_ms)}`);
  console.log(`render avg: ${formatMs(row.render_avg_ms)}  worst: ${formatMs(row.render_max_ms)}`);
  console.log(`collision avg: ${formatMs(row.collision_avg_ms)}  worst: ${formatMs(row.collision_max_ms)}`);
  console.log(`visuals avg: ${formatMs(row.visuals_avg_ms)}  effects avg: ${formatMs(row.effects_avg_ms)}`);
  console.log(`draw calls avg: ${Number(row.draw_calls_avg).toFixed(1)}  max: ${Number(row.draw_calls_max).toFixed(0)}`);
  console.log(`triangles avg: ${Math.round(row.triangles_avg)}`);
  console.log(`visible meshes avg: ${visibleMeshesAvg.toFixed(1)}  point lights avg: ${pointLightsAvg.toFixed(1)}  shadow casters avg: ${shadowCastersAvg.toFixed(1)}`);
  console.log(`total objects avg: ${totalObjectsAvg.toFixed(1)}`);
  console.log(`projectiles avg/max: ${Number(row.projectiles_avg).toFixed(1)} / ${Number(row.projectiles_max).toFixed(0)}`);
  console.log(`pickups avg: ${Number(row.pickups_avg).toFixed(1)}  enemies avg: ${Number(row.enemies_avg).toFixed(1)}  bosses avg: ${Number(row.bosses_avg).toFixed(1)}`);
  console.log(`collidables enabled avg: ${Number(row.collidables_avg).toFixed(1)}  total avg: ${collidablesTotalAvg.toFixed(1)}  torches avg: ${Number(row.torches_avg).toFixed(1)}`);
  if (modeSummary) console.log(`modes: ${modeSummary}`);
  console.log(`windows over 16.7 ms: ${row.over_16} / ${row.windows}`);
  console.log(`windows over 33.3 ms: ${row.over_33} / ${row.windows}`);
  console.log(`windows over 50.0 ms: ${row.over_50} / ${row.windows}`);
}

function printWorst(db, sessionId, limit) {
  const rows = db.prepare(`
    SELECT window_start_ms, frame_avg_ms, frame_max_ms, draw_calls_avg, triangles_avg, record_json
    FROM windows
    WHERE session_id = ?
    ORDER BY frame_max_ms DESC
    LIMIT ?
  `).all(sessionId, limit);

  if (rows.length === 0) {
    console.log(`No windows found for session ${sessionId}.`);
    return;
  }

  rows.forEach((row, index) => {
    const record = JSON.parse(row.record_json);
    const culprit = dominantPhase(record);
    const mode = record.dominantMode ?? 'unknown';
    const meshes = safeRangeAvg(record, 'sceneStats.visibleMeshes');
    const lights = safeRangeAvg(record, 'sceneStats.pointLights');
    const shadowCasters = safeRangeAvg(record, 'sceneStats.shadowCasters');
    console.log(
      `${index + 1}. frame avg ${formatMs(row.frame_avg_ms)}  worst ${formatMs(row.frame_max_ms)}  ` +
      `${mode}  draw ${Number(row.draw_calls_avg).toFixed(1)}  tris ${Math.round(row.triangles_avg)}  ` +
      `meshes ${meshes.toFixed(1)}  lights ${lights.toFixed(1)}  shadows ${shadowCasters.toFixed(1)}  ` +
      `top ${culprit.name} ${formatMs(culprit.value)}`
    );
  });
}

function printDrops(db, sessionId, thresholdMs) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS windows,
      SUM(CASE WHEN frame_avg_ms > ? THEN 1 ELSE 0 END) AS drops,
      AVG(CASE WHEN frame_avg_ms > ? THEN frame_avg_ms END) AS avg_drop_ms,
      MAX(CASE WHEN frame_avg_ms > ? THEN frame_max_ms END) AS worst_drop_ms
    FROM windows
    WHERE session_id = ?
  `).get(thresholdMs, thresholdMs, thresholdMs, sessionId);

  if (!row?.windows) {
    console.log(`No windows found for session ${sessionId}.`);
    return;
  }

  console.log(`session ${sessionId}`);
  console.log(`threshold: ${formatMs(thresholdMs)}`);
  console.log(`drops: ${row.drops} / ${row.windows}`);
  if (row.drops > 0) {
    console.log(`avg dropped window: ${formatMs(row.avg_drop_ms)}`);
    console.log(`worst dropped window: ${formatMs(row.worst_drop_ms)}`);
  }
}

function printDropDetails(db, sessionId, thresholdMs, limit) {
  const rows = db.prepare(`
    SELECT record_json, frame_avg_ms, frame_max_ms, draw_calls_avg, triangles_avg
    FROM windows
    WHERE session_id = ? AND frame_avg_ms > ?
    ORDER BY frame_max_ms DESC
    LIMIT ?
  `).all(sessionId, thresholdMs, limit);

  if (rows.length === 0) {
    console.log(`No dropped windows over ${formatMs(thresholdMs)} for session ${sessionId}.`);
    return;
  }

  rows.forEach((row, index) => {
    const record = JSON.parse(row.record_json);
    const culprit = dominantPhase(record);
    const mode = record.dominantMode ?? 'unknown';
    const meshes = safeRangeAvg(record, 'sceneStats.visibleMeshes');
    const lights = safeRangeAvg(record, 'sceneStats.pointLights');
    const shadowCasters = safeRangeAvg(record, 'sceneStats.shadowCasters');
    const projectiles = safeRangeAvg(record, 'counts.projectiles');
    const pickups = safeRangeAvg(record, 'counts.pickups');
    console.log(
      `${index + 1}. frame avg ${formatMs(row.frame_avg_ms)}  worst ${formatMs(row.frame_max_ms)}  ` +
      `${mode}  top ${culprit.name} ${formatMs(culprit.value)}`
    );
    console.log(
      `   draw ${Number(row.draw_calls_avg).toFixed(1)}  tris ${Math.round(row.triangles_avg)}  ` +
      `meshes ${meshes.toFixed(1)}  lights ${lights.toFixed(1)}  shadows ${shadowCasters.toFixed(1)}  ` +
      `projectiles ${projectiles.toFixed(1)}  pickups ${pickups.toFixed(1)}`
    );
  });
}

function printHelp() {
  console.log('Usage: npm run perf:query -- <command> [args]');
  console.log('');
  console.log('Commands:');
  console.log('  sessions');
  console.log('  summary [latest|sessionId]');
  console.log('  worst [latest|sessionId] [limit]');
  console.log('  drops [latest|sessionId] [thresholdMs]');
  console.log('  drops-detail [latest|sessionId] [thresholdMs] [limit]');
}

const db = ensureDb();
try {
  syncJsonlIntoDb(db);
} catch (error) {
  if (error?.code === 'ERR_SQLITE_ERROR' && /locked/i.test(String(error?.message ?? ''))) {
    console.warn('[perf-query] Database is busy; using existing indexed data without syncing new JSONL files first.');
  } else {
    throw error;
  }
}

const command = process.argv[2] ?? 'summary';

try {
  if (command === 'sessions') {
    printSessions(db);
  } else if (command === 'summary') {
    const sessionId = resolveSessionId(db, process.argv[3] ?? 'latest');
    printSummary(db, sessionId);
  } else if (command === 'worst') {
    const sessionId = resolveSessionId(db, process.argv[3] ?? 'latest');
    const limit = Number(process.argv[4] ?? 10);
    printWorst(db, sessionId, Number.isFinite(limit) && limit > 0 ? limit : 10);
  } else if (command === 'drops') {
    const sessionId = resolveSessionId(db, process.argv[3] ?? 'latest');
    const thresholdMs = Number(process.argv[4] ?? 16.7);
    printDrops(db, sessionId, Number.isFinite(thresholdMs) && thresholdMs > 0 ? thresholdMs : 16.7);
  } else if (command === 'drops-detail') {
    const sessionId = resolveSessionId(db, process.argv[3] ?? 'latest');
    const thresholdMs = Number(process.argv[4] ?? 16.7);
    const limit = Number(process.argv[5] ?? 10);
    printDropDetails(
      db,
      sessionId,
      Number.isFinite(thresholdMs) && thresholdMs > 0 ? thresholdMs : 16.7,
      Number.isFinite(limit) && limit > 0 ? limit : 10,
    );
  } else {
    printHelp();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
