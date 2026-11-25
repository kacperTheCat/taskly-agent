#!/usr/bin/env node
// Keeps pull requests small enough to review: fails when a PR changes more lines than the
// limit. Lockfiles are generated, so they do not count.
//
// Usage: pr-size.mjs --base <sha> [--head <sha>]
import { execFileSync } from 'node:child_process';
import { isMain, readArgs } from './cli.mjs';

export const MAX_CHANGED_LINES = 420;
const GENERATED = /(^|\/)package-lock\.json$/;

if (isMain(import.meta.url)) main();

function main() {
  const args = readArgs({
    usage: 'pr-size.mjs --base <sha> [--head <sha>]',
    required: ['base'],
    options: { base: { type: 'string' }, head: { type: 'string', default: 'HEAD' } },
  });
  const numstat = execFileSync('git', ['diff', '--numstat', `${args.base}...${args.head}`], { encoding: 'utf8' });
  const changed = countChangedLines(numstat);

  console.log(`Changed lines (without lockfiles): ${changed} of ${MAX_CHANGED_LINES} allowed.`);
  if (changed > MAX_CHANGED_LINES) {
    console.error('Split this pull request: smaller PRs get real reviews.');
    process.exit(1);
  }
}

// `git diff --numstat` prints "added<TAB>removed<TAB>path"; binary files show "-".
export function countChangedLines(numstat) {
  let total = 0;
  for (const line of numstat.split('\n').filter(Boolean)) {
    const [added, removed, path] = line.split('\t');
    if (GENERATED.test(path)) continue;
    total += (Number(added) || 0) + (Number(removed) || 0);
  }
  return total;
}
