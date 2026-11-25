// Shared by the *.test.mjs files: run a repo script the way CI does, from the repo root.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export function runScript(script, args = [], options = {}) {
  return spawnSync('node', [script, ...args], { cwd: ROOT, encoding: 'utf8', ...options });
}
