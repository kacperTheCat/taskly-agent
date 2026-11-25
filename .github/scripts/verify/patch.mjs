// Moves the agent's patch in and out of the PR checkout.
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkStructure } from '../validate-patch.mjs';
import { git } from './packages.mjs';

// validate-patch checks paths, modes and test counts, then applies the patch to this checkout.
// A refused patch leaves the checkout as it was.
export function applyPatch(policy, patchFile) {
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

// New files are deleted, changed existing files go back to their committed version.
export function revertFiles(files, modifiedFiles) {
  for (const file of files) {
    if (modifiedFiles.includes(file)) git('checkout', 'HEAD', '--', file);
    else rmSync(file);
  }
}

// The accepted files as one patch; this is what the publish job commits.
export function writePatch(outDir, acceptedFiles) {
  let patch = '';
  if (acceptedFiles.length) {
    git('add', '--intent-to-add', '--', ...acceptedFiles);
    patch = git('diff', '--binary', 'HEAD', '--', ...acceptedFiles);
  }
  writeFileSync(join(outDir, 'verified.patch'), patch);
  return patch;
}
