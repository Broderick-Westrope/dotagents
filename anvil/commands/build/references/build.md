Build an early version of the change described in {{doc}}.

If the goal or the success criteria aren't clear enough to build from, don't guess: report `blocked` with your question. If it needs more than a question or two, say the user should run **grilling** first.

1. **Worktrees.** Decide which repositories the change belongs in. The run started in `{{root}}`, which may not be one of them (for example, a notes directory). Load **using-git-worktrees** and work in a linked worktree on a feature branch in each. When the design doc sits in a linked worktree whose branch holds only docs for this change (the design doc, perhaps a spike), build in that worktree: the docs and the change ship together. An early version must be cheap to throw away.
2. **Build.** Read the code you will touch and follow its existing patterns. Load the matching style skills (for example **go-style**).
   - Build the thinnest complete path first: one slice through every layer that works end to end. Then widen it.
   - Follow the test-driven development reference at `{{tdd}}` for each slice. Stop at green; structural cleanup comes later.
   - Commit as you go, one commit per logical step. Reviewers read committed work.
   - For a large change, build slice by slice. When a slice is done that later slices will depend on, write the build note and report `slice`, so the devil's advocate challenges it before you build on it; you'll be told when to carry on. Report `done` once the whole change is built.
   - Hand bounded slices to **fixer** subagents when that's faster than building them yourself, in parallel only when they touch separate areas. Give each the design doc, its slice, its worktree, the TDD reference path and the style skill to load, and merge the assumptions it reports into the build note.
   - Don't stop to polish. The point is to learn what the change really involves, and the devil's advocate may still send it back for a rebuild.
3. **Build note.** Write it to `{{note}}` right after building, while you still know what you assumed. Don't commit it. Keep it short. It covers:
   - **Where:** each worktree's absolute path, branch and base branch. Reviewers find the change from this, so keep it accurate.
   - **Assumptions:** things the code relies on that you did not verify.
   - **Decisions:** choices you made where the design doc was silent.
   - **Rejected options:** approaches you tried or considered, and why not.
   - **Unsure:** anything you would want a second opinion on.
   - **Verified:** what you checked and how (tests, commands, real runs).

The note is evergreen: whenever you change the work, rewrite it to describe the current version, not the history of changes.
