---
description: Build an early version of a feature or change, then challenge and review the diff
argument_hint: "<design-doc-path-or-description>"
---

Build an early version of: `$ARGUMENTS`

If `$ARGUMENTS` is a path to a design doc, read it first. If it is empty, look for the most recent design doc in `plans/` and confirm it with the user before starting.

Build first, then challenge the diff. An early version answers open questions faster than a plan, and reviewing real code is easier than reviewing prose about code.

The one thing a plan did well was put assumptions in writing where a critic could attack them. A diff hides them. So the implementer writes a short **build note** alongside the diff, and the critic reads both.

## Inputs

- A design doc from **grilling** (goal, constraints, decisions), or a clear request from the user.
- If neither the goal nor the success criteria are clear, stop and use **grilling** first.

## Steps

```
Build progress:
- [ ] 1. Set up a branch
- [ ] 2. Build an early version
- [ ] 3. Write the build note
- [ ] 4. Devil's advocate review
- [ ] 5. Iterate or rebuild
- [ ] 6. Clean up
- [ ] 7. Verify on the real artifact
- [ ] 8. Code review
- [ ] 9. Finish the branch
```

### 1. Set up a branch

Use a worktree on a feature branch (see **using-git-worktrees**). An early version must be cheap to throw away.

### 2. Build an early version

- Read the code you will touch and follow its existing patterns. Load the matching style skills (e.g. **go-style**).
- Build the thinnest complete path first: one slice through every layer that works end to end. Then widen it.
- Use **test-driven-development** for each slice. Stop at green. Structural cleanup happens in step 6, once the approach has survived review.
- Commit as you go, one commit per logical step.
- For large changes, build slice by slice. Run slices in parallel only when they touch separate areas, and give each subagent the design doc and its slice. Each slice goes through steps 3 to 5 before the next one depends on it.

Don't stop to polish yet. The point is to learn what the change really involves, and the devil's advocate may still send it back for a rebuild.

### 3. Write the build note

Write it right after building, while you still know what you assumed. Keep it short. It covers:

- **Assumptions:** things the code relies on that you did not verify.
- **Decisions:** choices you made where the design doc was silent.
- **Rejected options:** approaches you tried or considered, and why not.
- **Unsure:** anything you would want a second opinion on.
- **Verified:** what you checked and how (tests, commands, real runs).

Don't commit the note. Pass it to the reviewers and reuse it for the PR description. After each iteration, rewrite it to describe the current version, not the history of changes.

### 4. Devil's advocate review

Dispatch a fresh **devils-advocate** agent with exactly three things: the design doc path (or the request), the current build note, and the base branch to diff against.

Don't tell it which round this is, and don't pass earlier findings or how you resolved them. Each review should judge the current version on its own, so earlier rounds can't anchor it.

### 5. Iterate or rebuild

- **Code-level findings:** fix them as new commits, update the build note, and re-run step 4.
- **Premise or approach is wrong:** don't patch it. Record what you learned in the design doc, delete the branch, and rebuild from step 1. An early version is cheap; a patched wrong approach is not.
- After three rounds without a pass, stop and bring the findings to the user.

### 6. Clean up

The approach has survived, so now make it good. Re-read the whole diff as one change and fix its structure: pass-through layers, shallow modules, duplicated concepts, growing switches, unclear names, and code in the wrong place. Use the matching style skill (e.g. **go-style**) and **refactoring-code**. Keep tests green, and commit cleanup separately from behavior changes.

### 7. Verify on the real artifact

Tests passing is not enough. Exercise the change the way a user would:

- **APIs:** call endpoints with realistic payloads.
- **CLIs and TUIs:** run the real binary and drive it.
- **Integrations:** hit the real service where it's safe to.
- **Parsers:** feed real data, not just fixtures.

Fix friction you notice (confusing errors, noisy output, inconsistent behavior). See **verification-before-completion**.

### 8. Code review

Run the `/review` workflow. Reviewers check structure again with fresh eyes, since authors miss their own pass-throughs. Fix findings as separate commits; don't amend them into earlier ones.

### 9. Finish the branch

Use **finishing-a-development-branch**.

## Changes That Are Expensive to Reverse

Database migrations, protobuf and public API contracts, and changes spanning several services still start with an early version, but on a branch only. Don't apply migrations to shared environments or publish contracts until step 8 passes. In step 4, ask the devil's advocate to focus on reversibility and rollout order.
