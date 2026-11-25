import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { summarize } from './transcript.mjs';

const run = (script, ...args) => spawnSync('node', [script, ...args], { encoding: 'utf8' });

test('run-tests rejects anything that is not a test file', () => {
  for (const path of ['backend/src/main.ts', 'backend/tests/../src/x.test.ts', '/etc/passwd']) {
    assert.equal(run('.claude/scripts/run-tests.mjs', path).status, 2, path);
  }
  assert.equal(run('.claude/scripts/run-tests.mjs').status, 2);
});

test('changed-files keeps candidates and gates runs without them', () => {
  const out = (...files) => JSON.parse(run('.github/scripts/changed-files.mjs', '--files', ...files).stdout);
  const mixed = out('backend/src/core/config.ts', 'backend/src/features/todos/types.ts', 'README.md');
  assert.equal(mixed.run, true);
  assert.deepEqual(mixed.files.map((f) => f.decision), ['candidate', 'skip']);
  assert.match(mixed.prompt, /backend\/src\/core\/config\.ts/);
  assert.doesNotMatch(mixed.prompt, /types\.ts/);
  assert.equal(out('README.md', 'frontend/src/main.tsx').run, false);
});

test('transcript summary survives a truncated last line', () => {
  const lines = [
    { type: 'system', model: 'm' },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'verify-tests' } }] } },
    { type: 'result', subtype: 'success', num_turns: 3, total_cost_usd: 0.1, structured_output: { files: [] } },
  ].map((l) => JSON.stringify(l));
  const full = summarize(lines.join('\n'));
  assert.equal(full.outcome, 'success');
  assert.deepEqual(full.skills, ['verify-tests']);
  const cut = summarize(`${lines.slice(0, 2).join('\n')}\n{"type":"res`);
  assert.equal(cut.outcome, 'incomplete');
  assert.equal(cut.report, null);
});
