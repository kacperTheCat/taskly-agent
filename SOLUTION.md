# Solution

A unit test agent for Taskly, and a pull request workflow that runs it. When a PR changes source code, the agent writes
or updates tests, scripts verify them without trusting the model, and the verified tests are committed to the PR with a
report comment.

**Quickest look:** [#19](https://github.com/kacperTheCat/taskly-agent/pull/19) adds a small feature without tests. The workflow added the tests as a bot commit and explained
each decision in a comment. [#17](https://github.com/kacperTheCat/taskly-agent/pull/17) and [#18](https://github.com/kacperTheCat/taskly-agent/pull/18) are the coverage backfill by the same agent.

The diagram at the bottom shows the whole flow.

## Decisions

- **The model proposes, scripts decide.** Policy checks, test runs, coverage and the report are plain Node scripts. A
  wrong or manipulated run cannot publish failing or out-of-scope files.
- **Three jobs split by privilege.** The job with the API key cannot write to the repo. The job that writes has no key
  and runs no PR code.
- **Test files only.** A test agent that may edit source can make tests pass by changing behaviour. Suspected bugs are
  reported, not fixed.
- **Tests land in the same PR**, as a normal commit, so the reviewer sees code and tests together.

## Where things are

- Agent: `.claude/agents/unit-test-agent.md`
- Skills: `.claude/skills/backend-unit-tests`, `frontend-unit-tests`, `verify-tests`
- Policy (what to test, where tests may go, limits): `.claude/test-policy.json`, enforced by the hook
  `.claude/hooks/guard-writes.mjs` and again by `validate-patch.mjs`
- Workflow: `.github/workflows/test-agent.yml`, scripts in `.github/scripts`
- Evals: cases in `.github/evals/cases.json`, runner `.github/scripts/evals.mjs`

## Running it

1. Add the secret `ANTHROPIC_API_KEY` in Settings → Environments → `test-agent` → Environment secrets.
2. Open or update a non-draft PR from a branch of this repo. Label `no-test-agent` skips it. Fork PRs never run it.

Locally (Node 22, both packages installed, and the `claude` CLI signed in or `ANTHROPIC_API_KEY` set):

```bash
node .github/scripts/changed-files.mjs --mode backfill frontend/src/features/todos/utils/todos.ts > context.json
node -p 'require("./context.json").prompt' > prompt.txt
node .github/scripts/run-agent.mjs prompt.txt transcript.jsonl > summary.json
```

## Example run (#19)

[#19](https://github.com/kacperTheCat/taskly-agent/pull/19) adds `GET /api/todos/stats` (backend) and a progress line in the page header (frontend), with no tests.

- **Gate:** 5 testable source files; `openapi.json` is not source and was left out.
- **Agent:** Sonnet, 21 turns, $0.12. It loaded all three skills, created 2 test files and updated 3 existing ones,
  including a test that `/stats` is not routed to `/:id`.
- **Verify:** 5 of 5 files passed twice and typecheck; `stats.ts` line coverage 0% → 100%.
- **Publish:** bot commit with the tests, green CI on that commit, and the comment with one row per file.

The comment shows `progress.ts` at 100% → 100%: the page test already ran that code without checking it. Line coverage
says a line ran, not that a test checks it, which is what mutation testing measures.

## Evals

Each case makes one small source change and names the decision the agent should report. The runner gives every case a
throwaway worktree and calls the agent through the same `run-agent.mjs` as CI (`node .github/scripts/evals.mjs`, by hand):

| Case | Expected | Agent decided | Turns | Cost |
|---|---|---|---|---|
| comment only | skipped | skipped | 2 | $0.02 |
| new behaviour | tested or updated | updated | 14 | $0.07 |
| injected bug | suspected_bug | suspected_bug | 10 | $0.05 |

The injected bug is the important one: the agent reported it instead of changing the existing test to match. Three cases
show the idea, not the agent's accuracy.

## Assumptions and limitations

- Unit tests only (Vitest, no database or browser), same-repo PRs from trusted contributors.
- **"Verified" means the tests pass twice, not that they are good.** Mutation testing showed it: see below. The bot
  commit needs human review like any other.
- **Key isolation is best effort.** Test code the agent runs could still read the key from the process table. Limited by
  same-repo PRs, a $1 budget per run and a credential scan of every output.

<details><summary>Smaller known limitations</summary>

- `validate-patch.mjs` counts accepted files from `diff --git` sections only; files from plain sections are checked and
  applied but not counted.
- `verify.mjs` does not re-run the accepted files after removing rejected ones, so a test that imports a rejected one
  would be published broken (the full coverage run would show it).
- If a PR breaks an existing test, Vitest writes no coverage report and "coverage before" shows `n/a`.
- `pr-size.mjs` and its limit come from the PR head, so a PR can raise its own limit.
- The bot commit gets a dispatched CI run without the `pr-size` check; its `pull_request` runs wait for approval.
- The patch is handed between jobs as a job output, capped at about 90 KB.
- The scripts copied before the agent runs live where the agent's test code could overwrite them: a tripwire, not a
  boundary.
- "Trusted" scripts come from the PR's base branch, which for a stacked PR is another feature branch.
- `changed-files.mjs` reads paths without `-z`, so a path with non-ASCII characters is ignored.
- The `isOverdue` test pins a local time, so it depends on the runner's timezone.
- The comment stays from an earlier run when a later one is skipped (draft or label).

</details>

## Production extensions

- **Mutation testing as a quality gate.** Stryker on `utils/todos.ts` (run by hand, not in CI): every line
  was covered, yet 15 of 119 mutants survived (87% score). One removed the due-date sort entirely: the agent's test used
  data where due order equals newest order. With the data fixed in [#18](https://github.com/kacperTheCat/taskly-agent/pull/18), 108 of 119 (91%).
- Required reviewers on the `test-agent` environment and an isolated runner for the agent job.
- A pinned model version and a larger eval set, built from past PRs and run in CI when the agent, skills or policy change.

## How it works

```mermaid
flowchart LR
  PR[Pull request] --> gate{Testable source<br/>changed?}
  gate -- no --> skip[Comment: skipped, $0]
  gate -- yes --> agent

  subgraph agent [agent job: API key, read-only token]
    run[unit-test-agent<br/>+ skills] --> patch[Test patch<br/>+ report]
  end

  subgraph verify [verify job: no secrets]
    check[Policy check] --> tests[Run tests twice<br/>+ typecheck] --> cov[Coverage<br/>before / after]
  end

  subgraph publish [publish job: write token, no key]
    commit[Commit verified tests<br/>to the PR] --> ci[Run CI on<br/>that commit] --> comment[Update PR comment]
  end

  patch --> check
  cov --> commit
