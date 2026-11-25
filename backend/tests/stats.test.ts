import { it, expect } from 'vitest';
import { summarizeTodos } from '../src/features/todos/stats.ts';

it('counts total, completed and active tasks', () => {
  expect(summarizeTodos([{ completed: true }, { completed: false }, { completed: false }])).toEqual({ total: 3, completed: 1, active: 2 });
});
it('returns zeros for an empty list', () => {
  expect(summarizeTodos([])).toEqual({ total: 0, completed: 0, active: 0 });
});
