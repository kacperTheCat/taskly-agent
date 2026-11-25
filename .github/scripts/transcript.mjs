#!/usr/bin/env node
// Summarises a `claude -p --output-format stream-json` transcript: outcome, turns, cost,
// skills used, shell commands, tool errors and the structured report. Tolerates a cut-off last line.
//
// Usage: transcript.mjs <transcript.jsonl>   prints the summary as JSON
//        transcript.mjs --log <summary.json> prints the commands and tool errors, one per line
import { readFileSync } from 'node:fs';
import { isMain, readArgs } from './cli.mjs';

if (isMain(import.meta.url)) {
  const args = readArgs({
    usage: 'transcript.mjs <transcript.jsonl> | transcript.mjs --log <summary.json>',
    options: { log: { type: 'string' } },
  });
  if (args.log) printLog(readJson(args.log));
  else if (args.positionals[0]) console.log(JSON.stringify(summarize(readFileSync(args.positionals[0], 'utf8')), null, 2));
}

export function summarize(transcript) {
  const events = parseLines(transcript);
  const toolUses = contentBlocks(events, 'assistant', 'tool_use');
  const failedResults = contentBlocks(events, 'user', 'tool_result').filter((block) => block.is_error);
  const result = events.find((event) => event.type === 'result') ?? {};

  return {
    ...resultFields(result),
    model: events.find((event) => event.type === 'system')?.model ?? null,
    toolCalls: toolUses.length,
    skills: [...new Set(toolUses.filter((use) => use.name === 'Skill').map((use) => use.input?.skill ?? use.input?.name))],
    commands: toolUses.filter((use) => use.name === 'Bash').map((use) => String(use.input?.command ?? '').slice(0, 200)),
    toolErrors: failedResults.map((block) => errorText(block).slice(0, 160)),
  };
}

// The content blocks of one type (tool_use, tool_result) from messages of one role.
function contentBlocks(events, role, blockType) {
  return events
    .filter((event) => event.type === role)
    .flatMap((event) => event.message?.content ?? [])
    .filter((block) => block.type === blockType);
}

// The final `result` event carries the outcome, usage and the structured report.
function resultFields(result) {
  return {
    outcome: result.subtype ?? 'incomplete',
    turns: result.num_turns ?? null,
    costUsd: result.total_cost_usd ?? null,
    durationMs: result.duration_ms ?? null,
    report: result.structured_output ?? null,
  };
}

// Commands and tool errors explain a run that produced nothing, so CI prints them. They are
// agent-controlled, so each is printed as a JSON string: a newline cannot start a
// `::workflow-command::` line in the job log.
function printLog(summary) {
  for (const command of summary?.commands ?? []) console.log(`command: ${JSON.stringify(command)}`);
  for (const error of summary?.toolErrors ?? []) console.log(`tool error: ${JSON.stringify(error)}`);
}

function parseLines(transcript) {
  const events = [];
  for (const line of transcript.split('\n')) {
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // a run stopped by a timeout can end mid-line
    }
  }
  return events;
}

function errorText(block) {
  if (typeof block.content === 'string') return block.content;
  return String(block.content?.[0]?.text ?? '');
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}
