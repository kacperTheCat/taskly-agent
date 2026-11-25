import { test } from 'node:test';
import assert from 'node:assert/strict';
import { code, number, percent, text } from './report/markdown.mjs';

test('agent text cannot mention anyone', () => {
  assert.doesNotMatch(text('ping @org/team'), /@org/);
});

test('agent text cannot create links', () => {
  assert.doesNotMatch(text('see https://evil.example'), /https:\/\//);
  assert.doesNotMatch(text('see www.evil.example'), /www\./);
});

test('agent text cannot open HTML, code or a table cell', () => {
  assert.doesNotMatch(text('a | <img src=x> `code`'), /(^|[^\\])[|<`]/);
});

test('agent text is capped in length', () => {
  assert.ok(text('x'.repeat(500)).length <= 200);
});

test('code spans drop characters that would break them', () => {
  assert.equal(code('a`b|c\r\nd'), '`abcd`');
});

test('numbers that are not numbers are shown as unknown', () => {
  assert.equal(number(0.081, 2), '0.08');
  assert.equal(number('<b>'), '?');
  assert.equal(percent(null), 'n/a');
  assert.equal(percent(50), '50%');
});
