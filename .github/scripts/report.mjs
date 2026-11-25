#!/usr/bin/env node
// Writes the test agent's PR comment (Markdown) from the gate decision (context), the agent's
// run summary and the verify verdict. Runs in the `publish` job.
//
// Usage: report.mjs --context <json> [--summary <json>] [--verdict <json>] [--commit <sha>]
//                   [--agent-outcome <job result>] [--commit-outcome <step outcome>]
//                   [--push pushed|branch-moved|failed] [--run-url <url>]
import { isMain } from './cli.mjs';
import { normalizeSummary, normalizeVerdict, readInputs } from './report/inputs.mjs';
import {
  changedExistingTests, decisionsTable, headline, rejectedFiles, runDetails, skippedByPolicy, totals,
} from './report/sections.mjs';

export const MARKER = '<!-- test-agent-report -->';

if (isMain(import.meta.url)) {
  process.stdout.write(render(readInputs()));
}

export function render(inputs) {
  const summary = normalizeSummary(inputs.summary);
  const verdict = normalizeVerdict(inputs.verdict);
  const { context, commit, commitOutcome, runUrl } = inputs;
  const verified = context.run && commitOutcome !== 'failure' && summary?.report && verdict;

  const sections = [
    MARKER,
    '### Test agent',
    headline({ ...inputs, summary, verdict }),
    verified && totals(summary, verdict, commit),
    verified && decisionsTable(summary, verdict),
    verified && rejectedFiles(verdict),
    verified && changedExistingTests(verdict),
    verified && runDetails(summary),
    skippedByPolicy(context.files ?? []),
    runUrl && `[Workflow run](${encodeURI(runUrl)})`,
  ];
  return `${sections.filter(Boolean).join('\n\n')}\n`;
}
