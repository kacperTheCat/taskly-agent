// Summarises a `claude -p --output-format stream-json` transcript.
import { readFileSync } from 'node:fs';

export function summarize(text) {
  const events = text.split('\n').flatMap((line) => {
    try { return line ? [JSON.parse(line)] : []; } catch { return []; }
  });
  const tools = [];
  const skills = [];
  const toolErrors = [];
  for (const e of events) {
    if (e.type === 'assistant') {
      for (const c of e.message.content) {
        if (c.type !== 'tool_use') continue;
        tools.push(c.name);
        if (c.name === 'Skill') skills.push(c.input.skill ?? c.input.name);
      }
    }
    if (e.type === 'user') {
      for (const c of e.message.content ?? []) {
        if (c.type === 'tool_result' && c.is_error) toolErrors.push(String(c.content?.[0]?.text ?? c.content).slice(0, 160));
      }
    }
  }
  const result = events.find((e) => e.type === 'result') ?? {};
  return {
    outcome: result.subtype ?? 'incomplete',
    turns: result.num_turns ?? null,
    costUsd: result.total_cost_usd ?? null,
    durationMs: result.duration_ms ?? null,
    model: events.find((e) => e.type === 'system')?.model ?? null,
    toolCalls: tools.length,
    skills: [...new Set(skills)],
    toolErrors,
    report: result.structured_output ?? null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarize(readFileSync(process.argv[2], 'utf8')), null, 2));
}
