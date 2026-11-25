import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CREDENTIAL_PATTERN } from './credentials.mjs';
import { runScript } from './test-helpers.mjs';

test('credential pattern flags API keys and GitHub tokens, not ordinary text', () => {
  assert.match('key = "sk-ant-api03-abcdefghijkl"', CREDENTIAL_PATTERN);
  assert.match(`ghs_${'a'.repeat(36)}`, CREDENTIAL_PATTERN);
  assert.match(`github_pat_${'a'.repeat(30)}`, CREDENTIAL_PATTERN);
  assert.doesNotMatch("it('creates a task', () => {})", CREDENTIAL_PATTERN);
});

test('credentials script exits 1 only for files with a credential', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'credentials-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const clean = join(dir, 'clean.txt');
  const leaky = join(dir, 'leaky.txt');
  writeFileSync(clean, 'nothing here');
  writeFileSync(leaky, 'token sk-ant-api03-abcdefghijkl');
  assert.equal(runScript('.github/scripts/credentials.mjs', [clean]).status, 0);
  assert.equal(runScript('.github/scripts/credentials.mjs', [clean, leaky]).status, 1);
});
