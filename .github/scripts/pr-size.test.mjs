import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countChangedLines } from './pr-size.mjs';

test('counts added and removed lines', () => {
  assert.equal(countChangedLines('10\t5\tsrc/a.ts\n3\t0\tsrc/b.ts\n'), 18);
});

test('lockfiles and binary files do not count', () => {
  const numstat = ['900\t0\tpackage-lock.json', '50\t2\t.github/lint/package-lock.json', '-\t-\tlogo.png', '4\t1\ta.ts'].join('\n');
  assert.equal(countChangedLines(numstat), 5);
});

test('an empty diff is zero lines', () => {
  assert.equal(countChangedLines(''), 0);
});
