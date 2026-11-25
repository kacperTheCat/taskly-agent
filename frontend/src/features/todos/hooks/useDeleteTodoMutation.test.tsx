import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { remove: vi.fn() } }))

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useDeleteTodoMutation(), { wrapper }) }
}

it('removes the deleted task from the cached list', async () => {
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { client, result } = setup()
  client.setQueryData(todoKeys.list, [todoFixture, { ...todoFixture, id: 8 }])
  await act(() => result.current.mutateAsync(todoFixture.id))
  expect(todosApi.remove).toHaveBeenCalledWith(todoFixture.id)
  expect(client.getQueryData(todoKeys.list)).toEqual([{ ...todoFixture, id: 8 }])
})

it('leaves an empty cache untouched', async () => {
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { client, result } = setup()
  await act(() => result.current.mutateAsync(todoFixture.id))
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('keeps the cache and exposes the error when deletion fails', async () => {
  vi.mocked(todosApi.remove).mockRejectedValue(new Error('Nope'))
  const { client, result } = setup()
  client.setQueryData(todoKeys.list, [todoFixture])
  await act(() => result.current.mutateAsync(todoFixture.id).catch(() => {}))
  await waitFor(() => expect(result.current.error?.message).toBe('Nope'))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
