import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARKER, render, text } from './report.mjs';

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

test('says why nothing was committed when verification or publishing failed', () => {
  const summary = { report: { files: [] } };
  assert.match(render({ context: { run: true }, summary }), /Verification did not complete/);
  assert.match(render({ context: { run: true }, summary, verdict: {}, publish: 'failure' }), /trusted validation/);
});

test('says when verified tests could not be pushed', () => {
  const md = render({
    context: { run: true },
    summary: { report: { files: [] } },
    verdict: { runs: 2, accepted: ['a.test.ts'], rejected: [], modifiedExisting: [], coverage: [] },
    publish: 'success',
    pushed: 'false',
  });
  assert.match(md, /were not pushed/);
  assert.doesNotMatch(md, /committed in/);
});

test('file names cannot split a table row', () => {
  const md = render({
    context: { run: true },
    summary: { report: { files: [{ source: 'a|b.ts', decision: 'tested', reason: 'x' }] } },
    verdict: { runs: 2, accepted: [], rejected: [], modifiedExisting: [], coverage: [] },
  });
  assert.match(md, /\| `ab\.ts` \|/);
});
