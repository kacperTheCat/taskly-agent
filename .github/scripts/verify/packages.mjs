// The repo has one npm package per folder (backend, frontend); tools run inside each one.
import { execFileSync, spawnSync } from 'node:child_process';

// Groups repo paths by the package folder they belong to. Packages without paths are left out.
export function byPackage(packages, paths) {
  return packages
    .map((pkg) => ({ pkg, files: paths.filter((path) => path.startsWith(`${pkg}/`)) }))
    .filter(({ files }) => files.length > 0);
}

export function withinPackage(pkg, path) {
  return path.slice(pkg.length + 1);
}

export function npx(pkg, args) {
  return spawnSync('npx', ['--no-install', ...args], { cwd: pkg, encoding: 'utf8' });
}

export function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}
