import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARKER, render, text } from './report.mjs';
import { failingTestFiles, failingTypecheckFiles } from './verify.mjs';

test('agent text cannot mention, link, or break the table', () => {
  const out = text('ping @org/team see https://evil.example | <img src=x> `code`');
  assert.doesNotMatch(out, /@org/);
  assert.doesNotMatch(out, /https:\/\//);
  assert.doesNotMatch(out, /(^|[^\\])[|<`]/);
  assert.ok(text('x'.repeat(500)).length <= 200);
  assert.doesNotMatch(text('see www.evil.example'), /www\./);
});

test('renders a skipped run without calling the model', () => {
  const md = render({ context: { run: false, reason: 'no testable source changes', files: [] } });
  assert.ok(md.startsWith(MARKER));
  assert.match(md, /cost \$0/);
});

test('renders decisions, coverage, rejections and modified tests', () => {
  const md = render({
    context: { run: true, files: [{ path: 'backend/src/types.ts', decision: 'skip', reason: 'types' }] },
    summary: {
      turns: 9, costUsd: 0.081, model: 'm', skills: ['verify-tests'], toolCalls: 4,
      report: { files: [{ source: 'frontend/src/lib/http.ts', decision: 'tested', reason: 'new' }] },
    },
    verdict: {
      runs: 2, accepted: ['a.test.ts'], rejected: [{ file: 'b.test.ts', reason: 'tests fail' }],
      modifiedExisting: ['a.test.ts'], coverage: [{ source: 'frontend/src/lib/http.ts', before: 0, after: 100 }],
    },
    commit: 'abcdef1234',
  });
  for (const part of ['0% → 100%', 'b.test.ts', 'please review', 'abcdef1', '$0.08', 'types.ts']) {
    assert.ok(md.includes(part), part);
  }
});

test('verify parses tsc and vitest output', () => {
  const tsc = "src/a.test.ts(3,1): error TS2304: Cannot find name 'x'.\nsrc/b.ts(1,1): warning";
  assert.deepEqual([...failingTypecheckFiles(tsc, 'frontend')], ['frontend/src/a.test.ts']);
  const report = {
    testResults: [{ name: '/r/frontend/a.test.ts', status: 'failed' }, { name: '/r/frontend/b.test.ts', status: 'passed' }],
  };
  assert.deepEqual([...failingTestFiles(report, '/r')], ['frontend/a.test.ts']);
});

test('says why nothing was committed when verification or publishing failed', () => {
  const summary = { report: { files: [] } };
  assert.match(render({ context: { run: true }, summary }), /Verification did not complete/);
  assert.match(render({ context: { run: true }, summary, verdict: {}, publish: 'failure' }), /trusted validation/);
});
