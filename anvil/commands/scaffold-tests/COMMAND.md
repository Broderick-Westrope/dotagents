---
description: Generate failing test files from an implementation plan (TDD test-first workflow)
argument_hint: "[plan-path]"
---

Generate test scaffolds from an implementation plan using the TDD test-first approach.

Load skills first:
- the **scaffolding-plan-tests** skill
- the **writing-tests** skill

## Workflow

### If no arguments provided (`$ARGUMENTS` is empty):

1. **Find available plans:**
   Search recursively for plan files:
   ```bash
   glob ./**/plans/**/*.md
   glob ./**/plans/**/README.md
   glob ./plans/**/*.md
   glob ./plans/**/README.md
   glob ./**/*-PLAN.md
   glob ./**/*-plan.md
   ```

   Identify plan files by:
   - Files in any `plans/` directory at any depth
   - Files with `-PLAN.md` or `-plan.md` suffix
   - Files containing `> **Status:**` header pattern
   - For multi-file plans: `README.md` files that contain a phase table

2. **Filter to plans without test contracts:**
   - Read each plan file
   - Check if `## Test Contract` section already exists
   - Show plans that either have no test contract or have status `DRAFT`/`APPROVED`
   - Skip plans marked `COMPLETED`

3. **Present options:**
   Ask the user to select:
   ```
   Which plan would you like to scaffold tests for?
   - [plan-1-name] (APPROVED) - Brief description
   - [plan-2-name] (DRAFT) - Brief description
   ```

4. **Load the selected plan** and proceed to scaffolding below.

### If plan path provided (`$ARGUMENTS` has a value):

1. Read the plan file (or `README.md` if path is a directory)
2. Verify the plan exists and has tasks to scaffold

### Scaffolding Process (both paths):

1. **Analyze the plan:**
   - Parse all task groups and individual tasks
   - Extract success criteria
   - Identify the project's language, test framework, and file conventions
   - Map task groups to test files

2. **Detect project test conventions:**
   - Look for existing test files to determine naming and location patterns
   - Detect test framework (Jest, pytest, testify, etc.) from config files
   - If ambiguous, ask the user

3. **For each task group, in order:**

   a. **Derive test cases** following the **scaffolding-plan-tests** skill:
      - Extract testable behavior from success criteria, task steps, and verify commands
      - Identify happy path, error paths, and edge cases
      - Select test type (unit/integration/e2e) based on task type

   b. **Present test cases to the user** for review:
      ```
      ## [Task Group Name] — N test cases

      1. "test name" — what it verifies
      2. "test name" — what it verifies
      ...

      Want to add, remove, or change any test cases?
      ```

   c. **Refine based on feedback:**
      - If the user requests changes, update and re-present
      - If the user approves, proceed to write files
      - If the user says "looks good" or similar for all remaining groups, batch-approve the rest but still show what you'll generate

   d. **Write the test file:**
      - Create the test file with all approved test cases
      - Create minimal stubs for imports that don't exist yet
      - Mark stubs with `// STUB: scaffold-tests` comments

   e. **Verify the scaffold:**
      - Run the test file to confirm tests compile and fail (not error)
      - If tests error (import failures, syntax issues), fix and re-run
      - Report: "N tests scaffolded, all failing as expected"

4. **Update the plan file:**
   - Add `**Tests:**` line to each task that got test coverage
   - Add `## Test Contract` section at the top with the test file summary table
   - Do NOT change the plan's status

5. **Final summary:**
   ```
   Test scaffolding complete:
   - N test files created
   - M total test cases
   - All tests failing (ready for implementation)

   Files created:
   - tests/auth/login.test.ts (5 cases)
   - tests/billing/charges.test.ts (4 cases)

   Run `/execute [plan-path]` to implement against these tests.
   ```

## Rules

- **Never write implementation code.** Only test files and minimal stubs.
- **Always get user approval** on test cases before writing files.
- **Tests must actually run and fail.** Compile errors don't count as "failing" — fix them.
- **Follow existing project conventions** for test file naming, location, and framework.
- **Skip non-testable tasks:** Config changes, file moves, documentation tasks don't need test scaffolds. Note which tasks were skipped and why.
