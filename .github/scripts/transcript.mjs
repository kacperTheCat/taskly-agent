#!/usr/bin/env node
// Summarises a `claude -p --output-format stream-json` transcript: outcome, turns, cost,
// skills used, shell commands, tool errors and the structured report. Tolerates a cut-off last line.
//
// Usage: transcript.mjs <transcript.jsonl>
import { readFileSync } from 'node:fs';
import { isMain } from './cli.mjs';

if (isMain(import.meta.url)) {
  console.log(JSON.stringify(summarize(readFileSync(process.argv[2], 'utf8')), null, 2));
}

export function summarize(transcript) {
  const events = parseLines(transcript);
  const toolCalls = [];
  const skills = new Set();
  const commands = [];
  const toolErrors = [];

  for (const event of events) {
    for (const block of event.message?.content ?? []) {
      if (event.type === 'assistant' && block.type === 'tool_use') {
        toolCalls.push(block.name);
        if (block.name === 'Skill') skills.add(block.input?.skill ?? block.input?.name);
        if (block.name === 'Bash') commands.push(String(block.input?.command ?? '').slice(0, 200));
      }
      if (event.type === 'user' && block.type === 'tool_result' && block.is_error) {
        toolErrors.push(errorText(block).slice(0, 160));
      }
    }
  }

  const result = events.find((event) => event.type === 'result') ?? {};
  return {
    outcome: result.subtype ?? 'incomplete',
    turns: result.num_turns ?? null,
    costUsd: result.total_cost_usd ?? null,
    durationMs: result.duration_ms ?? null,
    model: events.find((event) => event.type === 'system')?.model ?? null,
    toolCalls: toolCalls.length,
    skills: [...skills],
    commands,
    toolErrors,
    report: result.structured_output ?? null,
  };
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
