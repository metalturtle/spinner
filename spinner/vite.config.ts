import { defineConfig } from 'vite';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import type { PerfWindowRecord } from './src/profilerTypes';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const sharedTextureDir = path.resolve(rootDir, '..', 'textures');
const activeLevelPath = path.resolve(rootDir, 'src', 'levels', 'level-active.json');
const perfLogDir = path.resolve(rootDir, 'perf-logs');
const perfDbPath = path.resolve(perfLogDir, 'perf.sqlite');
const textureExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.exr']);

function readJsonBody(req: NodeJS.ReadableStream): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sharedTexturesPlugin() {
  const virtualModuleId = 'virtual:shared-textures';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;
  const normalizePath = (value: string) => value.split(path.sep).join(path.posix.sep);
  const sharedTextureDirNormalized = normalizePath(sharedTextureDir) + '/';

  return {
    name: 'shared-textures',
    resolveId(id: string) {
      if (id === virtualModuleId) return resolvedVirtualModuleId;
      return null;
    },
    configureServer(server) {
      const reloadIfSharedTexture = (file: string) => {
        const normalizedFile = normalizePath(file);
        if (!normalizedFile.startsWith(sharedTextureDirNormalized)) return;
        const module = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };

      server.watcher.on('add', reloadIfSharedTexture);
      server.watcher.on('unlink', reloadIfSharedTexture);
      server.watcher.on('change', reloadIfSharedTexture);
    },
    load(id: string) {
      if (id !== resolvedVirtualModuleId) return null;

      const files = fs.existsSync(sharedTextureDir)
        ? fs.readdirSync(sharedTextureDir)
            .filter((file) => textureExtensions.has(path.extname(file).toLowerCase()))
            .sort((a, b) => a.localeCompare(b))
        : [];

      const imports = files
        .map((file, index) => {
          const absPath = path.join(sharedTextureDir, file).split(path.sep).join(path.posix.sep);
          return `import texture${index} from ${JSON.stringify(absPath + '?url')};`;
        })
        .join('\n');

      const entries = files
        .map((file, index) => {
          const basename = file.replace(/\.[^.]+$/, '');
          return `{ id: ${JSON.stringify(basename)}, src: texture${index} }`;
        })
        .join(',\n');

      return `${imports}\nexport default [${entries}];`;
    },
  };
}

function activeLevelSyncPlugin(): Plugin {
  return {
    name: 'active-level-sync',
    configureServer(server) {
      server.middlewares.use('/api/active-level', (req, res) => {
        if (req.method === 'GET') {
          if (!fs.existsSync(activeLevelPath)) {
            res.statusCode = 404;
            res.end('Missing active level file');
            return;
          }

          res.setHeader('Content-Type', 'application/json');
          res.end(fs.readFileSync(activeLevelPath, 'utf8'));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              fs.mkdirSync(path.dirname(activeLevelPath), { recursive: true });
              fs.writeFileSync(activeLevelPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, path: activeLevelPath }));
            } catch (error) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                ok: false,
                error: error instanceof Error ? error.message : 'Failed to save active level',
              }));
            }
          });
          return;
        }

        res.statusCode = 405;
        res.end('Method not allowed');
      });
    },
  };
}

function createPerfStore() {
  fs.mkdirSync(perfLogDir, { recursive: true });

  const db = new DatabaseSync(perfDbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
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

  const sessionExistsStmt = db.prepare(`
    SELECT 1
    FROM sessions
    WHERE session_id = ?
    LIMIT 1
  `);

  const windowCountStmt = db.prepare(`
    SELECT COUNT(*) AS count
    FROM windows
    WHERE session_id = ?
  `);

  const insertWindowRecord = (sessionId: string, record: PerfWindowRecord): void => {
    insertWindowStmt.run(
      sessionId,
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
  };

  return {
    startSession(sessionId: string, fileName: string, filePath: string): void {
      insertSessionStmt.run(sessionId, fileName, filePath, Date.now());
    },
    appendWindow(sessionId: string, record: PerfWindowRecord): void {
      insertWindowRecord(sessionId, record);
    },
    syncExistingJsonl(): void {
      const files = fs.existsSync(perfLogDir)
        ? fs.readdirSync(perfLogDir)
            .filter((entry) => entry.endsWith('.jsonl'))
            .sort()
        : [];

      for (const fileName of files) {
        const filePath = path.join(perfLogDir, fileName);
        const text = fs.readFileSync(filePath, 'utf8').trim();
        if (!text) continue;

        const lines = text.split('\n').filter(Boolean);
        const firstRecord = JSON.parse(lines[0]) as PerfWindowRecord;
        if (!firstRecord.sessionId) continue;

        const sessionId = firstRecord.sessionId;
        if (sessionExistsStmt.get(sessionId)) continue;

        insertSessionStmt.run(sessionId, fileName, filePath, firstRecord.windowStart);
        for (const line of lines) {
          insertWindowRecord(sessionId, JSON.parse(line) as PerfWindowRecord);
        }
      }
    },
    getWindowCount(sessionId: string): number {
      return Number((windowCountStmt.get(sessionId) as { count: number }).count);
    },
  };
}

function perfLogCollectorPlugin(): Plugin {
  const sessions = new Map<string, string>();
  const store = createPerfStore();
  store.syncExistingJsonl();

  return {
    name: 'perf-log-collector',
    configureServer(server) {
      server.middlewares.use('/api/perf-log', async (req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0];

        if (req.method === 'POST' && pathname === '/start') {
          try {
            fs.mkdirSync(perfLogDir, { recursive: true });
            const sessionId = randomUUID();
            const fileName = `session-${Date.now()}-${sessionId.slice(0, 8)}.jsonl`;
            const filePath = path.join(perfLogDir, fileName);
            fs.writeFileSync(filePath, '', 'utf8');
            sessions.set(sessionId, filePath);
            store.startSession(sessionId, fileName, filePath);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, sessionId, fileName }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : 'Failed to start perf log session',
            }));
          }
          return;
        }

        if (req.method === 'POST' && pathname === '/append') {
          try {
            const parsed = await readJsonBody(req) as { sessionId?: string; record?: PerfWindowRecord };
            if (!parsed.sessionId || !sessions.has(parsed.sessionId)) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'Unknown perf log session' }));
              return;
            }

            if (parsed.record === undefined) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'Missing perf log record' }));
              return;
            }

            const filePath = sessions.get(parsed.sessionId)!;
            fs.appendFileSync(filePath, `${JSON.stringify(parsed.record)}\n`, 'utf8');
            store.appendWindow(parsed.sessionId, parsed.record);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, windows: store.getWindowCount(parsed.sessionId) }));
          } catch (error) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : 'Failed to append perf log record',
            }));
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [sharedTexturesPlugin(), activeLevelSyncPlugin(), perfLogCollectorPlugin()],
  cacheDir: process.env.VITE_CACHE_DIR ?? 'node_modules/.vite',
  build: {
    outDir: process.env.VITE_OUT_DIR ?? 'dist',
  },
  server: {
    fs: {
      allow: [path.resolve(rootDir, '..')],
    },
  },
});
