import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const sharedTextureDir = path.resolve(rootDir, '..', 'textures');
const activeLevelPath = path.resolve(rootDir, '..', 'spinner', 'src', 'levels', 'level-active.json');
const textureExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);

function sharedTexturesPlugin() {
  const virtualModuleId = 'virtual:shared-textures';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;

  return {
    name: 'shared-textures',
    resolveId(id: string) {
      if (id === virtualModuleId) return resolvedVirtualModuleId;
      return null;
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

export default defineConfig({
  plugins: [sharedTexturesPlugin(), activeLevelSyncPlugin()],
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
