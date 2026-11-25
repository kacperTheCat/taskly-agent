import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { update: vi.fn() } }))

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useUpdateTodoMutation(), { wrapper }) }
}

it('replaces only the updated task in the cached list', async () => {
  const other = { ...todoFixture, id: 8 }
  const saved = { ...todoFixture, completed: true }
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { client, result } = setup()
  client.setQueryData(todoKeys.list, [todoFixture, other])
  await act(() =>
    result.current.mutateAsync({ id: todoFixture.id, input: { completed: true } }),
  )
  expect(todosApi.update).toHaveBeenCalledWith(todoFixture.id, { completed: true })
  expect(client.getQueryData(todoKeys.list)).toEqual([saved, other])
})

it('leaves an empty cache untouched', async () => {
  vi.mocked(todosApi.update).mockResolvedValue(todoFixture)
  const { client, result } = setup()
  await act(() => result.current.mutateAsync({ id: todoFixture.id, input: {} }))
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('keeps the cache and exposes the error when the update fails', async () => {
  vi.mocked(todosApi.update).mockRejectedValue(new Error('Nope'))
  const { client, result } = setup()
  client.setQueryData(todoKeys.list, [todoFixture])
  await act(() =>
    result.current.mutateAsync({ id: todoFixture.id, input: {} }).catch(() => {}),
  )
  await waitFor(() => expect(result.current.error?.message).toBe('Nope'))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
