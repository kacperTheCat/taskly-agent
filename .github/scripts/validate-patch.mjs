#!/usr/bin/env node
// Binding check of the agent's patch. Run from the base ref's copy of this script, never the PR's.
// Usage: validate-patch.mjs <patch file> [--repo <checkout to apply to>]
// Exits 1 and prints the violations if the patch is not acceptable; applies it with --repo otherwise.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isWritable, loadPolicy } from './policy.mjs';

const SECRET = /(sk-ant-[\w-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,})/;
const TEST_CALL = /\b(?:it|test)(?:\.(?:each\([^)]*\)|only|skip|todo|concurrent))?\s*\(/g;
const FOCUS = /\b(?:it|test|describe)\.(?:only|skip|todo)\b|\bx(?:it|describe)\(/g;

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

if (import.meta.url === `file://${process.argv[1]}`) {
  const [patchPath, flag, repo] = process.argv.slice(2);
  const patch = readFileSync(patchPath, 'utf8');
  const { files, problems } = checkStructure(loadPolicy(), patch);
  if (!problems.length && flag === '--repo') {
    const before = Object.fromEntries(files.map((f) => {
      const p = join(repo, f.b);
      return [f.b, existsSync(p) ? readFileSync(p, 'utf8') : ''];
    }));
    execFileSync('git', ['apply', '--whitespace=nowarn', join(process.cwd(), patchPath)], { cwd: repo });
    for (const f of files) problems.push(...checkContent(before[f.b], readFileSync(join(repo, f.b), 'utf8'), f.b));
  }
  if (problems.length) {
    console.error(problems.map((p) => `- ${p}`).join('\n'));
    process.exit(1);
  }
  console.log(`Patch accepted: ${files.length} test file(s).`);
}
