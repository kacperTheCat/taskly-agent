import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { useNotice } from '../../hooks/useNotice'
import { todoFixture } from '../../test/todoFixture'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { TodosPage } from './TodosPage'
import type { Todo } from './types'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: ({
    disabled,
    onCreate,
  }: {
    disabled: boolean
    onCreate: () => void
  }) => (
    <button disabled={disabled} onClick={onCreate}>
      New task
    </button>
  ),
}))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: () => null }))
vi.mock('./components/TodoList', () => ({
  TodoList: ({
    todos,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todos: Todo[]
    onToggle: (todo: Todo) => void
    onEdit: (todo: Todo) => void
    onDelete: (todo: Todo) => void
  }) => (
    <div>
      <button onClick={() => onToggle(todos[0])}>toggle</button>
      <button onClick={() => onEdit(todos[0])}>edit</button>
      <button onClick={() => onDelete(todos[0])}>delete</button>
    </div>
  ),
}))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: ({
    todo,
    onClose,
    onSaved,
  }: {
    todo: Todo | 'new'
    onClose: () => void
    onSaved: (notice: string) => void
  }) => (
    <div role="dialog" aria-label="editor">
      {todo === 'new' ? 'creating' : `editing ${todo.title}`}
      <button onClick={onClose}>close editor</button>
      <button onClick={() => onSaved('Task saved.')}>save editor</button>
    </div>
  ),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: ({
    todo,
    onClose,
    onDeleted,
  }: {
    todo: Todo
    onClose: () => void
    onDeleted: () => void
  }) => (
    <div role="dialog" aria-label="delete">
      deleting {todo.title}
      <button onClick={onClose}>close delete</button>
      <button onClick={onDeleted}>confirm delete</button>
    </div>
  ),
}))
vi.mock('../../components/SuccessNotice', () => ({ SuccessNotice: () => null }))

function setup({
  busy = false,
  mutateAsync = vi.fn(),
  queryError = null as Error | null,
  isPending = false,
  todos = [todoFixture],
} = {}) {
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  const notify = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: todos,
    isPending,
    isFetching: false,
    isError: !!queryError,
    error: queryError,
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(busy)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: todos,
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  return { user: userEvent.setup(), refetch, reset, notify, mutateAsync }
}

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching: false,
    isError: true,
    error: new Error('The server is unavailable.'),
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify: vi.fn() })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})

it('toggles a task and announces completion', async () => {
  const mutateAsync = vi
    .fn()
    .mockResolvedValue({ ...todoFixture, completed: true })
  const { user, notify } = setup({ mutateAsync })
  await user.click(screen.getByRole('button', { name: 'toggle' }))
  expect(mutateAsync).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: { completed: true },
  })
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith('Another task complete. Well done!'),
  )
})

it('announces when a task is marked as active again', async () => {
  const completed = { ...todoFixture, completed: true }
  const mutateAsync = vi.fn().mockResolvedValue(todoFixture)
  const { user, notify } = setup({ mutateAsync, todos: [completed] })
  await user.click(screen.getByRole('button', { name: 'toggle' }))
  expect(mutateAsync).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: { completed: false },
  })
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith('Task marked as active.'),
  )
})

it('does not notify when toggling fails', async () => {
  const mutateAsync = vi.fn().mockRejectedValue(new Error('fail'))
  const { user, notify } = setup({ mutateAsync })
  await user.click(screen.getByRole('button', { name: 'toggle' }))
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  expect(notify).not.toHaveBeenCalled()
})

it('ignores toggles and disables creation while busy', async () => {
  const { user, mutateAsync } = setup({ busy: true })
  await user.click(screen.getByRole('button', { name: 'toggle' }))
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled()
})

it('disables creation while the list is loading', () => {
  setup({ isPending: true })
  expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled()
})

it('opens and closes the editor for a new and an existing task', async () => {
  const { user, notify } = setup()
  await user.click(screen.getByRole('button', { name: 'New task' }))
  expect(screen.getByRole('dialog', { name: 'editor' })).toHaveTextContent(
    'creating',
  )
  await user.click(screen.getByRole('button', { name: 'close editor' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'edit' }))
  expect(screen.getByRole('dialog', { name: 'editor' })).toHaveTextContent(
    `editing ${todoFixture.title}`,
  )
  await user.click(screen.getByRole('button', { name: 'save editor' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Task saved.')
})

it('opens the delete dialog and notifies after deletion', async () => {
  const { user, notify } = setup()
  await user.click(screen.getByRole('button', { name: 'delete' }))
  expect(screen.getByRole('dialog', { name: 'delete' })).toHaveTextContent(
    `deleting ${todoFixture.title}`,
  )
  await user.click(screen.getByRole('button', { name: 'close delete' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'delete' }))
  await user.click(screen.getByRole('button', { name: 'confirm delete' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Task deleted.')
})
