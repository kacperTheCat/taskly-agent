// The parts of the PR comment, one function per part.
import { code, number, percent, text } from './markdown.mjs';

const MAX_SKIPPED_LISTED = 20;

// The first matching case explains what happened, including why nothing was committed.
const HEADLINES = [
  [(o) => o.agentOutcome === 'failure', () => 'The agent job failed, so nothing was committed. See the workflow run.'],
  [(o) => !o.context.run, (o) => `Skipped: ${text(o.context.reason)}. No model call, cost $0.`],
  [(o) => o.commitOutcome === 'failure',
    () => 'Publishing stopped: the verified patch failed the trusted checks in the publish job. Nothing was committed.'],
  [(o) => !o.summary?.report,
    (o) => `The agent did not return a report (outcome: ${text(o.summary?.outcome ?? 'not run')}). No tests were changed.`],
  [(o) => !o.verdict, () => 'Verification did not complete, so nothing was committed. See the workflow run.'],
  [(o) => o.push === 'branch-moved',
    () => 'The tests passed verification but were not pushed: the PR branch moved on while the agent ran. The next run will handle the new commits.'],
  [(o) => o.push === 'failed', () => 'The tests passed verification but pushing them to the PR branch failed. See the workflow run.'],
];

export function headline(outcome) {
  const match = HEADLINES.find(([applies]) => applies(outcome));
  return match ? match[1](outcome) : '';
}

// Everything shown once the agent ran and its tests were verified.
export function verifiedSections(summary, verdict, commit) {
  return [
    totals(summary, verdict, commit),
    decisionsTable(summary, verdict),
    rejectedFiles(verdict),
    changedExistingTests(verdict),
    runDetails(summary),
  ];
}

function totals(summary, verdict, commit) {
  const where = commit ? `committed in ${code(commit.slice(0, 7))}` : 'accepted';
  return `**${verdict.accepted.length} test file(s) ${where}**, ${verdict.rejected.length} rejected by verification`
    + ` · tests run ${number(verdict.runs)}x · ${number(summary.turns)} turns · $${number(summary.costUsd, 2)}`;
}

function decisionsTable(summary, verdict) {
  const coverageBySource = new Map(verdict.coverage.map((entry) => [entry.source, entry]));
  const rows = summary.report.files.map((file) => {
    const coverage = coverageBySource.get(file.source);
    const covered = coverage ? `${percent(coverage.before)} → ${percent(coverage.after)}` : 'n/a';
    return `| ${code(file.source)} | ${text(file.decision, 20)} | ${covered} | ${text(file.reason)} |`;
  });
  return ['| Source | Decision | Lines covered | Reason |', '|---|---|---|---|', ...rows].join('\n');
}

function rejectedFiles(verdict) {
  if (verdict.rejected.length === 0) return '';
  const lines = verdict.rejected.map((entry) => `- ${code(entry.file)}: ${text(entry.reason)}`);
  return ['**Rejected by verification**', ...lines].join('\n');
}

function changedExistingTests(verdict) {
  if (verdict.modifiedExisting.length === 0) return '';
  const lines = verdict.modifiedExisting.map((file) => `- ${code(file)}`);
  return ['**Existing test files changed, please review**', ...lines].join('\n');
}

// Tool errors matter: an agent whose test runs were denied reports results it never checked.
function runDetails(summary) {
  const skills = summary.skills.map(code).join(', ') || 'none';
  const errors = summary.toolErrors.length ? `, **${summary.toolErrors.length} tool error(s)**` : '';
  return `<details><summary>Run details</summary>\n\nModel ${text(summary.model, 40)}, skills: ${skills}, ${number(summary.toolCalls)} tool calls${errors}.\n</details>`;
}

export function skippedByPolicy(files) {
  const skipped = files.filter((file) => file.decision === 'skip');
  if (skipped.length === 0) return '';
  const listed = skipped.slice(0, MAX_SKIPPED_LISTED).map((file) => `${code(file.path)} (${text(file.reason, 60)})`);
  const more = skipped.length > MAX_SKIPPED_LISTED ? `, and ${skipped.length - MAX_SKIPPED_LISTED} more` : '';
  return `Not analysed by policy: ${listed.join(', ')}${more}`;
}
