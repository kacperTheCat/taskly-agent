import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useTodoFilters } from './useTodoFilters'

const todos = [
  { ...todoFixture, id: 1, title: 'Alpha', completed: true, priority: 'high' as const },
  { ...todoFixture, id: 2, title: 'Beta', priority: 'low' as const },
]

it('starts with all tasks, newest first', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  expect(result.current).toMatchObject({ filter: 'all', search: '', sort: 'newest' })
  expect(result.current.visible.map((t) => t.id)).toEqual([2, 1])
})

it('recomputes the visible tasks when filter, search or sort change', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setFilter('completed'))
  expect(result.current.visible.map((t) => t.id)).toEqual([1])
  act(() => result.current.setFilter('all'))
  act(() => result.current.setSearch('beta'))
  expect(result.current.visible.map((t) => t.id)).toEqual([2])
  act(() => result.current.setSearch(''))
  act(() => result.current.setSort('priority'))
  expect(result.current.sort).toBe('priority')
  expect(result.current.visible.map((t) => t.id)).toEqual([1, 2])
})
