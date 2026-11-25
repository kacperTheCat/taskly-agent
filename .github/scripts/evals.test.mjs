import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge } from './evals.mjs';

const evalCase = { name: 'bug', file: 'a.ts', expect: ['suspected_bug'] };
const summary = (decision) => ({ turns: 3, costUsd: 0.01, report: { files: [{ source: 'a.ts', decision }] } });

test('a case passes only with an expected decision for its file', () => {
  assert.equal(judge(evalCase, summary('suspected_bug')).pass, true);
  assert.equal(judge(evalCase, summary('updated')).pass, false);
});

test('a run without a report fails the case', () => {
  assert.deepEqual(judge(evalCase, {}), { name: 'bug', expected: 'suspected_bug', actual: 'no report', pass: false, turns: undefined, cost: undefined });
});
