#!/usr/bin/env node
// The only command the agent may run. Runs Vitest for the given test files, grouped by
// package, and optionally prints line coverage for the source files after --cover.
//
// Usage: node .claude/scripts/run-tests.mjs <test file>... [--cover <source file>...]
import { spawnSync } from 'node:child_process';
import { isWritable, loadPolicy } from '../../.github/scripts/policy.mjs';

const policy = loadPolicy();
const { testFiles, coverFiles } = splitArgs(process.argv.slice(2));

const rejected = testFiles.filter((file) => !isWritable(policy, file));
if (testFiles.length === 0 || rejected.length > 0) {
  console.error(`Expected test files allowed by the policy. Rejected: ${rejected.join(', ') || '(none given)'}`);
  process.exit(2);
}

let failed = false;
for (const pkg of Object.keys(policy.packages)) {
  const tests = inPackage(pkg, testFiles);
  if (tests.length === 0) continue;

  const sources = inPackage(pkg, coverFiles);
  const coverageFlags = sources.length === 0 ? [] : [
    '--coverage.enabled', '--coverage.reporter=text', '--coverage.thresholds={}',
    ...sources.map((source) => `--coverage.include=${source}`),
  ];
  console.log(`\n▶ ${pkg}: vitest run ${tests.join(' ')}`);
  const result = spawnSync('npx', ['--no-install', 'vitest', 'run', ...tests, ...coverageFlags], { cwd: pkg, stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);

// Everything before --cover is a test file, everything after it a source file.
function splitArgs(args) {
  const coverAt = args.indexOf('--cover');
  const clean = (list) => list.map((path) => path.replace(/^\.\//, ''));
  if (coverAt === -1) return { testFiles: clean(args), coverFiles: [] };
  return { testFiles: clean(args.slice(0, coverAt)), coverFiles: clean(args.slice(coverAt + 1)) };
}

// Paths relative to the package, for the files that belong to it.
function inPackage(pkg, files) {
  return files.filter((file) => file.startsWith(`${pkg}/`)).map((file) => file.slice(pkg.length + 1));
}
