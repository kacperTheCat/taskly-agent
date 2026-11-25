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
import { loadPolicy } from './policy.mjs';
import { parsePatch, parseRawDiff } from './validate-patch/parse.mjs';
import { checkContent, sectionProblems, treeProblem } from './validate-patch/rules.mjs';

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
  const { files, problems } = checkStructure(policy, readFileSync(patchFile, 'utf8'));
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
  const files = parsePatch(patch);
  const problems = files.flatMap((file) => sectionProblems(policy, file));
  if (CREDENTIAL_PATTERN.test(patch)) problems.unshift('patch contains something that looks like a credential');
  return { files, problems };
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
  for (const entry of parseRawDiff(rawDiff)) {
    const problem = treeProblem(policy, entry);
    if (problem) problems.push(problem);
    else changed.push({ path: entry.path, created: entry.status === 'A' });
  }
  return { changed, problems };
}
