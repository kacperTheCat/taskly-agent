import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runScript } from './test-helpers.mjs';

// A tiny script that prints what readArgs returns, so exits and messages can be checked.
function argsScript(t) {
  const dir = mkdtempSync(join(tmpdir(), 'cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const script = join(dir, 'args.mjs');
  const cli = new URL('./cli.mjs', import.meta.url).href;
  writeFileSync(script, `import { readArgs } from '${cli}';
console.log(JSON.stringify(readArgs({ usage: 'args.mjs <a>', positionals: 1, required: ['name'], options: { name: { type: 'string' } } })));`);
  return (...args) => runScript(script, args);
}

test('readArgs returns options and positionals', (t) => {
  const run = argsScript(t);
  assert.deepEqual(JSON.parse(run('--name', 'x', 'a').stdout), { name: 'x', positionals: ['a'] });
});

test('readArgs exits 2 with a message for missing or unknown arguments', (t) => {
  const run = argsScript(t);
  for (const [args, message] of [
    [['a'], /missing --name/],
    [['--name', 'x'], /expected 1 argument/],
    [['--name', 'x', '--other', 'a'], /Unknown option/],
  ]) {
    const result = run(...args);
    assert.equal(result.status, 2);
    assert.match(result.stderr, message);
    assert.match(result.stderr, /Usage: args\.mjs/);
  }
});
