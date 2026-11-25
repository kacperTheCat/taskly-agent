#!/usr/bin/env node
// Decides whether the agent's patch may reach the PR branch. This is the binding check:
// the publish job runs the copy of this file from the base commit, never the one from the PR.
//
// Usage: validate-patch.mjs <patch file> [--repo <clean checkout>]
// Without --repo it only inspects the patch text. With --repo it also applies the patch
// and inspects the resulting files. Exits 1 and lists the problems if the patch is refused.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isMain, readArgs } from './cli.mjs';
import { CREDENTIAL_PATTERN } from './credentials.mjs';
import { isWritable, loadPolicy } from './policy.mjs';

const TEST_CALL = /\b(?:it|test)(?:\.(?:each\([^)]*\)|only|skip|todo|concurrent))?\s*\(/g;
const FOCUS_OR_SKIP = /\b(?:it|test|describe)\.(?:only|skip|todo|skipIf|runIf|fails)\b|\bx(?:it|describe)\(/g;
const REGULAR_FILE = '100644';

if (isMain(import.meta.url)) {
  const args = readArgs({
    usage: 'validate-patch.mjs <patch file> [--repo <clean checkout>]',
    positionals: 1,
    options: { repo: { type: 'string' } },
  });
  main(args.positionals[0], args.repo);
}

function main(patchFile, repo) {
  const policy = loadPolicy();
  const patch = readFileSync(patchFile, 'utf8');

  const { files, problems } = checkStructure(policy, patch);
  if (problems.length === 0 && repo) {
    problems.push(...applyAndCheckResult(policy, resolve(patchFile), repo));
  }

  if (problems.length > 0) {
    console.error(problems.map((problem) => `- ${problem}`).join('\n'));
    process.exit(1);
  }
  console.log(`Patch accepted: ${files.length} test file(s).`);
}

// Step 1: what the patch text says it does.
export function checkStructure(policy, patch) {
  const problems = [];
  if (CREDENTIAL_PATTERN.test(patch)) problems.push('patch contains something that looks like a credential');

  const files = parsePatch(patch);
  for (const file of files) {
    const name = file.newPath ?? file.oldPath ?? '(unnamed file)';
    if (file.oldPath !== file.newPath) problems.push(`${name}: path change is not allowed`);
    if (file.deleted) problems.push(`${name}: deleting files is not allowed`);
    if (file.renamedOrCopied) problems.push(`${name}: renames and copies are not allowed`);
    if (file.binary) problems.push(`${name}: binary content is not allowed`);
    if (file.oldMode || (file.newMode && file.newMode !== REGULAR_FILE)) {
      problems.push(`${name}: mode changes, symlinks and executables are not allowed`);
    }
    if (!isWritable(policy, file.newPath ?? '')) problems.push(`${name}: not a writable test path`);
  }
  return { files, problems };
}

function parsePatch(patch) {
  const sections = patch.split(/^(?=diff --git )/m).filter((section) => section.startsWith('diff --git '));
  return sections.map((section) => {
    const [, oldPath, newPath] = section.match(/^diff --git a\/(\S+) b\/(\S+)/) ?? [];
    return {
      oldPath,
      newPath,
      created: /^new file mode/m.test(section),
      deleted: /^deleted file mode/m.test(section),
      renamedOrCopied: /^(rename|copy) (from|to) /m.test(section),
      binary: /^(GIT binary patch|Binary files )/m.test(section),
      newMode: section.match(/^(?:new file mode|new mode) (\d+)/m)?.[1],
      oldMode: section.match(/^old mode (\d+)/m)?.[1],
    };
  });
}

// Step 2: what the patch actually does to the files. `git apply` also accepts plain
// ---/+++ sections that the text check above never sees, so the result is what counts.
function applyAndCheckResult(policy, patchPath, repo) {
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (git('status', '--porcelain').trim()) return ['target checkout is not clean'];

  try {
    git('apply', '--whitespace=nowarn', patchPath);
  } catch {
    return ['patch does not apply to the target checkout'];
  }
  git('add', '--all');
  const { changed, problems } = checkTree(policy, git('diff', '--cached', '--raw', '-z', '--no-renames', 'HEAD'));

  for (const { path, created } of changed) {
    const before = created ? '' : git('show', `HEAD:${path}`);
    const after = readFileSync(join(repo, path), 'utf8');
    problems.push(...checkContent(before, after, path));
  }
  git('reset', '--quiet');
  return problems;
}

// Every changed path must be an added or modified regular file on a writable test path.
export function checkTree(policy, rawDiff) {
  const problems = [];
  const changed = [];
  for (const { path, status, newMode } of parseRawDiff(rawDiff)) {
    if (status !== 'A' && status !== 'M') problems.push(`${path}: change type ${status} is not allowed`);
    else if (newMode !== REGULAR_FILE) problems.push(`${path}: only regular, non-executable files are allowed`);
    else if (!isWritable(policy, path)) problems.push(`${path}: not a writable test path`);
    else changed.push({ path, created: status === 'A' });
  }
  return { changed, problems };
}

// `git diff --raw -z` prints ":oldmode newmode oldsha newsha STATUS\0path\0" per file.
function parseRawDiff(rawDiff) {
  const tokens = rawDiff.split('\0');
  const entries = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const [, , newMode, , , status] = tokens[i].match(/^:(\d+) (\d+) (\w+) (\w+) ([A-Z])/) ?? [];
    entries.push({ path: tokens[i + 1], status, newMode });
  }
  return entries;
}

// A changed test file may not lose tests or gain .only/.skip-style markers. Counting calls
// is a heuristic against quietly dropped tests, not proof: a renamed test still counts once.
export function checkContent(before, after, path) {
  const problems = [];
  if (count(after, TEST_CALL) < count(before, TEST_CALL)) problems.push(`${path}: number of tests dropped`);
  if (count(after, FOCUS_OR_SKIP) > count(before, FOCUS_OR_SKIP)) problems.push(`${path}: adds .only/.skip/.todo`);
  return problems;
}

function count(text, pattern) {
  return (text.match(pattern) ?? []).length;
}
