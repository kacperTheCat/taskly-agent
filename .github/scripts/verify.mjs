#!/usr/bin/env node
// Verifies the agent's patch without any LLM: apply, typecheck, run the touched tests twice,
// drop failing files, measure coverage of the changed sources before and after.
// Usage: verify.mjs <patch> <base sha> <out dir>   (run from the PR head checkout)
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { classify, loadPolicy } from './policy.mjs';
import { checkStructure } from './validate-patch.mjs';

const RUNS = 2;
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' });
const tmp = mkdtempSync(join(tmpdir(), 'verify-'));

export function failingTypecheckFiles(output, pkg) {
  const files = new Set();
  for (const m of output.matchAll(/^([^\s(]+)\(\d+,\d+\): error TS/gm)) files.add(`${pkg}/${m[1]}`);
  return files;
}

export function failingTestFiles(report, root) {
  return new Set(report.testResults.filter((r) => r.status !== 'passed').map((r) => relative(root, r.name)));
}

function vitest(pkg, args) {
  return spawnSync('npx', ['--no-install', 'vitest', 'run', ...args], { cwd: pkg, encoding: 'utf8' });
}

function coverage(pkg, sources) {
  const dir = join(tmp, `cov-${pkg}-${Date.now()}`);
  vitest(pkg, ['--coverage.enabled', '--coverage.reporter=json-summary', `--coverage.reportsDirectory=${dir}`,
    '--coverage.thresholds={}', ...sources.map((s) => `--coverage.include=${s.slice(pkg.length + 1)}`)]);
  const file = join(dir, 'coverage-summary.json');
  if (!existsSync(file)) return {};
  const summary = JSON.parse(readFileSync(file, 'utf8'));
  return Object.fromEntries(Object.entries(summary).filter(([k]) => k !== 'total')
    .map(([k, v]) => [relative(process.cwd(), k), v.lines.pct]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [patchFile, base, outDir] = process.argv.slice(2);
  const policy = loadPolicy();
  const packages = Object.keys(policy.packages);
  const candidates = git('diff', '--name-only', '--diff-filter=AMR', `${base}...HEAD`).split('\n').filter(Boolean)
    .map((p) => classify(policy, p)).filter((f) => f.decision === 'candidate').map((f) => f.path);
  const byPkg = (list, pkg) => list.filter((p) => p.startsWith(`${pkg}/`));

  const before = Object.assign({}, ...packages.map((pkg) => byPkg(candidates, pkg).length ? coverage(pkg, byPkg(candidates, pkg)) : {}));

  const patch = readFileSync(patchFile, 'utf8');
  const { files, problems } = checkStructure(policy, patch);
  const verdict = { accepted: [], rejected: [], modifiedExisting: [], coverage: [], runs: RUNS, patchSha256: null };
  if (problems.length) {
    verdict.rejected = [{ file: '(patch)', reason: problems.join('; ') }];
  } else if (files.length) {
    verdict.modifiedExisting = files.filter((f) => !f.created).map((f) => f.b);
    const applied = spawnSync('node', ['.github/scripts/validate-patch.mjs', patchFile, '--repo', '.'], { encoding: 'utf8' });
    if (applied.status !== 0) {
      verdict.rejected = [{ file: '(patch)', reason: applied.stderr.trim().slice(0, 500) }];
      files.length = 0;
    }
    const tests = files.map((f) => f.b);
    const reasons = new Map();
    for (const pkg of packages) {
      const own = byPkg(tests, pkg);
      if (!own.length) continue;
      const tsc = spawnSync('npx', ['--no-install', 'tsc', '--noEmit', '-p', '.'], { cwd: pkg, encoding: 'utf8' });
      for (const f of failingTypecheckFiles(tsc.stdout, pkg)) if (own.includes(f)) reasons.set(f, 'type errors');
      for (let run = 1; run <= RUNS; run++) {
        const out = join(tmp, `${pkg}-${run}.json`);
        vitest(pkg, [...own.map((t) => t.slice(pkg.length + 1)), '--reporter=json', `--outputFile=${out}`]);
        const failed = existsSync(out) ? failingTestFiles(JSON.parse(readFileSync(out, 'utf8')), process.cwd()) : new Set(own);
        for (const f of own) if (failed.has(f) && !reasons.has(f)) reasons.set(f, run === 1 ? 'tests fail' : 'flaky: failed on a repeated run');
      }
    }
    for (const [file, reason] of reasons) {
      verdict.rejected.push({ file, reason });
      if (verdict.modifiedExisting.includes(file)) git('checkout', '--', file); else rmSync(file);
    }
    verdict.accepted = tests.filter((t) => !reasons.has(t));
  }

  const after = Object.assign({}, ...packages.map((pkg) => byPkg(candidates, pkg).length ? coverage(pkg, byPkg(candidates, pkg)) : {}));
  verdict.coverage = candidates.map((source) => ({ source, before: before[source] ?? null, after: after[source] ?? null }));

  let accepted = '';
  if (verdict.accepted.length) {
    git('add', '-N', '--', ...verdict.accepted);
    accepted = git('diff', '--binary', 'HEAD', '--', ...verdict.accepted);
  }
  writeFileSync(join(outDir, 'verified.patch'), accepted);
  verdict.patchSha256 = createHash('sha256').update(accepted).digest('hex');
  writeFileSync(join(outDir, 'verdict.json'), `${JSON.stringify(verdict, null, 2)}\n`);
  console.log(JSON.stringify(verdict, null, 2));
}
