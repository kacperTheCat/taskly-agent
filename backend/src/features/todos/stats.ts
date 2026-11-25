import type { Todo } from './types.js';

export interface TodoStats {
  total: number;
  completed: number;
  active: number;
}

export function summarizeTodos(todos: Pick<Todo, 'completed'>[]): TodoStats {
  const completed = todos.filter((todo) => todo.completed).length;
  return { total: todos.length, completed, active: todos.length - completed };
}
