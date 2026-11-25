import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const hook = (input) => spawnSync('node', ['.claude/hooks/guard-writes.mjs'], {
  input, env: { ...process.env, CLAUDE_PROJECT_DIR: process.cwd() },
}).status;

test('allows test files, blocks everything else and fails closed', () => {
  assert.equal(hook(JSON.stringify({ tool_input: { file_path: 'backend/tests/a.test.ts' } })), 0);
  assert.equal(hook(JSON.stringify({ tool_input: { file_path: `${process.cwd()}/frontend/src/A.test.tsx` } })), 0);
  assert.equal(hook(JSON.stringify({ tool_input: { file_path: 'backend/src/factory.ts' } })), 2);
  assert.equal(hook(JSON.stringify({ tool_input: { file_path: '/etc/passwd' } })), 2);
  assert.equal(hook(JSON.stringify({ tool_input: {} })), 2);
  assert.equal(hook('not json'), 2);
});
