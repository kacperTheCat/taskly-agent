import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { create: vi.fn() } }))

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useCreateTodoMutation(), { wrapper }) }
}

it('prepends the saved task and replaces a duplicate in the cached list', async () => {
  const saved = { ...todoFixture, id: 8 }
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { client, result } = setup()
  client.setQueryData(todoKeys.list, [todoFixture, { ...saved, title: 'old' }])
  await act(() => result.current.mutateAsync(todoFixture))
  expect(todosApi.create).toHaveBeenCalledWith(todoFixture)
  expect(client.getQueryData(todoKeys.list)).toEqual([saved, todoFixture])
})

it('creates the list when nothing is cached', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { client, result } = setup()
  await act(() => result.current.mutateAsync(todoFixture))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('keeps the cache and exposes the error when creation fails', async () => {
  vi.mocked(todosApi.create).mockRejectedValue(new Error('Nope'))
  const { client, result } = setup()
  client.setQueryData(todoKeys.list, [todoFixture])
  await act(() => result.current.mutateAsync(todoFixture).catch(() => {}))
  await waitFor(() => expect(result.current.error?.message).toBe('Nope'))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
