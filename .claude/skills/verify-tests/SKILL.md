---
name: verify-tests
description: Run, check and repair unit tests written or changed by the test agent. Use after writing or editing any test file, before reporting results.
---

# Verify tests

A test counts only after it has run and passed here. Run tests only through the wrapper:

```sh
node .claude/scripts/run-tests.mjs <test file>... --cover <changed source file>...
```

It runs Vitest per package and prints coverage for the source files passed with `--cover`.

Call it as one plain command, exactly in this form. Loops, pipes (`| tail`), redirects (`2>&1`) and `cd ... &&` are denied. To run twice, call it twice.

## Loop

1. Run the tests you wrote or changed, with `--cover` for the source files they target.
2. If all pass, read the uncovered lines. Add a test only if those lines hold behaviour worth asserting.
3. If a test fails, decide why before you touch it:
   - **The test is wrong** (bad import, wrong setup, wrong expectation about unchanged behaviour): fix the test.
   - **The source looks wrong** (the test encodes the behaviour the PR clearly intends, and the code does not do it): do not change the assertion to match the code. Remove that test from the file and report the file as `suspected_bug` with the failing expectation in `reason`.
4. Stop after 3 fix attempts per test file. If it still fails, delete only the tests you added, keep the file passing, and report the file as `failed`.
5. Run the final files once more. Report only after two passing runs in a row; CI repeats this and drops flaky files.

## Never

- Weaken, delete or loosen an existing assertion to make a test pass. If the PR changed behaviour on purpose, update the expectation and say so in `reason`.
- Add `.skip`, `.only`, `.todo`, empty tests or tests without assertions.
- Run tests any other way than the wrapper.

## Good enough

- Every changed function or component with behaviour has at least one test asserting its observable result, including the main error or edge path.
- No test depends on the current date, test order or the network.
