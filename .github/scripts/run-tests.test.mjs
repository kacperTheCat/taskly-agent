import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runScript } from './test-helpers.mjs';

const runTests = (...args) => runScript('.claude/scripts/run-tests.mjs', args);

test('run-tests refuses paths that are not writable test files', () => {
  for (const path of ['backend/src/main.ts', 'backend/tests/../src/x.test.ts', '/etc/passwd']) {
    assert.equal(runTests(path).status, 2, path);
  }
});

test('run-tests refuses to run without test files', () => {
  assert.equal(runTests().status, 2);
  assert.equal(runTests('--cover', 'backend/src/core/config.ts').status, 2);
});
