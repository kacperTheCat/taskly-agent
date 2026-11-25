// Runs the agent's test files and measures coverage with Vitest.
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { byPackage, npx, withinPackage } from './packages.mjs';

// A test file counts only if Vitest ran it and it passed on every run; a file Vitest did not
// collect is rejected too. Repeated runs catch tests that depend on timing, order or shared state.
export function runTestsRepeatedly(packages, testFiles, runs, scratch) {
  const failures = new Map();
  for (const { pkg, files } of byPackage(packages, testFiles)) {
    for (let run = 1; run <= runs; run++) {
      const passed = runOnce(pkg, files, join(scratch, `${pkg}-run${run}.json`));
      const newlyFailed = files.filter((path) => !passed.has(path) && !failures.has(path));
      for (const file of newlyFailed) {
        failures.set(file, run === 1 ? 'tests fail or did not run' : 'flaky: failed on a repeated run');
      }
    }
  }
  return failures;
}

function runOnce(pkg, files, reportFile) {
  const paths = files.map((file) => withinPackage(pkg, file));
  npx(pkg, ['vitest', 'run', ...paths, '--reporter=json', `--outputFile=${reportFile}`]);
  if (!existsSync(reportFile)) return new Set();
  return passingTestFiles(JSON.parse(readFileSync(reportFile, 'utf8')), process.cwd());
}

// Files Vitest ran with at least one test, all of them passing.
export function passingTestFiles(vitestReport, root) {
  const passed = (vitestReport.testResults ?? []).filter(
    (result) => result.status === 'passed' && result.assertionResults?.length > 0,
  );
  return new Set(passed.map((result) => relative(root, result.name)));
}

// Line coverage per source file, from a full test run of its package.
export function measureCoverage(packages, sources, reportRoot) {
  const coverage = {};
  for (const { pkg, files } of byPackage(packages, sources)) {
    const reportDir = join(reportRoot, pkg);
    npx(pkg, [
      'vitest', 'run', '--coverage.enabled', '--coverage.reporter=json-summary', '--coverage.thresholds={}',
      `--coverage.reportsDirectory=${reportDir}`,
      ...files.map((file) => `--coverage.include=${withinPackage(pkg, file)}`),
    ]);
    Object.assign(coverage, readLineCoverage(join(reportDir, 'coverage-summary.json')));
  }
  return coverage;
}

function readLineCoverage(summaryFile) {
  if (!existsSync(summaryFile)) return {};
  const entries = Object.entries(JSON.parse(readFileSync(summaryFile, 'utf8')))
    .filter(([file]) => file !== 'total')
    .map(([file, metrics]) => [relative(process.cwd(), file), metrics.lines.pct]);
  return Object.fromEntries(entries);
}
