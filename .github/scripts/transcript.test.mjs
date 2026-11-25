import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from './transcript.mjs';

const lines = [
  { type: 'system', model: 'claude-sonnet' },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'verify-tests' } }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'node .claude/scripts/run-tests.mjs a.test.ts' } }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', is_error: true, content: 'Permission denied' }] } },
  { type: 'result', subtype: 'success', num_turns: 3, total_cost_usd: 0.1, structured_output: { files: [] } },
].map((event) => JSON.stringify(event));

test('transcript summary reports outcome, skills and tool errors', () => {
  const summary = summarize(lines.join('\n'));
  assert.equal(summary.outcome, 'success');
  assert.equal(summary.model, 'claude-sonnet');
  assert.deepEqual(summary.skills, ['verify-tests']);
  assert.deepEqual(summary.commands, ['node .claude/scripts/run-tests.mjs a.test.ts']);
  assert.deepEqual(summary.toolErrors, ['Permission denied']);
  assert.deepEqual(summary.report, { files: [] });
});

test('transcript summary survives a run cut off mid-line', () => {
  const summary = summarize(`${lines.slice(0, 2).join('\n')}\n{"type":"res`);
  assert.equal(summary.outcome, 'incomplete');
  assert.equal(summary.report, null);
});

test('transcript summary tolerates messages without content', () => {
  assert.equal(summarize(JSON.stringify({ type: 'assistant', message: {} })).toolCalls, 0);
});
