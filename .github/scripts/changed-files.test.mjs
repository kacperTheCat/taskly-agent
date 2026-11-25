import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runScript } from './test-helpers.mjs';

const task = (...files) => JSON.parse(runScript('.github/scripts/changed-files.mjs', ['--files', ...files]).stdout);

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

test('changed-files exits with usage when neither --base nor --files is given', () => {
  assert.equal(runScript('.github/scripts/changed-files.mjs').status, 2);
});
