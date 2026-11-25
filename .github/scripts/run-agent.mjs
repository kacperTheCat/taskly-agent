#!/usr/bin/env node
// The one way to invoke the unit test agent: CI, coverage backfill and evals all go through here.
// Usage: run-agent.mjs <prompt file> <transcript.jsonl> [--model sonnet] [--max-turns 30] [--max-budget-usd 1]
// Prints the run summary (outcome, turns, cost, skills, report) as JSON.
import { spawnSync } from 'node:child_process';
import { openSync, readFileSync } from 'node:fs';
import { summarize } from './transcript.mjs';

const [promptFile, transcriptFile, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => { const i = rest.indexOf(name); return i === -1 ? fallback : rest[i + 1]; };

const args = [
  '-p',
  '--agent', 'unit-test-agent',
  '--model', opt('--model', 'sonnet'),
  '--max-turns', opt('--max-turns', '30'),
  '--settings', '.claude/settings.json',
  '--setting-sources', 'project',
  '--strict-mcp-config',
  '--tools', 'Read,Grep,Glob,Write,Edit,Bash,Skill',
  '--allowedTools', 'Read,Grep,Glob,Write,Edit,Skill,Bash(node .claude/scripts/run-tests.mjs:*)',
  '--disallowedTools', 'WebFetch,WebSearch',
  '--permission-mode', 'dontAsk',
  '--json-schema', readFileSync('.claude/report.schema.json', 'utf8'),
  '--output-format', 'stream-json', '--verbose',
];
const budget = opt('--max-budget-usd');
if (budget) args.push('--max-budget-usd', budget);

const out = openSync(transcriptFile, 'w');
const { status, error } = spawnSync('claude', args, {
  input: readFileSync(promptFile, 'utf8'),
  stdio: ['pipe', out, 'inherit'],
  timeout: 15 * 60_000,
});
if (error) console.error(`claude failed to run: ${error.message}`);
const summary = summarize(readFileSync(transcriptFile, 'utf8'));
console.log(JSON.stringify({ exitCode: status, ...summary }, null, 2));
process.exit(summary.report ? 0 : 1);
