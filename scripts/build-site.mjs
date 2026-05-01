import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptsDir, '..');
const siteDir = path.join(repoDir, 'site');
const siteStaticDir = path.join(repoDir, 'site-static');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

rmSync(siteDir, { recursive: true, force: true });
mkdirSync(siteDir, { recursive: true });

run('npm', ['--prefix', 'spinner', 'run', 'build:static']);
run('npm', ['--prefix', 'leveleditor', 'run', 'build:static']);

cpSync(siteStaticDir, siteDir, { recursive: true });
