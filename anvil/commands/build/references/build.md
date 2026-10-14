Build an early version of the change described in {{doc}}.

Work only in the worktree at `{{worktree}}` (branch `{{branch}}`, based on `{{base}}`). Use absolute paths under it with the file tools, and start every bash command with `cd "{{worktree}}" &&`. Don't create, move or remove worktrees or branches; the workflow owns them.

- Read the code you will touch and follow its existing patterns. Load the matching style skills (for example **go-style**).
- Build the thinnest complete path first: one slice through every layer that works end to end. Then widen it.
- Follow the test-driven development reference at `{{tdd}}` for each slice. Stop at green; structural cleanup comes later.
- Commit as you go, one commit per logical step.
- You may hand bounded slices to **fixer** subagents. Give each the design doc, its slice, the TDD reference path and the style skill to load, and merge the assumptions it reports into the build note.
- Don't stop to polish. The point is to learn what the change really involves.

When the early version is built, write the build note to `{{note}}` (overwrite it). Keep it short. It covers:

- **Assumptions:** things the code relies on that you did not verify.
- **Decisions:** choices you made where the design doc was silent.
- **Rejected options:** approaches you tried or considered, and why not.
- **Unsure:** anything you would want a second opinion on.
- **Verified:** what you checked and how (tests, commands, real runs).

The note is evergreen: it describes the current version, not the history of changes. Don't commit it.
