#!/usr/bin/env node
// A minimal eval set for the unit test agent: each case makes one small source change and
// names the decision the agent should report for it. Run by hand; it calls the model.
//
// Usage: evals.mjs [--max-turns 30]
// Each case runs in a throwaway worktree of HEAD, through the same run-agent.mjs as CI.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isMain, readArgs } from './cli.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
// Installed and generated folders the tests need; git does not track them.
const SHARED_FOLDERS = ['backend/node_modules', 'backend/src/generated', 'frontend/node_modules'];

if (isMain(import.meta.url)) {
  const args = readArgs({ usage: 'evals.mjs [--max-turns n]', options: { 'max-turns': { type: 'string', default: '30' } } });
  const cases = JSON.parse(readFileSync(join(ROOT, '.github/evals/cases.json'), 'utf8'));
  const results = cases.map((evalCase) => runCase(evalCase, args['max-turns']));
  console.log(formatTable(results));
  process.exit(results.every((result) => result.pass) ? 0 : 1);
}

function runCase(evalCase, maxTurns) {
  const dir = join(mkdtempSync(join(tmpdir(), 'agent-eval-')), 'repo');
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  execFileSync('git', ['worktree', 'add', '--quiet', '--detach', dir, 'HEAD'], { cwd: ROOT });
  try {
    for (const folder of SHARED_FOLDERS) symlinkSync(join(ROOT, folder), join(dir, folder));
    applyChange(dir, evalCase);
    git('-c', 'user.name=eval', '-c', 'user.email=eval@example.invalid', 'commit', '--quiet', '-am', evalCase.name);
    return judge(evalCase, runAgent(dir, maxTurns));
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT });
  }
}

function applyChange(dir, { file, find, replace }) {
  const path = join(dir, file);
  const source = readFileSync(path, 'utf8');
  if (!source.includes(find)) throw new Error(`${file}: text to replace not found`);
  writeFileSync(path, source.replace(find, replace));
}

// The same steps as the workflow's agent job: classify the change, then run the agent on its prompt.
function runAgent(dir, maxTurns) {
  const node = (...args) => spawnSync('node', args, { cwd: dir, encoding: 'utf8' });
  const context = JSON.parse(node('.github/scripts/changed-files.mjs', '--base', 'HEAD~1').stdout);
  writeFileSync(join(dir, 'prompt.txt'), context.prompt);
  const run = node('.github/scripts/run-agent.mjs', 'prompt.txt', 'transcript.jsonl', '--max-turns', maxTurns);
  return JSON.parse(run.stdout || '{}');
}

export function judge(evalCase, summary) {
  const entry = summary.report?.files?.find((file) => file.source === evalCase.file);
  const actual = entry?.decision ?? 'no report';
  return {
    name: evalCase.name,
    expected: evalCase.expect.join(' or '),
    actual,
    pass: evalCase.expect.includes(actual),
    turns: summary.turns,
    cost: summary.costUsd,
  };
}

function formatTable(results) {
  const rows = results.map(({ name, expected, actual, pass, turns, cost }) =>
    `| ${name} | ${expected} | ${actual} | ${pass ? 'pass' : 'FAIL'} | ${turns ?? '-'} | ${cost == null ? '-' : `$${cost.toFixed(2)}`} |`);
  return ['| Case | Expected | Agent decided | Result | Turns | Cost |', '|---|---|---|---|---|---|', ...rows].join('\n');
}
