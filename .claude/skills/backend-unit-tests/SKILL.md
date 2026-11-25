---
name: backend-unit-tests
description: Conventions for writing or updating Vitest unit tests for files under backend/src (Express 5, Prisma 7, Zod). Use when backend source changed and needs new or updated tests.
---

# Backend unit tests

## Layout and style
- One flat file per source module: `src/features/todos/repository.ts` -> `tests/repository.test.ts`, `src/core/config.ts` -> `tests/config.test.ts`.
- `tests/fixture.ts` is read-only. Put helpers and fixture variants inside the test file.
- Import from `vitest` explicitly (no globals). Import source with a relative path and the `.ts` extension: `import { fromModel } from '../src/features/todos/mappers.ts';`.
- Top-level `it(...)`, a small `setup()` per file, `it.each` for input tables. Follow the style of the file you edit.
- `validators.ts` and `mappers.ts` have a 100% per-file coverage threshold. Keep every branch covered.

## Fixtures
`tests/fixture.ts` exports `record` (Prisma row, `Date` fields) and `todo` (API JSON: ISO strings, `due_date` as `YYYY-MM-DD`). Derive variants by spreading: `{ ...record, completed: true }`.

## Prisma: real client, spied delegates, no database
```ts
afterEach(() => vi.restoreAllMocks());
function setup() {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  return { database, repository: new TodoRepository(database) };
}
const findMany = vi.spyOn(database.todo, 'findMany').mockResolvedValue([record]);
```
- Never connect. Spy every delegate method the code under test calls; an unmocked call tries to reach PostgreSQL.
- Read generated data from `spy.mock.calls[0][0].data`. Use `expect.any(Date)` for timestamps.

## HTTP: supertest
Mount a router on a bare app with a fake store, or build the real app with `createApp(createDatabase(<dummy url>))` and spy the delegates.
```ts
const app = express();
app.use(express.json());
app.use('/api/todos', createTodosRouter(repository));
const response = await request(app).post('/api/todos').send({ title: 'Task' });
```
- Assert status, body and what the store received (or `not.toHaveBeenCalled()` for rejected input).
- Error bodies are always `{ detail: ... }`. For 422 assert the status and that `detail` is an array, not exact Zod messages.
- Silence expected server errors with `vi.spyOn(console, 'error').mockImplementation(() => {})`.

## Environment, dates, processes
- `core/config.ts` loads the repo-root `.env` on import. Stub every variable a test depends on, including blanking with `vi.stubEnv('DATABASE_URL', '')`, and `vi.unstubAllEnvs()` in `afterEach`.
- Calendar dates are UTC midnight: `new Date('2026-10-15T00:00:00.000Z')` <-> `'2026-10-15'`. Never use `new Date()` in expected values; pin time with `vi.setSystemTime`.
- Servers listen on port `0` and are closed in the test. Never send real signals or let `process.exit` run.

## Do not
- Test `main.ts`, `types.ts` or `src/generated/**`.
- Use a real database or network, snapshots, or assertions on private calls when an observable result exists.
