import { afterEach, expect, it, vi } from 'vitest'
import { request } from './http'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

afterEach(() => {
  vi.restoreAllMocks()
})

it('prefixes the path, sends JSON headers and returns the parsed body', async () => {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(json({ ok: true }))
  await expect(
    request('/todos', { method: 'POST', headers: { 'X-Test': '1' } }),
  ).resolves.toEqual({ ok: true })
  expect(fetchSpy).toHaveBeenCalledWith('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test': '1' },
  })
})

it('returns undefined for 204 responses', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, { status: 204 }),
  )
  await expect(request('/todos/1')).resolves.toBeUndefined()
})

it('throws a connection error when fetch rejects', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('boom'))
  await expect(request('/todos')).rejects.toThrow(
    'Cannot connect to the server. Please try again.',
  )
})

it('rethrows the original error when the request was aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const abortError = new DOMException('Aborted', 'AbortError')
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError)
  await expect(
    request('/todos', { signal: controller.signal }),
  ).rejects.toBe(abortError)
})

it('throws a validation message for 422 responses', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    json({ detail: 'ignored' }, 422),
  )
  await expect(request('/todos')).rejects.toThrow(/Check the task details/)
})

it('throws the server detail for other error responses', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    json({ detail: 'Todo not found' }, 404),
  )
  await expect(request('/todos/1')).rejects.toThrow('Todo not found')
})

it('throws a generic message when the error body has no usable detail', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response('not json', { status: 500 }),
  )
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    json({ detail: { x: 1 } }, 400),
  )
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})
