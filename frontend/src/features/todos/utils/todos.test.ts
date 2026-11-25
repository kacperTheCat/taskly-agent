import { afterEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { formatDate, isOverdue, selectTodos, validateTodo } from './todos'

afterEach(() => vi.useRealTimers())

const input = { title: 'Task', description: '', priority: 'medium' as const, due_date: null, completed: false }

it('accepts a valid task', () => {
  expect(validateTodo({ ...input, due_date: '2026-10-15' })).toEqual({})
})

it.each([
  [{ title: '   ' }, { title: 'Enter a task title.' }],
  [{ title: 'x'.repeat(121) }, { title: 'The title must be at most 120 characters.' }],
  [{ description: 'x'.repeat(2001) }, { description: 'The description must be at most 2000 characters.' }],
  [{ due_date: '2026-02-30' }, { due_date: 'Enter a valid date.' }],
  [{ due_date: 'tomorrow' }, { due_date: 'Enter a valid date.' }],
])('validates %j', (override, errors) => {
  expect(validateTodo({ ...input, ...override })).toEqual(errors)
})

const make = (id: number, override = {}) => ({ ...todoFixture, id, ...override })

it('filters by status and case-insensitive search in title and description', () => {
  const todos = [
    make(1, { title: 'Buy Milk', completed: true }),
    make(2, { title: 'Walk', description: 'with MILK' }),
    make(3, { title: 'Other' }),
  ]
  expect(selectTodos(todos, 'all', ' milk ', 'newest').map((t) => t.id)).toEqual([2, 1])
  expect(selectTodos(todos, 'completed', '', 'newest').map((t) => t.id)).toEqual([1])
  expect(selectTodos(todos, 'active', '', 'newest').map((t) => t.id)).toEqual([3, 2])
  expect(selectTodos(todos, 'active', 'milk', 'newest').map((t) => t.id)).toEqual([2])
})

it('sorts by priority then newest id', () => {
  const todos = [
    make(1, { priority: 'low' }),
    make(2, { priority: 'high' }),
    make(3, { priority: 'high' }),
    make(4, { priority: 'medium' }),
  ]
  expect(selectTodos(todos, 'all', '', 'priority').map((t) => t.id)).toEqual([3, 2, 4, 1])
})

it('sorts by due date with undated tasks last', () => {
  const todos = [
    make(1, { due_date: '2026-10-01' }),
    make(2, { due_date: '2026-11-01' }),
    make(3, { due_date: null }),
    make(4, { due_date: '2026-10-01' }),
  ]
  expect(selectTodos(todos, 'all', '', 'due').map((t) => t.id)).toEqual([4, 1, 2, 3])
})

it('sorts by creation time then id and does not mutate the input', () => {
  const todos = [
    make(1, { created_at: '2026-10-01T12:00:00Z' }),
    make(2, { created_at: '2026-10-02T12:00:00Z' }),
    make(3, { created_at: '2026-10-01T12:00:00Z' }),
  ]
  expect(selectTodos(todos, 'all', '', 'newest').map((t) => t.id)).toEqual([2, 3, 1])
  expect(todos.map((t) => t.id)).toEqual([1, 2, 3])
})

it.each([
  ['2026-10-14', false, true],
  ['2026-10-15', false, false],
  ['2026-10-14', true, false],
  [null, false, false],
])('isOverdue for due %s completed=%s is %s', (due_date, completed, expected) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 15, 10))
  expect(isOverdue(make(1, { due_date, completed }))).toBe(expected)
})

it('formats a date in en-GB style', () => {
  expect(formatDate('2026-10-05')).toBe('5 Oct 2026')
})
