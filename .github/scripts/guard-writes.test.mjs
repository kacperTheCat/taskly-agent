import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, runScript } from './test-helpers.mjs';

const hook = (input) => runScript('.claude/hooks/guard-writes.mjs', [], {
  input, env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
}).status;

test('allows test files, blocks everything else and fails closed', () => {
  const write = (path) => JSON.stringify({ tool_input: { file_path: path } });
  for (const [input, expected] of [
    [write('backend/tests/a.test.ts'), 0],
    [write(`${ROOT}frontend/src/A.test.tsx`), 0],
    [write('backend/src/factory.ts'), 2],
    [write('/etc/passwd'), 2],
    [JSON.stringify({ tool_input: {} }), 2],
    ['not json', 2],
  ]) {
    assert.equal(hook(input), expected, input);
  }
});
