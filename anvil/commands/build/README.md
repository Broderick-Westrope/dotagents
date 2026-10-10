# /build

`/build <design doc or request>` builds an early version of a change, challenges it with a devil's advocate, then reviews it with audited multi-model findings before handing it to you. It runs as an Anvil workflow: `workflow.js` owns the steps, caps and context boundaries described here, and the prompts it sends live in `references/`.

Build first, then challenge the diff. An early version answers open questions faster than a plan, and reviewing real code is easier than reviewing prose about code. A diff hides its assumptions, so the builder also writes a short **build note** (assumptions, decisions, rejected options, unsure, verified) that the critic reads alongside it.

## Input

- A path to a design doc, or a free-text request. With no argument, it offers the newest `plans/design-*.md`.
- An argument without spaces that ends in `.md` or contains `/` is treated as a path, and the run fails if the file doesn't exist rather than building it as a request.
- It branches from the current branch, so it refuses to start on a detached HEAD.

## Steps

1. **Worktree.** Creates `feat/<slug>` from the current branch with `wtp`, skipping names that already exist as a branch or have kept attempts.
2. **Build.** The invoking session builds the thinnest end-to-end slice first, test-first (`references/test-driven-development.md`), committing as it goes, and writes the build note to the run's temp directory. A builder that never writes the note fails the run.
3. **Devil's advocate.** A fresh `devils-advocate` agent judges the work: clean, changes, or wrong approach.
4. **Refine or rebuild.** Changes go back to the builder, who fixes them and does a structural cleanup pass against the red flags in **codebase-design**, then to a new DA round. A clean verdict gets one cleanup pass too, and moves on only if that leaves the work unchanged; otherwise the cleaned-up version goes to another DA round. A wrong approach is rebuilt from scratch (see below).
5. **Exercise.** The builder verifies the change locally with **verification-before-completion**.
6. **Review.** Reviewers run in parallel, an auditor disposes of their findings, and the builder fixes confirmed ones.
7. **Hand over.** The builder rewrites the note as a draft PR description, and the run returns `{outcome: "ready", branch, worktree, note}`.

## Caps

- Five DA reviews per approach (rounds that follow a cleanup count), three approaches (two rebuilds), three review passes.
- Hitting any cap, or every reviewer failing, tells you why and fails the run. Only a hand-over completes it.

## Devil's advocate isolation

- The DA reads a snapshot of the design doc taken when the run starts, so nothing written to the doc later (including lessons) reaches it.
- Each approach has its own note file, so a rebuilt approach's DA never reads the rejected one's note.
- Every round is a fresh agent that sees only the doc, the current note and the base branch: no earlier findings and no round number.

## Committed-state gates

The DA and the reviewers read the committed diff. Before each DA round and review pass the worktree must be fully committed: the builder is asked to commit its own files and leave anything else untouched, then you're asked. If HEAD moves or files change while they're looking, their verdict is discarded and the version is reviewed again.

## Rebuild safety

- The old branch tip is kept at `refs/build-attempts/<branch>/<n>`, and the run refuses to overwrite an existing one.
- Removing and recreating the worktree happens in one exclusive hold, so nothing you queued runs against a missing worktree.
- You're asked before uncommitted or ignored files are discarded (the default answer stops), and before background jobs that could still write to the worktree are stopped.
- The next approach starts in a new session, seeded with what each earlier approach taught. Those lessons come back to you at hand-over to record in the design doc.

## Review

- Reviewers mirror `/review`'s model table (Sonnet, Opus and a convention reviewer). A reviewer that requests changes without a critical or important finding counts as failed.
- A fresh auditor confirms, rejects or deduplicates every finding. The script checks the audit covers each finding exactly once and that duplicate chains end at a real finding, retrying once before failing.
- The builder only ever sees confirmed critical and important findings.
- The DA, reviewers and auditor get only `glob`, `grep`, `ls`, `view` and `bash` (for git).

## Boundaries

Every builder turn carries `references/boundaries.md`: work on the branch only, don't push, merge or open a pull request, don't apply migrations to shared environments or publish contracts, and pass the same limits to subagents.

## Tests

The tests run `workflow.js` under Node 18 or later against a fake of Anvil's runtime (`fake-runtime.mjs`, which mirrors Anvil's `internal/workflow/prelude.js`), with no dependencies:

```sh
cd anvil/commands/build && node --test
```
