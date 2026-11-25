#!/usr/bin/env node
// Binding check of the agent's patch. Run from the base ref's copy of this script, never the PR's.
// Usage: validate-patch.mjs <patch file> [--repo <checkout to apply to>]
// Exits 1 and prints the violations if the patch is not acceptable; applies it with --repo otherwise.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isWritable, loadPolicy } from './policy.mjs';

const SECRET = /(sk-ant-[\w-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,})/;
const TEST_CALL = /\b(?:it|test)(?:\.(?:each\([^)]*\)|only|skip|todo|concurrent))?\s*\(/g;
const FOCUS = /\b(?:it|test|describe)\.(?:only|skip|todo|skipIf|runIf|fails)\b|\bx(?:it|describe)\(/g;

const count = (text, re) => (text.match(re) ?? []).length;

export function parsePatch(patch) {
  return patch.split(/^(?=diff --git )/m).filter((c) => c.startsWith('diff --git ')).map((chunk) => {
    const [, a, b] = chunk.match(/^diff --git a\/(\S+) b\/(\S+)/) ?? [];
    return {
      a, b,
      created: /^new file mode/m.test(chunk),
      deleted: /^deleted file mode/m.test(chunk),
      renamed: /^(rename|copy) (from|to) /m.test(chunk),
      binary: /^(GIT binary patch|Binary files )/m.test(chunk),
      mode: chunk.match(/^(?:new file mode|new mode) (\d+)/m)?.[1],
      oldMode: chunk.match(/^old mode (\d+)/m)?.[1],
    };
  });
}

export function checkStructure(policy, patch) {
  const problems = [];
  if (SECRET.test(patch)) problems.push('patch contains something that looks like a credential');
  const files = parsePatch(patch);
  for (const f of files) {
    if (!f.a || f.a !== f.b) problems.push(`${f.a ?? '?'}: path change is not allowed`);
    if (f.deleted) problems.push(`${f.a}: deleting files is not allowed`);
    if (f.renamed) problems.push(`${f.a}: renames and copies are not allowed`);
    if (f.binary) problems.push(`${f.a}: binary content is not allowed`);
    if (f.oldMode || (f.mode && f.mode !== '100644')) problems.push(`${f.a}: mode changes, symlinks and executables are not allowed`);
    if (!isWritable(policy, f.b ?? '')) problems.push(`${f.b}: not a writable test path`);
  }
  return { files, problems };
}

export function checkContent(before, after, path) {
  const problems = [];
  if (count(after, TEST_CALL) < count(before, TEST_CALL)) problems.push(`${path}: number of tests dropped`);
  if (count(after, FOCUS) > count(before, FOCUS)) problems.push(`${path}: adds .only/.skip/.todo`);
  return problems;
}

// Checks the tree the patch produced, not the patch text: `git apply` accepts more than `diff --git` sections.
export function checkTree(policy, raw) {
  const problems = [];
  const changed = [];
  const tokens = raw.split('\0');
  for (let i = 0; i < tokens.length - 1;) {
    const [, , newMode, , , status] = tokens[i].match(/^:(\d+) (\d+) (\w+) (\w+) ([A-Z])/) ?? [];
    const path = tokens[i + 1];
    i += status === 'R' || status === 'C' ? 3 : 2;
    if (!['A', 'M'].includes(status)) problems.push(`${path}: change type ${status} is not allowed`);
    else if (newMode !== '100644') problems.push(`${path}: only regular, non-executable files are allowed`);
    else if (!isWritable(policy, path)) problems.push(`${path}: not a writable test path`);
    else changed.push({ path, created: status === 'A' });
  }
  return { changed, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [patchPath, flag, repo] = process.argv.slice(2);
  const policy = loadPolicy();
  const patch = readFileSync(patchPath, 'utf8');
  const { files, problems } = checkStructure(policy, patch);
  if (!problems.length && flag === '--repo') {
    const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' });
    if (git('status', '--porcelain').trim()) problems.push('target checkout is not clean');
    else {
      git('apply', '--whitespace=nowarn', resolve(patchPath));
      git('add', '--all');
      const tree = checkTree(policy, git('diff', '--cached', '--raw', '-z', '--no-renames', 'HEAD'));
      problems.push(...tree.problems);
      for (const { path, created } of tree.changed) {
        const before = created ? '' : git('show', `HEAD:${path}`);
        problems.push(...checkContent(before, readFileSync(join(repo, path), 'utf8'), path));
      }
      git('reset', '--quiet');
    }
  }
  if (problems.length) {
    console.error(problems.map((p) => `- ${p}`).join('\n'));
    process.exit(1);
  }
  console.log(`Patch accepted: ${files.length} test file(s).`);
}
