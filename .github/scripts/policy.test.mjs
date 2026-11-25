import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, isWritable, loadPolicy } from './policy.mjs';

const policy = loadPolicy();

test('only test files are writable', () => {
  assert.ok(isWritable(policy, 'backend/tests/router.test.ts'));
  assert.ok(isWritable(policy, 'backend/tests/nested/config.test.ts'));
  assert.ok(isWritable(policy, 'frontend/src/features/todos/TodosPage.test.tsx'));
  assert.ok(isWritable(policy, 'frontend/src/lib/http.test.ts'));
  assert.ok(isWritable(policy, './backend/tests/router.test.ts'));
  for (const path of [
    'backend/src/factory.ts', 'backend/tests/fixture.ts', 'backend/package.json',
    'backend/vitest.config.ts', 'frontend/src/test/setup.ts', '.github/workflows/ci.yml',
    '.claude/test-policy.json', 'backend/tests/../src/x.test.ts', 'backend/tests/x.test.ts.bak',
    'frontend/src/x.test.js', 'backend/tests/.test.ts', 'backend//tests/x.test.ts', 'backend/tests/a\nb.test.ts',
  ]) assert.equal(isWritable(policy, path), false, path);
});

test('classifies changed files', () => {
  assert.equal(classify(policy, 'backend/src/features/todos/router.ts').decision, 'candidate');
  assert.equal(classify(policy, 'frontend/src/lib/http.ts').skill, 'frontend-unit-tests');
  assert.equal(classify(policy, 'backend/src/features/todos/types.ts').decision, 'skip');
  assert.equal(classify(policy, 'frontend/src/design-system/components/Button/Button.tsx').decision, 'skip');
  assert.equal(classify(policy, 'frontend/src/features/todos/TodosPage.test.tsx').decision, 'skip');
  assert.equal(classify(policy, 'README.md').decision, 'ignored');
  assert.equal(classify(policy, 'backend/package.json').decision, 'ignored');
});

test('commas outside braces are literal', async () => {
  const { matches } = await import('./policy.mjs');
  assert.equal(matches('xb', 'a,b'), false);
  assert.equal(matches('a.ts', '*.{ts,tsx}'), true);
});
