import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARKER, render } from './report.mjs';

const ran = { run: true };
const summary = { report: { files: [] } };
const emptyVerdict = { runs: 2, accepted: [], rejected: [], modifiedExisting: [], coverage: [] };

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

test('says why nothing was committed', () => {
  assert.match(render({ context: ran, agentOutcome: 'failure' }), /agent job failed/);
  assert.match(render({ context: ran, summary }), /Verification did not complete/);
  assert.match(render({ context: ran, summary, verdict: emptyVerdict, commitOutcome: 'failure' }), /trusted checks/);
});

test('says when verified tests were not pushed', () => {
  const verdict = { ...emptyVerdict, accepted: ['a.test.ts'] };
  const moved = render({ context: ran, summary, verdict, push: 'branch-moved' });
  assert.match(moved, /were not pushed/);
  assert.doesNotMatch(moved, /committed in/);
  assert.match(render({ context: ran, summary, verdict, push: 'failed' }), /pushing them .* failed/);
});

test('a malformed verdict and summary still produce a comment', () => {
  const md = render({ context: ran, summary: { report: { files: 'x' }, turns: '<b>' }, verdict: { runs: 'x' } });
  assert.match(md, /0 test file\(s\) accepted/);
  assert.doesNotMatch(md, /<b>/);
});

test('run details count tool errors', () => {
  const md = render({ context: ran, summary: { ...summary, toolErrors: ['denied'] }, verdict: emptyVerdict });
  assert.match(md, /1 tool error/);
});

test('file names cannot split a table row', () => {
  const files = [{ source: 'a|b.ts', decision: 'tested', reason: 'x' }];
  const md = render({ context: ran, summary: { report: { files } }, verdict: emptyVerdict });
  assert.match(md, /\| `ab\.ts` \|/);
});
