---
name: scaffolding-plan-tests
description: Translates implementation plan tasks into failing test files before coding begins. Use when generating TDD test scaffolds from plans, deriving test cases from success criteria, creating test contracts for plan execution, or whenever the user wants to write tests before implementation. Also use when the user has a plan and asks about testing strategy, test-first workflows, or what tests to write for planned features.
---

# Scaffolding Plan Tests

**Core principle:** Tests are the contract between what the user wants and what the agent builds. Write them before any implementation so the execute phase has an objective definition of "done."

## How It Works

Read a plan's tasks and success criteria, then produce **real test files** that:

- Compile/parse (no syntax errors)
- Fail on run (nothing implemented yet)
- Assert on **behavior and outcomes**, not implementation details

Tests become the verification mechanism during `/execute`. When all scaffolded tests pass, the task is complete.

## Existing Test Coverage

Before scaffolding, check for existing tests that already cover planned behavior:

- If a test file exists for the same module, add new cases to it rather than creating a duplicate
- If existing tests partially cover a success criterion, scaffold only the missing cases
- Never overwrite or modify existing passing tests

## Deriving Test Cases

For each task group in the plan, extract testable behavior from these sources (in priority order):

| Source | What to extract |
|--------|----------------|
| **Success criteria** | Each criterion becomes at least one test case |
| **Task steps** | Steps that create, modify, or validate become test cases |
| **Verify commands** | Existing verification hints tell you what to assert |
| **Implicit behavior** | Error cases, edge cases, and boundaries implied by the feature |

### Test case formula

```
Given [precondition from plan context]
When [action described in task step]
Then [outcome from success criteria or verify command]
```

**Typical range: 3-7 test cases per task group.** Simpler tasks (pure utilities, config) may need fewer. Complex tasks (auth flows, multi-step workflows) may need more. If you're consistently above 7, check whether you're testing implementation details or whether the task group should be split.

## Test Type Selection

Use the Testing Trophy model from **writing-tests**:

| Plan task type | Default test type | Rationale |
|---------------|-------------------|-----------|
| API endpoint / route handler | Integration | Test request-response with real middleware |
| Business logic / service layer | Integration | Test with real dependencies where possible |
| Pure utility / helper function | Unit | No dependencies to integrate with |
| Full user workflow / multi-step | E2E | Validates the complete path |
| Database schema / migration | Integration | Test against real test DB |
| UI component / page | Integration | Render with real context, assert on visible output |

## Stub Strategy

Tests need to reference code that doesn't exist yet. Create **minimal stubs** so tests compile but fail:

```
project/
  src/auth/login.ts       <- stub: exports function signature, throws "not implemented"
  tests/auth/login.test.ts <- scaffold: real test cases that will fail
```

**Stub rules:**

- Export the function/class/type signature only
- Function bodies: throw "not implemented" or language equivalent (see below)
- Types/interfaces: define the shape based on what tests need
- Import paths must match where the plan says code will live
- Mark stubs clearly: `// STUB: scaffold-tests — replace during implementation`

**Language equivalents for "not implemented" stubs:**

- TypeScript/JavaScript: `throw new Error("not implemented")`
- Python: `raise NotImplementedError`
- Go: `panic("not implemented")` or return zero values with `// STUB` comment
- Rust: `todo!()`

**Do not stub:**

- External dependencies (use real packages or mocks per **writing-tests**)
- Test utilities or frameworks
- Existing code that the plan builds on

## File Placement

Place test files where the project's existing tests live. Detect the convention:

| Signal | Convention |
|--------|-----------|
| `tests/` or `__tests__/` directory exists | Mirrored structure: `tests/auth/login.test.ts` |
| Test files co-located with source | Same directory: `src/auth/login.test.ts` |
| `*_test.go` files next to source | Go convention: `src/auth/login_test.go` |
| `test_*.py` files in `tests/` | Python convention: `tests/test_login.py` |

If no convention is detectable, ask the user.

## Quality Checklist

Before finalizing scaffolded tests:

- [ ] Every success criterion has at least one test
- [ ] Happy path and primary error paths covered
- [ ] Tests assert on observable behavior (responses, return values, side effects), not internals
- [ ] Test names describe the behavior being verified in plain language
- [ ] Stubs exist for all imports so tests compile
- [ ] No existing passing tests were overwritten or modified

## Anti-Patterns

| Pattern | Problem | Fix |
|---------|---------|-----|
| Testing implementation before it's designed | Tests couple to code that doesn't exist | Test behavior and outcomes only |
| Too many test cases per group | Overwhelming for user review, likely testing internals | Check if testing internals or if task group should be split |
| Stubs that partially implement logic | Tests might pass without real implementation | Stubs must throw/panic/raise, never return real values |
| Skipping user review | Defeats the purpose, tests may not match intent | Always present and get explicit approval |
| Writing tests for infrastructure/config tasks | Not all plan tasks need tests | Skip tasks that are pure config, setup, or wiring |
| Duplicating existing test files | Wasted effort and conflicting coverage | Check for existing tests before scaffolding |

## Related Skills

- **Test patterns and anti-patterns:** **writing-tests**
- **Plan structure and task sizing:** **writing-plans**
- **Executing with scaffolded tests:** **executing-plans**

When used via `/scaffold-tests`, the command handles user review, plan file updates, and workflow orchestration.
