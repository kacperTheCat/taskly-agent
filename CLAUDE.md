# Working in this repo

For agents changing this repository. The unit test agent in CI follows its own definition in
`.claude/agents/unit-test-agent.md`; nothing here applies to it.

Size, complexity and style limits are enforced by tools (ESLint config, `pr-size` check,
zizmor), not by this file. If a tool blocks you, split the code or the PR. Never raise a limit to fit.

## Pull requests

- One concern per PR. A coverage backfill by the unit test agent goes in its own PR; on a feature PR the workflow commits the tests into that PR.
- The description says What, Why, How to review and How verified. Write it from the actual
  diff, the intent of the change and the code as it is now, never from memory. Re-read it
  against the diff before every push and fix it when the PR changed.
- Stacked PRs: rebase the stack to keep a clean history; each PR must pass CI on its own.

## Commits

Conventional Commits in English (`feat`, `fix`, `refactor`, `test`, `ci`, `build`, `docs`).
The subject says what changed; the body, if any, says why.

## Code

- Scripts read top-down as a recipe of named steps, with helpers below or in a module.
- Comments are short and say why, not what.
- Code, commits and docs are in English.

## Reviews

Sort review findings into "blocking now" and "park". Fix the blocking ones. Parked ones go to
`SOLUTION.md` as known limitations, not into the PR.

## Scope

Work on one thread at a time. Note anything else you notice and come back to it later.
