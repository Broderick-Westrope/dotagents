# Phase 2: entry points

> Part of [README.md](README.md). Depends on phase 1 being merged. Create a PR for human review when done; don't merge.

## Context Loading

_Run before starting:_

```bash
read plans/impl-2026-10-04-work-tracking/README.md
read skills/tracking-work/SKILL.md           # the Events table every edit below refers to
read skills/grilling/SKILL.md                # writes plans/design-*.md (around "Write spec to disk")
read skills/writing-plans/SKILL.md           # writes plans/impl-*.md
read skills/executing-plans/SKILL.md         # "## 1. Setup"
read skills/using-git-worktrees/SKILL.md     # "## Creation Steps"
read anvil/commands/pr/COMMAND.md
read anvil/agents/planner.md                 # writes the design spec; renamed to grilling's design-*.md naming
read "/Users/broderick.westrope/Library/Application Support/wtp/worktrees/eucalyptusvc/skills/skill-paths-hook/NOTES.local.md"
```

## Rule for every edit in this phase

Add one short paragraph at the step where the event happens:

> If the **tracking-work** skill is available, load it and apply the "<event>" row of its Events table.

Don't copy phase rules or script commands into these files. The skill holds them.

The skill offers enrolment once per session when no ticket matches. If the user declines, the workflow carries on exactly as it does today.

## Workflow skills

### Task 1: Record phase events in the workflow

**Files:**
- Modify: `skills/grilling/SKILL.md`. After the spec is saved and committed, apply "Design doc written".
- Modify: `skills/writing-plans/SKILL.md`. After the plan is saved and committed, apply "Implementation plan written".
- Modify: `skills/executing-plans/SKILL.md`. Under "## 1. Setup", apply "Execution starts".
- Modify: `skills/using-git-worktrees/SKILL.md`, in two places:
  - after creation, apply "Worktree created";
  - add one line: "When resuming in a worktree, apply tracking-work's 'Resuming' event to read its branch notes."
- Modify: `anvil/commands/pr/COMMAND.md`. `/pr` delegates the work to a Haiku subagent. Add the "PR opened" paragraph to the command body, outside the subagent prompt, to run after the subagent reports a created PR URL. Do nothing if no URL comes back.
- Modify: `anvil/agents/planner.md`, in two places:
  - add `tracking-work` to its `skills:` allow-list (Anvil filters the skills advertised to an agent by this list);
  - rename its spec from `plans/<feature>-spec.md` to `plans/design-YYYY-MM-DD-<feature-name>.md`, matching grilling, so design docs and `impl-` plans share one naming scheme (user decision, 2026-10-04);
  - after the spec is stable, apply "Design doc written".

**Steps:**

1. [x] Make each edit above: one paragraph, at the step named.
2. [x] Check that no edited file mentions `wip.py`, a phase name or `~/.agents/tickets` directly, apart from the event name.

**Verify:**
```bash
grep -rl "tracking-work" skills/grilling skills/writing-plans skills/executing-plans skills/using-git-worktrees anvil/commands/pr/COMMAND.md anvil/agents/planner.md | wc -l   # 6 files
grep -n "tracking-work" anvil/agents/planner.md   # in skills: and in the body
grep -rln "wip.py\|tickets/" skills/grilling skills/writing-plans skills/executing-plans skills/using-git-worktrees anvil/commands/pr/COMMAND.md anvil/agents/planner.md   # no output
```

## Migration

### Task 2: Import pins and dogfood on the current ticket

**Steps:**

1. [x] Run `wip import-pins`, then `wip import-pins --apply` with every proposed ID (user decision, 2026-10-04: import all, then prune at the end). The pinned sessions themselves are left as they are.
2. [x] Create the ticket for the work that produced this plan:
   - run `wip new agent-conventions --title "Agent convention factory"`;
   - link the worktrees `…/eucalyptusvc/skills/skill-paths-hook`, `…/Broderick-Westrope/anvil/subagent-hooks` and `…/Broderick-Westrope/dotagents/goodbye-command`;
   - link PR `https://github.com/eucalyptusvc/skills/pull/235`;
   - link the docs `~/.agents/correction-ledger.md` and this plan's README;
   - link session `44330773-e820-4b13-90b6-73cf8cb722ad`;
   - set the phase to `implementing`, then run `wip sync`.
3. [x] Move the hand-written `NOTES.local.md` files into the ticket body. These are the skill-paths-hook worktree's file and this worktree's file:
   - cross-cutting sections go to Why, Decisions and Next (from skill-paths-hook: Next steps B to E, Baseline to re-measure);
   - branch-scoped content goes to that worktree's `### <branch>` section (for skill-paths-hook: open merge decisions for PR #235, known limits of the hook);
   - drop the copied git and PR state, since `wip show` gives it live;
   - durable domain facts go to the topic, following its `AGENTS.md`;
   - show the user the result, then delete each `NOTES.local.md` only after an explicit yes.
4. [ ] Show the user the board and the unclaimed worktrees list. Ask whether they want to:
   - link unclaimed worktrees to existing tickets;
   - create tickets for them;
   - remove them through the "Worktree about to be removed" event, one at a time with confirmation.

   Remove nothing without an explicit yes.

   Deferred to the end of the rollout, at the user's request (2026-10-04).

**Verify:**
```bash
python3 skills/tracking-work/scripts/wip.py show agent-conventions   # 3 worktrees, PR #235 with a state, session line, a branch section per worktree
```

#### Task 2 results (2026-10-04)

- Imported all 10 pinned sessions as parked tickets, to be pruned later.
- Created `agent-conventions` with the three worktrees from the plan plus this phase's `work-tracking-entry-points`, PR #235, the ledger, the plan README and both sessions. `wip sync` moved it to `review`, since PR #235 is open and not a draft.
- Moved both `NOTES.local.md` files into its body and deleted them, with the user's approval. Facts were checked first: PR #235 is up to date with its remote, `subagent-hooks` still has no upstream, and the receiving-code-review half of item C is already done on main.
- Finding: `gh` has two accounts, and the active one was the personal account, which can't see `eucalyptusvc/skills`. `wip sync` failed with "Could not resolve to a Repository" until run with `GH_TOKEN="$(gh auth token --user brodie-euc)"`. Recorded in the ticket's Context.
- Finding: slugs from `import-pins` are cut at 46 characters mid-word (`...-lokalise-trans`, `...-muninn-s-capabil`).

### Task 3: Workflow end-to-end

**Prerequisites:** the same sandbox, plugin-path swap, env and `echo $WIP_DIR` check as phase 1 Task 4.

**Steps:**

1. [ ] Create a ticket in a scratch worktree, then run `/grill` to completion.
   - Expect: phase `spec`, with the design doc linked.
2. [ ] Run `/plan`.
   - Expect: phase `planning`, with the plan linked.
3. [ ] Run `/execute` on a one-task plan.
   - Expect: `implementing`.
4. [ ] Run `/pr` against a throwaway repo you own (or link an existing PR by hand), then run `wip sync` with the fake `gh` from phase 1.
   - Expect: `review` for an open PR, `done` after merged.
5. [ ] In a worktree no ticket claims, run `/plan` and decline enrolment.
   - Expect: no ticket, no second prompt, and the plan written exactly as before.
6. [ ] Run `/plan` through the planner agent.
   - Expect: it can load `tracking-work` and records `spec`.
7. [ ] Tear down as in phase 1 Task 4.

**Verify:** record each outcome as a checklist at the bottom of this file.
