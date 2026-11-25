#!/usr/bin/env node
// Runs Vitest for the given test files, grouped by package.
// Usage: node .claude/scripts/run-tests.mjs <test file>... [--cover <source file>...]
import { spawnSync } from 'node:child_process';
import { isWritable, loadPolicy } from '../../.github/scripts/policy.mjs';

const policy = loadPolicy();
const tests = [];
const cover = [];
const args = process.argv.slice(2);
let target = tests;
for (const arg of args) {
  if (arg === '--cover') target = cover;
  else target.push(arg.replace(/^\.\//, ''));
}

const bad = tests.filter((t) => !isWritable(policy, t));
if (tests.length === 0 || bad.length) {
  console.error(`Expected test files matching the policy. Rejected: ${bad.join(', ') || '(none given)'}`);
  process.exit(2);
}

let failed = false;
for (const pkg of Object.keys(policy.packages)) {
  const own = (list) => list.filter((p) => p?.startsWith(`${pkg}/`)).map((p) => p.slice(pkg.length + 1));
  const files = own(tests);
  if (!files.length) continue;
  const coverage = own(cover);
  const flags = coverage.length
    ? ['--coverage.enabled', '--coverage.reporter=text', '--coverage.thresholds={}',
       ...coverage.map((c) => `--coverage.include=${c}`)]
    : [];
  console.log(`\n▶ ${pkg}: vitest run ${files.join(' ')}`);
  const result = spawnSync('npx', ['--no-install', 'vitest', 'run', ...files, ...flags], { cwd: pkg, stdio: 'inherit' });
  failed ||= result.status !== 0;
}
process.exit(failed ? 1 : 0);
