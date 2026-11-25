#!/usr/bin/env node
// Writes the test agent's PR comment (Markdown) from three JSON inputs: the gate decision
// (context), the agent's run summary and the verify verdict. Runs in the `publish` job.
// Everything the agent wrote is untrusted, so it passes through `text()` before it is shown.
//
// Usage: report.mjs --context <json> [--summary <json>] [--verdict <json>] [--commit <sha>]
//                   [--publish <step outcome>] [--pushed true|false] [--run-url <url>]
// --publish is the outcome of the trusted validation and commit; --pushed says whether the
// commit reached the PR branch.
import { readFileSync } from 'node:fs';
import { isMain, readArgs } from './cli.mjs';

export const MARKER = '<!-- test-agent-report -->';
const ZERO_WIDTH_SPACE = '\u200B';
const MAX_SKIPPED_LISTED = 20;

if (isMain(import.meta.url)) {
  process.stdout.write(render(readInputs()));
}

export function render({ context, summary, verdict, commit, publish, pushed, runUrl }) {
  const sections = [MARKER, '### Test agent', headline({ context, summary, verdict, publish, pushed })];

  const ranAndVerified = context.run && publish !== 'failure' && summary?.report && verdict;
  if (ranAndVerified) sections.push(...results(summary, verdict, commit));

  sections.push(skippedByPolicy(context.files ?? []));
  if (runUrl) sections.push(`[Workflow run](${encodeURI(runUrl)})`);
  return `${sections.filter(Boolean).join('\n\n')}\n`;
}

// One line saying what happened, including why nothing was committed when that is the case.
function headline({ context, summary, verdict, publish, pushed }) {
  if (!context.run) return `Skipped: ${text(context.reason)}. No model call, cost $0.`;
  if (publish === 'failure') return 'Publishing stopped: the patch failed the trusted validation in the publish job. Nothing was committed.';
  if (!summary?.report) return `The agent did not return a report (outcome: ${text(summary?.outcome ?? 'not run')}). No tests were changed.`;
  if (!verdict) return 'Verification did not complete, so nothing was committed. See the workflow run.';
  if (verdict.accepted?.length && pushed === 'false') {
    return 'The tests passed verification but were not pushed: the PR branch moved on while the agent ran. The next run will handle the new commits.';
  }
  return '';
}

function results(summary, verdict, commit) {
  const where = commit ? `committed in ${code(commit.slice(0, 7))}` : 'accepted';
  const totals = `**${verdict.accepted.length} test file(s) ${where}**, ${verdict.rejected.length} rejected by verification`
    + ` · tests run ${verdict.runs}x · ${summary.turns ?? '?'} turns · $${(summary.costUsd ?? 0).toFixed(2)}`;

  const coverageBySource = new Map(verdict.coverage.map((entry) => [entry.source, entry]));
  const rows = summary.report.files.map((file) => {
    const coverage = coverageBySource.get(file.source);
    const covered = coverage ? `${percent(coverage.before)} → ${percent(coverage.after)}` : 'n/a';
    return `| ${code(file.source)} | ${text(file.decision, 20)} | ${covered} | ${text(file.reason)} |`;
  });
  const table = ['| Source | Decision | Lines covered | Reason |', '|---|---|---|---|', ...rows].join('\n');

  const sections = [totals, table];
  if (verdict.rejected.length) {
    sections.push(['**Rejected by verification**', ...verdict.rejected.map((r) => `- ${code(r.file)}: ${text(r.reason)}`)].join('\n'));
  }
  if (verdict.modifiedExisting.length) {
    sections.push(['**Existing test files changed, please review**', ...verdict.modifiedExisting.map((f) => `- ${code(f)}`)].join('\n'));
  }
  const skills = (summary.skills ?? []).map(code).join(', ') || 'none';
  sections.push(`<details><summary>Run details</summary>\n\nModel ${text(summary.model, 40)}, skills: ${skills}, ${summary.toolCalls ?? 0} tool calls.\n</details>`);
  return sections;
}

function skippedByPolicy(files) {
  const skipped = files.filter((file) => file.decision === 'skip');
  if (skipped.length === 0) return '';
  const listed = skipped.slice(0, MAX_SKIPPED_LISTED).map((file) => `${code(file.path)} (${text(file.reason, 60)})`);
  const more = skipped.length > MAX_SKIPPED_LISTED ? `, and ${skipped.length - MAX_SKIPPED_LISTED} more` : '';
  return `Not analysed by policy: ${listed.join(', ')}${more}`;
}

// Untrusted text: one line, length-capped, Markdown escaped, no @mentions and no autolinks.
export function text(value, max = 200) {
  const oneLine = String(value ?? '').replace(/\s+/g, ' ').trim();
  const capped = oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
  return capped
    .replace(/[\\`*_[\]<>|#~]/g, (char) => `\\${char}`)
    .replace(/@/g, `@${ZERO_WIDTH_SPACE}`)
    .replace(/:\/\//g, `:/${ZERO_WIDTH_SPACE}/`)
    .replace(/\bwww\./gi, `www${ZERO_WIDTH_SPACE}.`);
}

// Inline code cannot be escaped, so characters that would end it or split a table row are dropped.
function code(path) {
  return `\`${String(path).replace(/[`|\n]/g, '')}\``;
}

function percent(value) {
  return value == null ? 'n/a' : `${value}%`;
}

function readInputs() {
  const args = readArgs({
    usage: 'report.mjs --context <json> [--summary <json>] [--verdict <json>] [--commit <sha>] [--publish <outcome>] [--pushed true|false] [--run-url <url>]',
    options: Object.fromEntries(
      ['context', 'summary', 'verdict', 'commit', 'publish', 'pushed', 'run-url'].map((name) => [name, { type: 'string' }]),
    ),
  });
  return {
    context: readJson(args.context) ?? { run: false, reason: 'gate result missing' },
    summary: readJson(args.summary),
    verdict: readJson(args.verdict),
    commit: args.commit || undefined,
    publish: args.publish,
    pushed: args.pushed,
    runUrl: args['run-url'],
  };
}

// A missing or unreadable input is not an error: the headline explains what is absent.
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}
