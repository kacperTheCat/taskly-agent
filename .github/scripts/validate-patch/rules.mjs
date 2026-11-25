// What a patch from the agent may and may not do, one rule per line.
import { isWritable } from '../policy.mjs';

export const REGULAR_FILE = '100644';

const TEST_CALL = /\b(?:it|test)(?:\.(?:each\([^)]*\)|only|skip|todo|concurrent))?\s*\(/g;
const FOCUS_OR_SKIP = /\b(?:it|test|describe)\.(?:only|skip|todo|skipIf|runIf|fails)\b|\bx(?:it|describe)\(/g;

// Rules for a `diff --git` section of the patch text: [is broken?, message].
const SECTION_RULES = [
  [(file) => file.oldPath !== file.newPath, 'path change is not allowed'],
  [(file) => file.deleted, 'deleting files is not allowed'],
  [(file) => file.renamedOrCopied, 'renames and copies are not allowed'],
  [(file) => file.binary, 'binary content is not allowed'],
  [(file) => file.oldMode || (file.newMode && file.newMode !== REGULAR_FILE), 'mode changes, symlinks and executables are not allowed'],
  [(file, policy) => !isWritable(policy, file.newPath ?? ''), 'not a writable test path'],
];

// Rules for a file in the applied result: [is broken?, message]. The first broken rule wins.
const TREE_RULES = [
  [(entry) => entry.status !== 'A' && entry.status !== 'M', 'this change type is not allowed'],
  [(entry) => entry.newMode !== REGULAR_FILE, 'only regular, non-executable files are allowed'],
  [(entry, policy) => !isWritable(policy, entry.path), 'not a writable test path'],
];

export function sectionProblems(policy, file) {
  const name = file.newPath ?? file.oldPath ?? '(unnamed file)';
  return SECTION_RULES.filter(([isBroken]) => isBroken(file, policy)).map(([, message]) => `${name}: ${message}`);
}

export function treeProblem(policy, entry) {
  const broken = TREE_RULES.find(([isBroken]) => isBroken(entry, policy));
  return broken && `${entry.path}: ${broken[1]}`;
}

// A changed test file may not lose tests or gain .only/.skip-style markers. Counting calls
// is a heuristic against quietly dropped tests, not proof: a renamed test still counts once.
export function checkContent(before, after, path) {
  const problems = [];
  if (count(after, TEST_CALL) < count(before, TEST_CALL)) problems.push(`${path}: number of tests dropped`);
  if (count(after, FOCUS_OR_SKIP) > count(before, FOCUS_OR_SKIP)) problems.push(`${path}: adds .only/.skip/.todo`);
  return problems;
}

function count(text, pattern) {
  return (text.match(pattern) ?? []).length;
}
