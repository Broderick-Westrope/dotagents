# /build

`/build <design doc or request>` builds an early version of a change, challenges it with a devil's advocate, then reviews it with audited multi-model findings before handing it to you. It runs as an Anvil workflow: `workflow.js` runs the steps, and the prompts it sends live in `references/`.

Build first, then challenge the diff. An early version answers open questions faster than a plan, and reviewing real code is easier than reviewing prose about code. A diff hides its assumptions, so the builder also writes a short **build note** (where the work is, assumptions, decisions, rejected options, unsure, verified) that the critic reads alongside it.

## What the script owns, and what it doesn't

`/build` started as a prose command the orchestrator followed, and that worked well. The script only takes over what prose couldn't guarantee:

- **The devil's advocate's context.** The script writes its prompt: a snapshot of the design doc taken when the run starts, and the current build note. It never sees earlier rounds or the conversation with the builder. The note does carry the builder's current reasoning, including why it didn't act on a finding and decisions you made when it asked you, so the DA judges the change against them.
- **A fresh builder for each rebuild.** A rejected approach's session never builds the next one, so the new builder isn't anchored to it. It knows only what earlier approaches taught.
- **Caps.** Five DA reviews per approach, three approaches, three review passes.
- **Review.** Three reviewers always run in parallel, an auditor disposes of every finding, and the builder only sees confirmed critical and important findings.
- **The order of phases.** Build, challenge and refine, exercise, review, hand over.

Everything else is the builder's judgement, as it was in the prose command: which repositories the change belongs in, creating worktrees and branches, committing, and how to act on findings (it can disagree with a DA finding and record why in the note). The script never runs git or wtp itself, so it never stops the builder from working the way the change needs. If a guarantee above starts restricting what the builder can do, that's a sign the script has gone too far.

## Input

- A path to a design doc, or a free-text request. With no argument, it offers the newest `plans/design-*.md`.
- An argument that names an existing file (relative to where you ran `/build`) is the design doc. Anything else is a request for the builder to interpret; it asks you if it looks like a mistyped path.
- It doesn't need to start in a git repository, so you can run it from a notes or topic directory.

## Steps

1. **Build.** The invoking session picks the repositories, creates worktrees with **using-git-worktrees** (or builds in the design doc's worktree when it holds only that change's docs), builds the thinnest end-to-end slice first, test-first (`references/test-driven-development.md`), commits as it goes, and writes the build note. The note's **Where** section lists each worktree, branch and base; the DA and reviewers find the change from it.
2. **Devil's advocate.** A fresh `devils-advocate` agent judges the work: clean, changes, or wrong approach.
3. **Refine or rebuild.** Changes go back to the builder, who fixes or answers them and does a structural cleanup pass against the red flags in **codebase-design**, then to a new DA round. A clean verdict gets one cleanup pass too, and moves on only if the builder reports that it changed nothing. A wrong approach is rebuilt from scratch: its builder records the lesson in the design doc and removes its own worktrees and branches (on the design doc's own branch it resets to the docs instead), and a new session starts over.
   - For a large change the builder can work slice by slice, as in the prose command: it reports `slice` after a slice later ones depend on, the DA challenges it (with its own round count), and the builder carries on once it's clean.
4. **Exercise.** The builder verifies the change locally with **verification-before-completion**.
5. **Review.** Reviewers run in parallel, an auditor disposes of their findings, and the builder fixes confirmed ones.
6. **Hand over.** The builder rewrites the note as a draft PR description and hands over in its session, where you carry on with it. The run returns `{outcome: "ready", note, failedReviewers}`.

## Talking to you

The run asks you nothing on the happy path, beyond confirming the design doc when you give no argument.

- **The builder can still stop and ask.** Every working turn ends with a short report. When the builder needs you (an open decision, missing access, an unclear goal), it reports `blocked` with a question. You answer it in a dialog and the answer goes back to the builder.
- **Stopping hands back through the builder.** When a cap is hit or a step fails for good (the DA or the audit failing twice, every reviewer failing, no build note, or any other error), the builder tells you in its session where things stand and what you could do next, and the run returns `{outcome: "stopped", reason, note}`. After rebuilds, it also tells you what each approach taught. Only cancelling, or an error while handing back, ends the run without it.

## Robustness

- A cleanup only skips another DA round when the builder explicitly reports it changed nothing, across the whole exchange, including any question it asked you. A missing or unreadable `changed` counts as changed.
- A builder report that doesn't parse at all counts as done, so the run moves on; the next DA round or review still sees the work. A malformed lesson falls back to the DA's verdict.
- A DA call that fails is retried once with the same prompt. A retry doesn't count as a round.
- Reviewer finding ids are assigned by the script, so model output can't collapse two findings. A reviewer that requests changes without a critical or important finding counts as failed.
- The audit must dispose of each finding exactly once, with duplicate chains ending at a real finding. An invalid audit is retried once with the problem spelled out.
- A builder that doesn't write the build note is reminded once.

## Boundaries

Every builder turn carries `references/boundaries.md`: work on the change's feature branches only, don't push, merge or open a pull request, don't apply migrations to shared environments or publish contracts, and pass the same limits to subagents.

## Reviewers

They mirror `/review`'s model table (Sonnet, Opus and a convention reviewer); change both together. The DA, reviewers and auditor keep the tools their agent definitions in `anvil/agents/` give them.

## Tests

The tests run `workflow.js` under Node 18 or later against a fake of Anvil's runtime (`fake-runtime.mjs`, which mirrors Anvil's `internal/workflow/prelude.js`), with no dependencies:

```sh
cd anvil/commands/build && node --test
```
