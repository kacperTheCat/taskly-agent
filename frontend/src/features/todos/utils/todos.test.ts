import { afterEach, describe, expect, it, vi } from 'vitest'
import { selectTodos, summarizeTodos } from './todos'
import type { Todo } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

describe('summarizeTodos', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts completed, active and overdue todos', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    const todos: Todo[] = [
      { ...base, id: 1, due_date: '2026-10-01' },
      { ...base, id: 2, due_date: '2026-10-01', completed: true },
      { ...base, id: 3, completed: true },
      { ...base, id: 4, due_date: '2026-12-01' },
    ]
    expect(summarizeTodos(todos)).toEqual({
      total: 4,
      completed: 2,
      active: 2,
      overdue: 1,
    })
  })

  it('returns zeros for an empty list', () => {
    expect(summarizeTodos([])).toEqual({
      total: 0,
      completed: 0,
      active: 0,
      overdue: 0,
    })
  })
})

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })
})
