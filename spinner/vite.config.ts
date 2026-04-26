import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const sharedTextureDir = path.resolve(rootDir, '..', 'textures');
const textureExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.exr']);

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

export default defineConfig({
  plugins: [sharedTexturesPlugin()],
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
