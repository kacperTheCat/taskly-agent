// Reads the report's inputs. The summary and verdict come from jobs that ran untrusted code,
// so a missing file or broken JSON is "absent" and a wrong shape becomes empty lists, never a crash.
import { readFileSync } from 'node:fs';
import { readArgs } from '../cli.mjs';

const OPTIONS = ['context', 'summary', 'verdict', 'commit', 'agent-outcome', 'commit-outcome', 'push', 'run-url'];

export function readInputs() {
  const args = readArgs({
    usage: `report.mjs ${OPTIONS.map((name) => `[--${name} <value>]`).join(' ')}`,
    options: Object.fromEntries(OPTIONS.map((name) => [name, { type: 'string' }])),
  });
  return {
    context: readJson(args.context) ?? { run: false, reason: 'gate result missing' },
    summary: readJson(args.summary),
    verdict: readJson(args.verdict),
    commit: args.commit || undefined,
    agentOutcome: args['agent-outcome'],
    commitOutcome: args['commit-outcome'],
    push: args.push,
    runUrl: args['run-url'],
  };
}

export function normalizeSummary(summary) {
  if (!summary) return undefined;
  return {
    ...summary,
    skills: list(summary.skills),
    toolErrors: list(summary.toolErrors),
    report: summary.report ? { files: list(summary.report.files) } : null,
  };
}

export function normalizeVerdict(verdict) {
  if (!verdict) return undefined;
  return {
    accepted: list(verdict.accepted),
    rejected: list(verdict.rejected),
    modifiedExisting: list(verdict.modifiedExisting),
    coverage: list(verdict.coverage),
    runs: verdict.runs,
  };
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}
