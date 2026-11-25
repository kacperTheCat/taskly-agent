import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate } from './changed-files.mjs';
import { runScript } from './test-helpers.mjs';

const task = (...files) => JSON.parse(runScript('.github/scripts/changed-files.mjs', files).stdout);

test('changed-files keeps candidates, lists skipped files and drops the rest', () => {
  const result = task('backend/src/core/config.ts', 'backend/src/features/todos/types.ts', 'README.md');
  assert.equal(result.run, true);
  assert.deepEqual(result.files.map((file) => file.decision), ['candidate', 'skip']);
  assert.match(result.prompt, /backend\/src\/core\/config\.ts/);
  assert.doesNotMatch(result.prompt, /types\.ts/);
});

test('changed-files does not start the agent without candidates', () => {
  assert.equal(task('README.md', 'frontend/src/main.tsx').run, false);
});

test('changed-files exits with usage on missing input, both inputs, or an unknown mode', () => {
  const run = (...args) => runScript('.github/scripts/changed-files.mjs', args).status;
  assert.equal(run(), 2);
  assert.equal(run('--base', 'HEAD', 'README.md'), 2);
  assert.equal(run('--mode', 'prr', 'backend/src/core/config.ts'), 2);
});

test('the gate stops a pull request that is too large to review, but not a backfill', () => {
  const limits = { maxSourceFiles: 2, maxChangedLines: 100 };
  assert.equal(gate(limits, 'pr', 3, 10).run, false);
  assert.equal(gate(limits, 'pr', 1, 101).run, false);
  assert.equal(gate(limits, 'pr', 1, 100).run, true);
  assert.equal(gate(limits, 'backfill', 30, 5000).run, true);
});
