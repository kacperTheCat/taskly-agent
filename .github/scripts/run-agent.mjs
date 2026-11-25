#!/usr/bin/env node
// The one way to start the unit test agent. CI, coverage backfill and evals all use it,
// so the tool allowlist, permission mode and limits below are the same everywhere.
//
// Usage: run-agent.mjs <prompt file> <transcript.jsonl> [--model sonnet] [--max-turns 30] [--max-budget-usd 1]
// Prints the run summary (outcome, turns, cost, skills, report) as JSON; exits 1 without a report.
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { isMain, readArgs } from './cli.mjs';
import { summarize } from './transcript.mjs';

// Leaves room for installs inside the CI job's 20-minute limit, so the summary is always written.
const TIMEOUT_MS = 12 * 60_000;

if (isMain(import.meta.url)) main();

function main() {
  const args = readArgs({
    usage: 'run-agent.mjs <prompt file> <transcript.jsonl> [--model m] [--max-turns n] [--max-budget-usd x]',
    positionals: 2,
    options: {
      model: { type: 'string', default: 'sonnet' },
      'max-turns': { type: 'string', default: '30' },
      'max-budget-usd': { type: 'string' },
    },
  });
  const [promptFile, transcriptFile] = args.positionals;

  const claudeArgs = [
    '-p',
    '--agent', 'unit-test-agent',
    '--model', args.model,
    '--max-turns', args['max-turns'],
    // Project settings carry the write-guard hook and deny rules. The allowlist is passed here
    // because Claude Code ignores a project's allow rules in a workspace it has not trusted.
    '--settings', '.claude/settings.json',
    '--setting-sources', 'project',
    '--strict-mcp-config',
    '--tools', 'Read,Grep,Glob,Write,Edit,Bash,Skill',
    '--allowedTools', 'Read,Grep,Glob,Write,Edit,Skill,Bash(node .claude/scripts/run-tests.mjs:*)',
    '--disallowedTools', 'WebFetch,WebSearch',
    '--permission-mode', 'dontAsk',
    '--json-schema', readFileSync('.claude/report.schema.json', 'utf8'),
    '--output-format', 'stream-json',
    '--verbose',
  ];
  if (args['max-budget-usd']) claudeArgs.push('--max-budget-usd', args['max-budget-usd']);

  const transcript = openSync(transcriptFile, 'w');
  const { status, error } = spawnSync('claude', claudeArgs, {
    input: readFileSync(promptFile, 'utf8'),
    stdio: ['pipe', transcript, 'inherit'],
    timeout: TIMEOUT_MS,
  });
  closeSync(transcript);
  if (error) console.error(`claude failed to run: ${error.message}`);

  const summary = summarize(readFileSync(transcriptFile, 'utf8'));
  console.log(JSON.stringify({ exitCode: status, ...summary }, null, 2));
  process.exit(summary.report ? 0 : 1);
}
