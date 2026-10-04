# Work tracking and session handoff implementation plan

> **Status:** APPROVED

## Overview

**Problem:** A piece of work (an *initiative*) spans worktrees, topic folders, config files, PRs and Anvil sessions, but nothing records the initiative itself. A scan on 2026-10-04 found:

- 80 wtp worktrees: 27 never pushed, 12 with unpushed commits, 7 with uncommitted changes, 25 untouched for 30+ days;
- 10 pinned Anvil sessions, whose pin notes are effectively the to-do list.

The user keeps track of the work in two ways, and both cost something:

- keeping sessions open for days;
- raising draft PRs early so the work shows up in their GitHub PR list.

Handoffs at the end of a session are written by hand, if at all.

**Goal:**

- Each initiative has one small file in `~/.agents/initiatives/` that records why it exists, its phase, its decisions and next steps, and links to its worktrees, PRs, topic, docs and sessions.
- A stdlib-only script, `wip`, owns the file's machine-readable part. It validates phase changes, derives the phases that depend on PRs, and prints a board built from live git and Anvil state plus the last-observed PR state (shown with its age).
- Worktrees keep short branch-scoped notes in `NOTES.local.md`.
- `/goodbye` and the existing workflow skills call `wip` at the moments state changes.
- The user can close old sessions and skip early draft PRs: `wip` shows everything in flight, and each initiative records the session IDs to resume with `anvil --session <id> --there`.

**Phases** match the claude-essentials workflow:

| Phase | Entered when | Set by |
|---|---|---|
| `idea` | An initiative is created | `wip new` |
| `spec` | A design doc exists (`/grill` → `plans/design-*.md`) | `wip phase … spec --doc <path>` |
| `planning` | An implementation plan exists (`/plan` → `plans/impl-*.md`) | `wip phase … planning --doc <path>` |
| `implementing` | Work starts (`/execute`, or directly for small work) | `wip phase … implementing` |
| `review` | A linked PR is open and not a draft | derived by `wip sync` |
| `done` | Every linked PR is merged; or set manually with a reason for work that has no PR | `wip sync` / `wip phase … done --reason` |
| `parked` | Waiting on something (a person, a decision, more time) | `wip phase … parked --reason "<why / what we're waiting for>"` |

**Design decisions:**

1. **Script inside a skill, not an Anvil tool or wtp hook.**
   - The agent learns the script's path only by loading the `tracking-work` skill, so it reads the rules before it can change state.
   - The script itself enforces the rules, so a call made without the skill still can't make an invalid change.
   - Anvil has no mechanism to hide a tool until a skill is loaded.
   - wtp's only hook is `post_create`, configured in each repo's `.wtp.yml`, which can't be added to company repos.
   - wtp and Anvil are data sources the script reads, not homes for it.
2. **Store intent, derive state.**
   - Initiative files hold only what git can't tell you.
   - Branch status and stale or orphaned worktrees are computed each run.
   - PR state is observed by `wip sync` and shown with its age; an unknown or failed observation never drives a phase change.
   - Derived phases (`review`, `done`) can't be set by hand, except `done` for work with no PR, which needs a reason.
3. **Entry points stay thin, and offer to enrol.**
   - `/goodbye` and the edited workflow skills each say "load `tracking-work`" plus the one event that applies.
   - All rules about phases, notes and file format live in that skill and the script.
   - When an event finds no initiative, the agent offers once to create or attach one, rather than skipping silently, so the system gets populated.
4. **Where each kind of note goes:**
   - The initiative file holds the cross-cutting part: why the work exists, decisions, next steps and links.
   - `NOTES.local.md` holds only what's left on this branch and its gotchas. It opens with a pointer line per initiative. It doesn't copy git or PR state; `wip show` gives that live.
   - A topic folder, if the initiative has one, holds the durable domain facts; the initiative links it.
   - Each fact has one home.
5. **Pinned sessions are left alone.**
   - `wip` reads pins from `anvil.db` read-only and flags pinned sessions no initiative links to.
   - A one-off `wip import-pins` turns the pins the user picks into parked initiatives, using the pin note as the reason.
   - Pins stay an Anvil UI feature.
6. **Script first, command later.** `wip` with no arguments prints the board. A `/wip` command is added only if the user keeps asking an agent the same follow-up questions about the board.

**Out of scope:**

- Anvil code changes.
- Writing to `anvil.db`.
- Pushing, posting or editing PRs.
- A GUI board.
- Claude Code/Cursor support (this plugin has been Anvil-only since `e1048ae`).

## Phases

| # | File | Delivers | Depends on | Review focus |
|---|------|----------|------------|--------------|
| 1 | `phase-1-core.md` | `wip` script and tests, `tracking-work` skill, `/goodbye`, archiving notes on every worktree-removal path, then (after sandbox acceptance) notes read-back in the user's config | — | Metadata schema, transition matrix, lookup contract, locking, board latency, notes split |
| 2 | `phase-2-entry-points.md` | `tracking-work` events from `/grill`, `/plan`, `/execute`, `/pr`, the planner agent and `using-git-worktrees`; selective pin import; dogfooding on the current initiative | Phase 1 | Each workflow step records the right event, and declining enrolment leaves workflows exactly as today |

## Phase boundaries

- **1 → 2:** Phase 1 can be used by itself (`wip` from a terminal, `/goodbye`, the archive step). It touches existing skills only where they remove worktrees, since that's where notes are lost today. Phase 2 changes skills every workflow runs through, so it's reviewed separately once the script's interface is settled.

<!-- Review notes (devils-advocate, 2026-10-04, second pass): caught circular enrolment (new worktrees can't match `which`; now resolved from the source location or session, with a one-time offer); no contract for `which` with multiple matches or doc paths; closed-unmerged PRs counting towards done and other gaps in sync derivation (now a full matrix, with provenance and unknown-state handling); "board can't drift" overstating cached PR state; an exclusive-create lock that survives crashes (now `flock`, with network calls outside the lock and compare-and-swap writes); worktree-removal paths in `/execute` and `executing-plans` that bypassed the archive step; archive-name collisions and unlink-before-remove ordering; the hand-rolled YAML-ish format (now JSON front matter with a version); a fixed scan depth missing deep branch names and a serial worst case of minutes (now pruned walk, one `status --porcelain=v2 --branch` per worktree, bounded concurrency, a deadline); planner's skill allow-list omitting tracking-work; `/pr` being delegation-only; notes duplicating git state; all-or-nothing pin import; and the e2e not proving the env override reached the agent. Phase history and bulk import were cut or deferred. -->
