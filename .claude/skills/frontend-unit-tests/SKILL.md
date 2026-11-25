---
name: frontend-unit-tests
description: Conventions for writing or updating Vitest + React Testing Library tests for files under frontend/src. Use when frontend source changed and needs new or updated tests.
---

# Frontend unit tests

## Layout and style
- Colocated: `<Name>.test.tsx` next to `<Name>.tsx`; `.test.ts` for code without JSX.
- Do not edit `src/test/setup.ts`, `src/test/todoFixture.ts` or `src/design-system/mocks.tsx`.
- Import from `vitest` explicitly (no globals). Prettier style: no semicolons, single quotes, trailing commas.
- `setup.ts` already registers jest-dom matchers and `cleanup`.
- Test names state behaviour. Follow the style of the neighbouring tests.

## Rendering
Components render bare, with no providers, because tests mock the design system (adjust the path depth):
```tsx
vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
```
- The mocks render native elements: buttons as `<button>`, inputs inside a `<label>` (`getByLabelText`), `Drawer` as `role="dialog"`, `Alert` as `data-testid="alert"`.
- Stub child components with `vi.mock('./Child', () => ({ Child: () => <li>Task</li> }))` so each test covers one unit.
- Components that use data hooks mock the hook module and cast the return value:
```tsx
vi.mock('../hooks/useDeleteTodoMutation', () => ({ useDeleteTodoMutation: vi.fn() }))
vi.mocked(useDeleteTodoMutation).mockReturnValue({
  isPending: false, error: null, mutateAsync,
} as unknown as ReturnType<typeof useDeleteTodoMutation>)
```
- `const user = userEvent.setup()` per test. Query by role and name first, then label, then text.

## Data layers
- `lib/http.ts` (`request`, wraps `fetch`) <- `api/todos.ts` (`todosApi`) <- hooks. Mock the layer directly below the unit under test: `request` for the API module, `todosApi` for hooks, `globalThis.fetch` (`vi.spyOn`) only for `lib/http.ts`.
- Hooks with React Query: a fresh client per test, never `lib/queryClient`:
```tsx
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)
```
  Use `renderHook(..., { wrapper })`, seed and assert the cache with `client.setQueryData` / `getQueryData`.

## Fixtures and time
- Use `todoFixture` from `src/test/todoFixture` and derive variants with spread. Do not mutate it.
- Code that reads the current date or uses timeouts: `vi.useFakeTimers()`, `vi.setSystemTime(...)`, restore in `afterEach`. With user-event use `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`.

## Do not
- Assert class names, styled-components internals or use `container.querySelector`.
- Use snapshots or real network.
