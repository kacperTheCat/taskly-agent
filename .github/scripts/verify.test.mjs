import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failingTestFiles, failingTypecheckFiles } from './verify.mjs';

test('tsc errors are mapped to test files of the package', () => {
  const output = "src/a.test.ts(3,1): error TS2304: Cannot find name 'x'.\nsrc/b.ts(1,1): warning";
  assert.deepEqual([...failingTypecheckFiles(output, 'frontend')], ['frontend/src/a.test.ts']);
});

test('only vitest results that did not pass count as failing', () => {
  const report = {
    testResults: [{ name: '/r/frontend/a.test.ts', status: 'failed' }, { name: '/r/frontend/b.test.ts', status: 'passed' }],
  };
  assert.deepEqual([...failingTestFiles(report, '/r')], ['frontend/a.test.ts']);
});
