#!/usr/bin/env node
// PreToolUse hook: the agent may only write files allowed by .claude/test-policy.json.
// Fast feedback for the agent; the binding check is validate-patch in CI. Fails closed.
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { isWritable, loadPolicy } from '../../.github/scripts/policy.mjs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof target !== 'string') throw new Error('no file path in tool input');
  const path = relative(root, resolve(root, target));
  if (!isWritable(loadPolicy(), path)) throw new Error(`${path} is not a writable test path (see .claude/test-policy.json)`);
} catch (error) {
  process.stderr.write(`Blocked: ${error.message}\n`);
  process.exit(2);
}
