---
description: Build an early version of a feature or change, then challenge and review the diff
argument_hint: "<design-doc-path-or-description>"
---

Build an early version of: `$ARGUMENTS`

If `$ARGUMENTS` is a path to a design doc, read it first. If it is empty, look for the most recent design doc in `plans/` and confirm it with the user before starting.

Build first, then challenge the diff. An early version answers open questions faster than a plan, and reviewing real code is easier than reviewing prose about code. The one thing a plan did well was put assumptions in writing where a critic could attack them. A diff hides them. So the builder writes a short **build note** alongside the diff, and the critic reads both.

## Inputs

- A design doc (goal, constraints, decisions), or a clear request from the user.
- If neither the goal nor the success criteria are clear, stop and ask the user to provide them or initiate **grilling** first.

## Steps

```
Build progress:
- [ ] 1. Set up a worktree
- [ ] 2. Build an early version
- [ ] 3. Write the build note
- [ ] 4. Devil's advocate review
- [ ] 5. Refine or rebuild
- [ ] 6. Exercise the change locally
- [ ] 7. Agent code review
- [ ] 8. Human code review
```

### 1. Set up a worktree

Use a worktree on a feature branch (see **using-git-worktrees**). An early version must be cheap to throw away.

### 2. Build an early version

- Read the code you will touch and follow its existing patterns. Load the matching style skills (e.g. **go-style**).
- Build the thinnest complete path first: one slice through every layer that works end to end. Then widen it. A tracer bullet, as in _The Pragmatic Programmer_.
- Follow `references/test-driven-development.md` (relative to this command's location) for each slice. Stop at green. Structural cleanup happens when refining in step 5.
- Commit as you go, one commit per logical step, creating a history as you go.
- For large changes, build slice by slice. Run slices in parallel only when they touch separate areas, and give each subagent the design doc and its slice. Each slice goes through steps 3 to 5 before the next one depends on it.

Don't stop to polish yet. The point is to learn what the change really involves, and the devil's advocate may still send it back for a rebuild.

### 3. Write the build note

Write it right after building, while you still know what you assumed. Keep it short. It covers:

- **Assumptions:** things the code relies on that you did not verify.
- **Decisions:** choices you made where the design doc was silent.
- **Rejected options:** approaches you tried or considered, and why not.
- **Unsure:** anything you would want a second opinion on.
- **Verified:** what you checked and how (tests, commands, real runs).

Don't commit the note. Write it to a unique temp file (`mktemp -t build-note`) so it survives context compaction and concurrent builds don't collide. It is evergreen. After each round, rewrite it to describe the current version, not the history of changes.

### 4. Devil's advocate review

Dispatch a fresh **devils-advocate** agent with exactly three things: the design doc path (or the request), the build note's contents pasted into the prompt, and the base branch to diff against. Paste/pass the note in the prompt rather than passing the path to its file.

Don't tell it which round this is, and don't pass earlier findings or how you resolved them. Each review should judge the current version on its own, so earlier rounds can't anchor it.

### 5. Refine or rebuild

- **Premise or approach is wrong:** don't patch it. Record what you learned in the design doc, delete the branch, and rebuild from step 1. An early version is cheap; a patched wrong approach is not. Delete the old build note file.
- **Otherwise, refine:** fix the findings, then re-read the whole diff as one change and clean up its structure: pass-through layers, shallow modules, duplicated concepts, growing switches, unclear names, and code in the wrong place. Use the matching style skill (e.g. **go-style**) and **refactoring-code**. Keep tests green and commit cleanup separately from behavior changes. Update the build note and re-run step 4.
- Move on once the devil's advocate finds nothing worth changing and the cleanup pass leaves the diff unchanged.
- Count devil's advocate reviews per approach. After three reviews of the same approach without moving on, stop and bring the user the latest findings and any concern that kept coming back. A rebuild starts a new count; after two rebuilds, stop and bring the user what each approach taught you, since the design doc likely needs revisiting.

### 6. Exercise the change locally

Load **verification-before-completion** and exercise the change locally as it describes. Fix bugs and friction you notice (confusing errors, noisy output, inconsistent behavior).

### 7. Agent code review

Read `../review/COMMAND.md` relative to this command's location and follow it. Treat its `$ARGUMENTS` as "the full branch diff against `<base>`", so skip its scope questions. On REQUEST CHANGES, fix every Critical and Important finding without asking, committing each fix separately (don't amend earlier commits), then re-run the review as that command says. Reviewers check structure again with fresh eyes, since authors miss their own mistakes.

### 8. Human code review

Stop and hand over to the user with the worktree path, the branch, and the build note rewritten as a draft PR description. Wait for their review. Don't push, merge, or open a PR unless they ask.

Once they approve, delete the build note and use **finishing-a-development-branch**.

## Changes That Are Expensive to Reverse

Database migrations, protobuf and public API contracts, and changes spanning several services still start with an early version, but on a branch only. Don't apply migrations to shared environments or publish contracts until the user approves in step 8. In step 4, ask the devil's advocate to focus on reversibility and rollout order.
