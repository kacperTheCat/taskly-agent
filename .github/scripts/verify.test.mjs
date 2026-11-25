import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failingTypecheckFiles } from './verify/typecheck.mjs';
import { passingTestFiles } from './verify/vitest.mjs';

test('tsc errors are mapped to test files of the package', () => {
  const output = "src/a.test.ts(3,1): error TS2304: Cannot find name 'x'.\nsrc/b.ts(1,1): warning";
  assert.deepEqual([...failingTypecheckFiles(output, 'frontend')], ['frontend/src/a.test.ts']);
});

test('only files that ran with passing tests count as passed', () => {
  const report = {
    testResults: [
      { name: '/r/frontend/failed.test.ts', status: 'failed', assertionResults: [{}] },
      { name: '/r/frontend/passed.test.ts', status: 'passed', assertionResults: [{}] },
      { name: '/r/frontend/empty.test.ts', status: 'passed', assertionResults: [] },
    ],
  };
  assert.deepEqual([...passingTestFiles(report, '/r')], ['frontend/passed.test.ts']);
  assert.equal(passingTestFiles({}, '/r').size, 0);
});
