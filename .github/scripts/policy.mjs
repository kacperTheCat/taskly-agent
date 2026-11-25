import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const defaultPath = fileURLToPath(new URL('../../.claude/test-policy.json', import.meta.url));

export function loadPolicy(path = defaultPath) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Minimal glob: `**/` (any directories), `*` (within a segment), `{a,b}` (alternatives).
export function globToRegExp(glob) {
  let re = '';
  let depth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (glob.startsWith('**/', i)) { re += '(?:.*/)?'; i += 2; }
    else if (glob.startsWith('**', i)) { re += '.*'; i += 1; }
    else if (c === '*') re += '[^/]*';
    else if (c === '{') { re += '(?:'; depth++; }
    else if (c === '}' && depth) { re += ')'; depth--; }
    else if (c === ',' && depth) re += '|';
    else re += c.replace(/[.+?^$(){}|[\]\\,]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export const matches = (path, glob) => globToRegExp(glob).test(path);

export function isWritable(policy, path) {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  const segments = normalized.split('/');
  if (/[\0-\x1f]/.test(normalized) || segments.some((s) => s === '' || s === '.' || s === '..')) return false;
  if (segments.at(-1).startsWith('.')) return false;
  return policy.writable.some((glob) => matches(normalized, glob));
}

export function classify(policy, path) {
  const pkg = Object.entries(policy.packages).find(([, p]) => matches(path, p.source));
  if (!pkg) return { path, decision: 'ignored', reason: 'not application source' };
  const skip = policy.skip.find((s) => matches(path, s.glob));
  if (skip) return { path, package: pkg[0], decision: 'skip', reason: skip.reason };
  return { path, package: pkg[0], decision: 'candidate', skill: pkg[1].skill, tests: pkg[1].tests };
}
