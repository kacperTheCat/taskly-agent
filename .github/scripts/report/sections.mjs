// The parts of the PR comment, one function per part.
import { code, number, percent, text } from './markdown.mjs';

const MAX_SKIPPED_LISTED = 20;

// One line saying what happened, including why nothing was committed when that is the case.
export function headline({ context, summary, verdict, agentOutcome, commitOutcome, push }) {
  if (agentOutcome === 'failure') return 'The agent job failed, so nothing was committed. See the workflow run.';
  if (!context.run) return `Skipped: ${text(context.reason)}. No model call, cost $0.`;
  if (commitOutcome === 'failure') return 'Publishing stopped: the verified patch failed the trusted checks in the publish job. Nothing was committed.';
  if (!summary?.report) return `The agent did not return a report (outcome: ${text(summary?.outcome ?? 'not run')}). No tests were changed.`;
  if (!verdict) return 'Verification did not complete, so nothing was committed. See the workflow run.';
  if (push === 'branch-moved') return 'The tests passed verification but were not pushed: the PR branch moved on while the agent ran. The next run will handle the new commits.';
  if (push === 'failed') return 'The tests passed verification but pushing them to the PR branch failed. See the workflow run.';
  return '';
}

export function totals(summary, verdict, commit) {
  const where = commit ? `committed in ${code(commit.slice(0, 7))}` : 'accepted';
  return `**${verdict.accepted.length} test file(s) ${where}**, ${verdict.rejected.length} rejected by verification`
    + ` · tests run ${number(verdict.runs)}x · ${number(summary.turns)} turns · $${number(summary.costUsd, 2)}`;
}

export function decisionsTable(summary, verdict) {
  const coverageBySource = new Map(verdict.coverage.map((entry) => [entry.source, entry]));
  const rows = summary.report.files.map((file) => {
    const coverage = coverageBySource.get(file.source);
    const covered = coverage ? `${percent(coverage.before)} → ${percent(coverage.after)}` : 'n/a';
    return `| ${code(file.source)} | ${text(file.decision, 20)} | ${covered} | ${text(file.reason)} |`;
  });
  return ['| Source | Decision | Lines covered | Reason |', '|---|---|---|---|', ...rows].join('\n');
}

export function rejectedFiles(verdict) {
  if (verdict.rejected.length === 0) return '';
  const lines = verdict.rejected.map((entry) => `- ${code(entry.file)}: ${text(entry.reason)}`);
  return ['**Rejected by verification**', ...lines].join('\n');
}

export function changedExistingTests(verdict) {
  if (verdict.modifiedExisting.length === 0) return '';
  const lines = verdict.modifiedExisting.map((file) => `- ${code(file)}`);
  return ['**Existing test files changed, please review**', ...lines].join('\n');
}

// Tool errors matter: an agent whose test runs were denied reports results it never checked.
export function runDetails(summary) {
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
