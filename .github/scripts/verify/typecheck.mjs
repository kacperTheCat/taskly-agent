// Vitest does not typecheck, so tsc does.
import { byPackage, npx } from './packages.mjs';

// If tsc fails without naming a file, every test file of that package is rejected rather than trusted.
export function checkTypes(packages, testFiles) {
  const failures = new Map();
  for (const { pkg, files } of byPackage(packages, testFiles)) {
    const tsc = npx(pkg, ['tsc', '--noEmit', '-p', '.']);
    if (tsc.status === 0) continue;

    const named = failingTypecheckFiles(tsc.stdout, pkg);
    for (const file of files) {
      if (named.size === 0) failures.set(file, 'typecheck failed without a file location');
      else if (named.has(file)) failures.set(file, 'type errors');
    }
  }
  return failures;
}

// tsc prints "src/file.test.ts(12,5): error TS2322: ..." relative to the package.
export function failingTypecheckFiles(output, pkg) {
  const files = new Set();
  for (const match of output.matchAll(/^([^\s(]+)\(\d+,\d+\): error TS/gm)) files.add(`${pkg}/${match[1]}`);
  return files;
}
