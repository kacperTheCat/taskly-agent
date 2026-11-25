#!/usr/bin/env node
// Checks the agent's tests without any model: applies the patch, runs each touched test file
// repeatedly, typechecks, removes files that fail, and measures coverage of the changed sources.
// Runs in the workflow's `verify` job, which has no API key and no write token.
//
// Usage: verify.mjs <patch file> <base sha> <output dir>   (from the root of the PR checkout)
// Writes verified.patch (only the accepted files) and verdict.json to the output dir.
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMain, readArgs } from './cli.mjs';
import { classify, loadPolicy } from './policy.mjs';
import { git } from './verify/packages.mjs';
import { applyPatch, revertFiles, writePatch } from './verify/patch.mjs';
import { checkTypes } from './verify/typecheck.mjs';
import { measureCoverage, runTestsRepeatedly } from './verify/vitest.mjs';

const RUNS = 2;

if (isMain(import.meta.url)) {
  const args = readArgs({ usage: 'verify.mjs <patch file> <base sha> <output dir>', positionals: 3 });
  const scratch = mkdtempSync(join(tmpdir(), 'verify-'));
  try {
    const [patchFile, baseSha, outDir] = args.positionals;
    main(patchFile, baseSha, outDir, scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function main(patchFile, baseSha, outDir, scratch) {
  const policy = loadPolicy();
  const packages = Object.keys(policy.packages);
  const changedSources = findChangedSources(policy, baseSha);
  const coverageBefore = measureCoverage(packages, changedSources, join(scratch, 'coverage-before'));

  const patch = applyPatch(policy, patchFile);
  const failures = findFailures(packages, patch, scratch);
  revertFiles(failures.keys(), patch.modifiedFiles);

  const coverageAfter = measureCoverage(packages, changedSources, join(scratch, 'coverage-after'));
  const accepted = patch.testFiles.filter((file) => !failures.has(file));
  const verifiedPatch = writePatch(outDir, accepted);

  writeVerdict(outDir, {
    accepted,
    rejected: patch.rejected
      ? [{ file: '(patch)', reason: patch.rejected }]
      : [...failures].map(([file, reason]) => ({ file, reason })),
    modifiedExisting: patch.modifiedFiles,
    coverage: changedSources.map((source) => ({
      source,
      before: coverageBefore[source] ?? null,
      after: coverageAfter[source] ?? null,
    })),
    runs: RUNS,
    patchSha256: createHash('sha256').update(verifiedPatch).digest('hex'),
  });
}

function findChangedSources(policy, baseSha) {
  return git('diff', '--name-only', '--diff-filter=AMR', `${baseSha}...HEAD`)
    .split('\n')
    .filter(Boolean)
    .map((path) => classify(policy, path))
    .filter((file) => file.decision === 'candidate')
    .map((file) => file.path);
}

// Test files that fail a run or the typecheck, with the reason. A type error wins over a test
// failure because it explains it.
function findFailures(packages, patch, scratch) {
  if (patch.rejected) return new Map();
  const testFailures = runTestsRepeatedly(packages, patch.testFiles, RUNS, scratch);
  const typeFailures = checkTypes(packages, patch.testFiles);
  return new Map([...testFailures, ...typeFailures]);
}

function writeVerdict(outDir, verdict) {
  writeFileSync(join(outDir, 'verdict.json'), `${JSON.stringify(verdict, null, 2)}\n`);
  console.log(JSON.stringify(verdict, null, 2));
}
