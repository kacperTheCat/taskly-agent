#!/usr/bin/env node
// Renders the sticky PR comment from the gate context, the agent summary and the verify verdict.
// Free text from the agent is untrusted: it is escaped, length-capped and never rendered as links or mentions.
// Usage: report.mjs --context <json> [--summary <json>] [--verdict <json>] [--commit <sha>] [--run-url <url>]
import { existsSync, readFileSync } from 'node:fs';

export const MARKER = '<!-- test-agent-report -->';

export function text(value, max = 200) {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim();
  return (s.length > max ? `${s.slice(0, max - 1)}…` : s)
    .replace(/[\\`*_[\]<>|#~]/g, (c) => `\\${c}`)
    .replace(/@/g, '@​')
    .replace(/:\/\//g, ':/​/');
}

const pct = (v) => (v == null ? 'n/a' : `${v}%`);
const code = (path) => `\`${String(path).replace(/[`\n]/g, '')}\``;

export function render({ context, summary, verdict, commit, runUrl }) {
  const lines = [MARKER, '### Test agent'];
  if (!context.run) {
    lines.push(`Skipped: ${text(context.reason)}. No model call, cost $0.`);
  } else if (!summary?.report) {
    lines.push(`The agent did not return a report (outcome: ${text(summary?.outcome ?? 'not run')}). No tests were changed.`);
  } else {
    const coverage = new Map((verdict?.coverage ?? []).map((c) => [c.source, c]));
    const accepted = verdict?.accepted ?? [];
    const rejected = verdict?.rejected ?? [];
    lines.push(
      `**${accepted.length} test file(s) ${commit ? `committed in ${code(commit.slice(0, 7))}` : 'accepted'}**, `
        + `${rejected.length} rejected by verification · tests run ${verdict?.runs ?? 0}x · `
        + `${summary.turns ?? '?'} turns · $${(summary.costUsd ?? 0).toFixed(2)}`,
      '',
      '| Source | Decision | Lines covered | Reason |',
      '|---|---|---|---|',
      ...summary.report.files.map((f) => {
        const c = coverage.get(f.source);
        return `| ${code(f.source)} | ${text(f.decision, 20)} | ${c ? `${pct(c.before)} → ${pct(c.after)}` : 'n/a'} | ${text(f.reason)} |`;
      }),
    );
    if (rejected.length) lines.push('', '**Rejected by verification**', ...rejected.map((r) => `- ${code(r.file)}: ${text(r.reason)}`));
    if (verdict?.modifiedExisting?.length) {
      lines.push('', '**Existing test files changed, please review**', ...verdict.modifiedExisting.map((f) => `- ${code(f)}`));
    }
    const skills = (summary.skills ?? []).map((s) => code(s)).join(', ') || 'none';
    lines.push('', `<details><summary>Run details</summary>\n\nModel ${text(summary.model, 40)}, skills: ${skills}, ${summary.toolCalls ?? 0} tool calls.\n</details>`);
  }
  const skips = (context.files ?? []).filter((f) => f.decision === 'skip');
  if (skips.length) lines.push('', `Not analysed by policy: ${skips.map((f) => `${code(f.path)} (${text(f.reason, 60)})`).join(', ')}`);
  if (runUrl) lines.push('', `[Workflow run](${encodeURI(runUrl)})`);
  return `${lines.join('\n')}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
  const json = (name) => { const p = opt(name); return p && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : undefined; };
  process.stdout.write(render({
    context: json('--context'), summary: json('--summary'), verdict: json('--verdict'),
    commit: opt('--commit'), runUrl: opt('--run-url'),
  }));
}
