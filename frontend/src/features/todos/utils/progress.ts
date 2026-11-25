import type { Todo } from '../types'

export function describeProgress(todos: Todo[]): string {
  const done = todos.filter((todo) => todo.completed).length
  if (!todos.length) return 'No tasks yet.'
  if (done === todos.length) return `All ${todos.length} tasks done.`
  return `${done} of ${todos.length} tasks done.`
}
