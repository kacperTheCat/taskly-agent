#!/usr/bin/env node
// Checks the agent's tests without any model: applies the patch, typechecks, runs each touched
// test file repeatedly, removes files that fail, and measures coverage of the changed sources.
// Runs in the workflow's `verify` job, which has no API key and no write token.
//
// Usage: verify.mjs <patch file> <base sha> <output dir>   (from the root of the PR checkout)
// Writes verified.patch (only the accepted files) and verdict.json to the output dir.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { isMain, readArgs } from './cli.mjs';
import { classify, loadPolicy } from './policy.mjs';
import { checkStructure } from './validate-patch.mjs';

const RUNS = 2;

if (isMain(import.meta.url)) {
  const args = readArgs({ usage: 'verify.mjs <patch file> <base sha> <output dir>', positionals: 3 });
  const scratch = mkdtempSync(join(tmpdir(), 'verify-'));
  try {
    main(...args.positionals, scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function main(patchFile, baseSha, outDir, scratch) {
  const policy = loadPolicy();
  const changedSources = findChangedSources(policy, baseSha);
  const coverageBefore = measureCoverage(changedSources, join(scratch, 'coverage-before'));

  const patch = applyPatch(policy, patchFile);
  let failures = new Map();
  if (!patch.rejected) {
    const testFailures = runTestsRepeatedly(patch.testFiles, scratch);
    const typeFailures = checkTypes(patch.testFiles);
    failures = new Map([...testFailures, ...typeFailures]);
    revertFailingFiles(failures, patch.modifiedFiles);
  }

  const coverageAfter = measureCoverage(changedSources, join(scratch, 'coverage-after'));
  const accepted = patch.testFiles.filter((file) => !failures.has(file));
  const rejected = patch.rejected
    ? [{ file: '(patch)', reason: patch.rejected }]
    : [...failures].map(([file, reason]) => ({ file, reason }));

  writeResults(outDir, accepted, {
    accepted,
    rejected,
    modifiedExisting: patch.modifiedFiles,
    coverage: changedSources.map((source) => ({
      source,
      before: coverageBefore[source] ?? null,
      after: coverageAfter[source] ?? null,
    })),
    runs: RUNS,
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

// validate-patch checks paths, modes and test counts, then applies the patch to this checkout.
function applyPatch(policy, patchFile) {
  const { files, problems } = checkStructure(policy, readFileSync(patchFile, 'utf8'));
  const result = problems.length
    ? { status: 1, stderr: problems.join('; ') }
    : spawnSync('node', ['.github/scripts/validate-patch.mjs', patchFile, '--repo', '.'], { encoding: 'utf8' });

  if (result.status !== 0) {
    git('reset', '--hard', '--quiet');
    git('clean', '-fdq');
    return { rejected: result.stderr.trim().slice(0, 500), testFiles: [], modifiedFiles: [] };
  }
  return {
    testFiles: files.map((file) => file.newPath),
    modifiedFiles: files.filter((file) => !file.created).map((file) => file.newPath),
  };
}

// A test file that fails on any run is rejected. The repeated run catches tests that depend
// on timing, order or shared state.
function runTestsRepeatedly(testFiles, scratch) {
  const failures = new Map();
  for (const pkg of packagesOf(testFiles)) {
    const ownFiles = testFiles.filter((file) => file.startsWith(`${pkg}/`));
    for (let run = 1; run <= RUNS; run++) {
      const reportFile = join(scratch, `${pkg}-run${run}.json`);
      vitest(pkg, [...ownFiles.map((file) => withinPackage(pkg, file)), '--reporter=json', `--outputFile=${reportFile}`]);

      const failed = existsSync(reportFile)
        ? failingTestFiles(JSON.parse(readFileSync(reportFile, 'utf8')), process.cwd())
        : new Set(ownFiles);
      for (const file of ownFiles) {
        if (failed.has(file) && !failures.has(file)) {
          failures.set(file, run === 1 ? 'tests fail' : 'flaky: failed on a repeated run');
        }
      }
    }
  }
  return failures;
}

// Vitest does not typecheck, so tsc does. If tsc fails without naming a file, every test
// file of that package is rejected rather than trusted.
function checkTypes(testFiles) {
  const failures = new Map();
  for (const pkg of packagesOf(testFiles)) {
    const tsc = spawnSync('npx', ['--no-install', 'tsc', '--noEmit', '-p', '.'], { cwd: pkg, encoding: 'utf8' });
    if (tsc.status === 0) continue;

    const named = failingTypecheckFiles(tsc.stdout, pkg);
    const ownFiles = testFiles.filter((file) => file.startsWith(`${pkg}/`));
    for (const file of ownFiles) {
      if (named.size === 0) failures.set(file, 'typecheck failed without a file location');
      else if (named.has(file)) failures.set(file, 'type errors');
    }
  }
  return failures;
}

function revertFailingFiles(failures, modifiedFiles) {
  for (const file of failures.keys()) {
    if (modifiedFiles.includes(file)) git('checkout', 'HEAD', '--', file);
    else rmSync(file);
  }
}

// Line coverage per changed source file, from a full test run of its package.
function measureCoverage(sources, reportRoot) {
  const coverage = {};
  for (const pkg of packagesOf(sources)) {
    const reportDir = join(reportRoot, pkg);
    const include = sources.filter((s) => s.startsWith(`${pkg}/`)).map((s) => `--coverage.include=${withinPackage(pkg, s)}`);
    vitest(pkg, ['--coverage.enabled', '--coverage.reporter=json-summary', `--coverage.reportsDirectory=${reportDir}`,
      '--coverage.thresholds={}', ...include]);

    const summaryFile = join(reportDir, 'coverage-summary.json');
    if (!existsSync(summaryFile)) continue;
    for (const [file, metrics] of Object.entries(JSON.parse(readFileSync(summaryFile, 'utf8')))) {
      if (file !== 'total') coverage[relative(process.cwd(), file)] = metrics.lines.pct;
    }
  }
  return coverage;
}

function writeResults(outDir, acceptedFiles, verdict) {
  let patch = '';
  if (acceptedFiles.length) {
    git('add', '--intent-to-add', '--', ...acceptedFiles);
    patch = git('diff', '--binary', 'HEAD', '--', ...acceptedFiles);
  }
  writeFileSync(join(outDir, 'verified.patch'), patch);
  verdict.patchSha256 = createHash('sha256').update(patch).digest('hex');
  writeFileSync(join(outDir, 'verdict.json'), `${JSON.stringify(verdict, null, 2)}\n`);
  console.log(JSON.stringify(verdict, null, 2));
}

// tsc prints "src/file.test.ts(12,5): error TS2322: ..." relative to the package.
export function failingTypecheckFiles(output, pkg) {
  const files = new Set();
  for (const match of output.matchAll(/^([^\s(]+)\(\d+,\d+\): error TS/gm)) files.add(`${pkg}/${match[1]}`);
  return files;
}

export function failingTestFiles(vitestReport, root) {
  const failed = vitestReport.testResults.filter((result) => result.status !== 'passed');
  return new Set(failed.map((result) => relative(root, result.name)));
}

// Policy packages (backend, frontend) that contain at least one of the paths.
function packagesOf(paths) {
  return Object.keys(loadPolicy().packages).filter((pkg) => paths.some((path) => path.startsWith(`${pkg}/`)));
}

function withinPackage(pkg, path) {
  return path.slice(pkg.length + 1);
}

function vitest(pkg, args) {
  return spawnSync('npx', ['--no-install', 'vitest', 'run', ...args], { cwd: pkg, encoding: 'utf8' });
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}
