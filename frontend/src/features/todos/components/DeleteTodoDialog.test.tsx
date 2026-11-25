import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useDeleteTodoMutation } from '../hooks/useDeleteTodoMutation'
import { DeleteTodoDialog } from './DeleteTodoDialog'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useDeleteTodoMutation', () => ({
  useDeleteTodoMutation: vi.fn(),
}))

function setup(mutation: Record<string, unknown>, busy = false) {
  const mutateAsync = (mutation.mutateAsync ?? vi.fn()) as ReturnType<
    typeof vi.fn
  >
  vi.mocked(useDeleteTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    ...mutation,
    mutateAsync,
  } as unknown as ReturnType<typeof useDeleteTodoMutation>)
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy={busy}
      onClose={onClose}
      onDeleted={onDeleted}
    />,
  )
  return { user: userEvent.setup(), mutateAsync, onClose, onDeleted }
}

it('deletes the task and reports success', async () => {
  const { user, mutateAsync, onDeleted } = setup({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  })
  await user.click(screen.getByRole('button', { name: 'Delete task' }))
  expect(mutateAsync).toHaveBeenCalledWith(todoFixture.id)
  expect(onDeleted).toHaveBeenCalledTimes(1)
})

it('does not report success when deletion fails', async () => {
  const { user, mutateAsync, onDeleted } = setup({
    mutateAsync: vi.fn().mockRejectedValue(new Error('fail')),
  })
  await user.click(screen.getByRole('button', { name: 'Delete task' }))
  expect(mutateAsync).toHaveBeenCalledTimes(1)
  expect(onDeleted).not.toHaveBeenCalled()
})

it.each([
  ['the mutation is pending', { isPending: true }, false],
  ['the page is busy', {}, true],
])('disables both actions while %s', (_, mutation, busy) => {
  setup(mutation, busy)
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
})

it('shows a deletion error and allows cancelling without deleting', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn()
  vi.mocked(useDeleteTodoMutation).mockReturnValue({
    isPending: false,
    error: new Error('Could not delete.'),
    mutateAsync,
  } as unknown as ReturnType<typeof useDeleteTodoMutation>)
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy={false}
      onClose={onClose}
      onDeleted={onDeleted}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Delete task?' })).toBeVisible()
  expect(
    screen.getByText(
      `The task “${todoFixture.title}” will be permanently deleted.`,
    ),
  ).toBeVisible()
  expect(screen.getByTestId('alert')).toHaveTextContent('Could not delete.')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(onDeleted).not.toHaveBeenCalled()
})
