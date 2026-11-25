# Taskly App Node

This repository adds a **unit test agent with reusable skills** (backend, frontend, verification) to the Taskly app.
It was used in two ways:

- **Coverage backfill:** the agent added missing tests across the backend and frontend
  ([#17](https://github.com/kacperTheCat/taskly-agent/pull/17), [#18](https://github.com/kacperTheCat/taskly-agent/pull/18)).
- **Pull request workflow:** when a PR changes testable source code, the agent decides what needs tests, writes or
  updates them, scripts verify them without trusting the model, and the verified tests land in the PR with a report
  comment.

More:

- [SOLUTION.md](SOLUTION.md): decisions, how to run it, an example run, evals and limitations.
- [#19](https://github.com/kacperTheCat/taskly-agent/pull/19): the demo, a feature PR without tests that the workflow completed.
- [#16](https://github.com/kacperTheCat/taskly-agent/pull/16): the workflow, with its three jobs split by access.

The app itself is described below.

## Setup

```sh
cp .env.example .env
```

## Docker

```sh
docker compose up --build -d --wait
```

Application: http://localhost:8080. API: http://localhost:8000/docs.

```sh
docker compose down
```

## Frontend

React + TypeScript + Vite. Tests: Vitest + React Testing Library.

Installation:

```sh
cd frontend
npm ci
```

Development — http://localhost:5173:

```sh
npm run dev
```

Storybook — http://localhost:6006:

```sh
npm run storybook
```

Tests:

```sh
npm test
```

Coverage — `frontend/coverage/index.html`:

```sh
npm run test:coverage
```

## Backend

Node.js + TypeScript + Express. Database: PostgreSQL + Prisma ORM. Tests: Vitest + Supertest.

Requires Node.js >=22.12 and PostgreSQL.

Installation:

```sh
cd backend
npm ci
```

Database — run from the repository root:

```sh
docker compose up -d --wait postgres
```

Development — http://localhost:8000/docs (from `backend`):

```sh
npm run dev
```

Production:

```sh
npm run build
npm start
```

### Database (Prisma ORM)

Schema — `backend/prisma/schema.prisma`. Connection — root `.env`.

Validate schema:

```sh
npm run db:validate
```

Generate client — also runs during installation and build:

```sh
npm run db:generate
```

Database browser:

```sh
npm run db:studio
```

Schema migrations are managed separately; generating the client does not update the database.

### Tests and coverage

Type check:

```sh
npm run typecheck
```

Tests:

```sh
npm test
```

Watch mode:

```sh
npm run test:watch
```

Coverage — `backend/coverage/index.html`:

```sh
npm run test:coverage
```
