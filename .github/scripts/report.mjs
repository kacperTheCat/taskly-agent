#!/usr/bin/env node
// Writes the test agent's PR comment (Markdown) from the gate decision (context), the agent's
// run summary and the verify verdict. Runs in the `publish` job.
//
// Usage: report.mjs --context <json> [--summary <json>] [--verdict <json>] [--commit <sha>]
//                   [--agent-outcome <job result>] [--commit-outcome <step outcome>]
//                   [--push pushed|branch-moved|failed] [--run-url <url>]
import { isMain } from './cli.mjs';
import { normalizeSummary, normalizeVerdict, readInputs } from './report/inputs.mjs';
import { headline, skippedByPolicy, verifiedSections } from './report/sections.mjs';

export const MARKER = '<!-- test-agent-report -->';

if (isMain(import.meta.url)) {
  process.stdout.write(renderSafely(readInputs()));
}

// Inputs come from jobs that ran untrusted code. If they break rendering in a way the
// normalisers did not foresee, the PR still gets a comment that points to the run.
export function renderSafely(inputs) {
  try {
    return render(inputs);
  } catch {
    const link = inputs.runUrl ? ` See the [workflow run](${encodeURI(inputs.runUrl)}).` : '';
    return `${MARKER}\n\n### Test agent\n\nThe report could not be built from this run's outputs.${link}\n`;
  }
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
    ...(verified ? verifiedSections(summary, verdict, commit) : []),
    skippedByPolicy(context.files ?? []),
    runUrl && `[Workflow run](${encodeURI(runUrl)})`,
  ];
  return `${sections.filter(Boolean).join('\n\n')}\n`;
}
