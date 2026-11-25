// Reads .claude/test-policy.json and answers the two questions everything else asks:
// may the agent write this path, and should this changed file be tested?
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const POLICY_FILE = fileURLToPath(new URL('../../.claude/test-policy.json', import.meta.url));

export function loadPolicy(path = POLICY_FILE) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function isWritable(policy, path) {
  const normalized = normalize(path);
  const segments = normalized.split('/');
  if (/[\0-\x1f]/.test(normalized)) return false;
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return false;
  // A file name starting with a dot (".test.ts") would match the globs but is not a real test file.
  if (segments.at(-1).startsWith('.')) return false;
  return policy.writable.some((glob) => matches(normalized, glob));
}

export function classify(policy, path) {
  const normalized = normalize(path);
  const owner = Object.entries(policy.packages).find(([, config]) => matches(normalized, config.source));
  if (!owner) return { path: normalized, decision: 'ignored', reason: 'not application source' };

  const [name, config] = owner;
  const skip = policy.skip.find((rule) => matches(normalized, rule.glob));
  if (skip) return { path: normalized, package: name, decision: 'skip', reason: skip.reason };
  return { path: normalized, package: name, decision: 'candidate', skill: config.skill, tests: config.tests };
}

export function matches(path, glob) {
  return globToRegExp(glob).test(path);
}

// Supports what the policy file uses: `**/` (any directories), `*` (within one segment)
// and `{a,b}` (alternatives). Everything else is matched literally.
const GLOB_TOKEN = /\*\*\/|\*\*|\*|[{},]|[^*{},]+/g;
const WILDCARDS = { '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*' };

export function globToRegExp(glob) {
  let braceDepth = 0;
  const pattern = glob.replace(GLOB_TOKEN, (token) => {
    if (WILDCARDS[token]) return WILDCARDS[token];
    if (token === '{') {
      braceDepth++;
      return '(?:';
    }
    if (token === '}' && braceDepth > 0) {
      braceDepth--;
      return ')';
    }
    if (token === ',' && braceDepth > 0) return '|';
    return token.replace(/[.+?^$(){}|[\]\\,]/g, '\\$&');
  });
  return new RegExp(`^${pattern}$`);
}

function normalize(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}
