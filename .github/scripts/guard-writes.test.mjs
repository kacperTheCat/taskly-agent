import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, runScript } from './test-helpers.mjs';

const hook = (input) => runScript('.claude/hooks/guard-writes.mjs', [], {
  input, env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
}).status;

test('allows test files, blocks everything else and fails closed', () => {
  assert.equal(hook(JSON.stringify({ tool_input: { file_path: 'backend/tests/a.test.ts' } })), 0);
  assert.equal(hook(JSON.stringify({ tool_input: { file_path: `${ROOT}frontend/src/A.test.tsx` } })), 0);
  assert.equal(hook(JSON.stringify({ tool_input: { file_path: 'backend/src/factory.ts' } })), 2);
  assert.equal(hook(JSON.stringify({ tool_input: { file_path: '/etc/passwd' } })), 2);
  assert.equal(hook(JSON.stringify({ tool_input: {} })), 2);
  assert.equal(hook('not json'), 2);
});
