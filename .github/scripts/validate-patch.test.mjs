import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkContent, checkStructure } from './validate-patch.mjs';
import { loadPolicy } from './policy.mjs';

const policy = loadPolicy();
const diff = (path, header = '') =>
  `diff --git a/${path} b/${path}\n${header}--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-a\n+b\n`;

test('accepts edits and new files on writable test paths', () => {
  const patch = diff('backend/tests/config.test.ts', 'new file mode 100644\n') + diff('frontend/src/lib/http.test.ts');
  assert.deepEqual(checkStructure(policy, patch).problems, []);
});

test('rejects anything outside the policy', () => {
  const cases = {
    source: diff('backend/src/factory.ts'),
    config: diff('backend/vitest.config.ts'),
    deletion: diff('backend/tests/router.test.ts', 'deleted file mode 100644\n'),
    symlink: diff('backend/tests/x.test.ts', 'new file mode 120000\n'),
    executable: diff('backend/tests/x.test.ts', 'old mode 100644\nnew mode 100755\n'),
    rename: 'diff --git a/backend/tests/a.test.ts b/backend/tests/b.test.ts\nrename from backend/tests/a.test.ts\nrename to backend/tests/b.test.ts\n',
    binary: diff('backend/tests/x.test.ts', 'GIT binary patch\n'),
    secret: diff('backend/tests/x.test.ts').replace('+b', '+const k = "sk-ant-api03-abcdefghijkl"'),
  };
  for (const [name, patch] of Object.entries(cases)) {
    assert.ok(checkStructure(policy, patch).problems.length > 0, name);
  }
});

test('rejects fewer tests and new focus or skip markers', () => {
  const before = "it('a', () => {})\nit.each([1])('b %s', () => {})\n";
  assert.deepEqual(checkContent(before, `${before}it('c', () => {})\n`, 'f'), []);
  assert.equal(checkContent(before, "it('a', () => {})\n", 'f').length, 1);
  assert.equal(checkContent(before, `${before}it.skip('c', () => {})\n`, 'f').length, 1);
  assert.equal(checkContent(before, before.replace("it('a'", "it.only('a'"), 'f').length, 1);
});
