---
name: using-git-worktrees
description: "Sets up isolated git worktrees for feature development. Use when starting work that needs isolation from the current workspace, before executing implementation plans, or when working on multiple branches simultaneously."
---

# Using Git Worktrees

## Overview

Git worktrees create isolated workspaces sharing the same repository, allowing work on multiple branches simultaneously without switching.

**Core principle:** Every worktree is managed by `wtp`. Never call `git worktree add` or `git worktree remove` directly, and never pick a worktree directory yourself. `wtp` owns the location, so humans and agents always find worktrees in the same place.

**Announce at start:** "I'm using the using-git-worktrees skill to set up an isolated workspace."

## Creation Steps

### 1. Check for an Existing Worktree

```bash
wtp list --no-sync
```

If a worktree for the branch already exists, reuse it: `wtp cd <branch>` prints its path.

### 2. Create the Worktree

Run from anywhere inside the repository:

```bash
# New branch from the current HEAD
wtp add -b <branch-name> --stay

# New branch from a specific commit or branch
wtp add -b <branch-name> --stay main

# Existing local or remote branch
wtp add <branch-name> --stay
```

`--stay` stops `wtp` from trying to change the shell's directory, which agents can't use. `wtp` prints the new location. Get it at any time with:

```bash
path="$(wtp cd <branch-name>)"
```

Each bash call runs in a fresh shell, so pass `$path` as the working directory or use absolute paths rather than relying on `cd`. To run one command inside the worktree:

```bash
wtp exec <branch-name> -- <command> [args...]
```

Project-specific setup hooks live in the repository's `.wtp.yml` and run automatically on `wtp add`. Don't duplicate them.

### 3. Run Project Setup

If the repository has no `.wtp.yml` hooks, detect and run the appropriate setup in the worktree:

```bash
# Node.js
if [ -f package.json ]; then npm install; fi

# Rust
if [ -f Cargo.toml ]; then cargo build; fi

# Python
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi

# Go
if [ -f go.mod ]; then go mod download; fi
```

### 4. Verify Clean Baseline

Run tests to make sure the worktree starts clean:

```bash
# Examples - use project-appropriate command
npm test
cargo test
pytest
go test ./...
```

**If tests fail:** Report failures, ask whether to proceed or investigate.

**If tests pass:** Report ready.

### 5. Report Location

```
Worktree ready at <full-path>
Tests passing (<N> tests, 0 failures)
Ready to implement <feature-name>
```

## Removing Worktrees

```bash
wtp remove <branch-name>                 # Remove worktree and delete its (merged) branch
wtp remove --keep-branch <branch-name>   # Remove worktree, keep the branch
wtp remove --force-branch <branch-name>  # Also delete an unmerged branch
```

`wtp remove` deletes the branch by default. Pass `--keep-branch` whenever the branch still matters, such as an open PR. Only use `-f`/`--force` (dirty worktree) or `--force-branch` (unmerged branch) after the user confirms.

## Quick Reference

| Situation | Action |
|-----------|--------|
| List worktrees | `wtp list --no-sync` |
| New branch | `wtp add -b <branch> --stay` |
| Existing branch | `wtp add <branch> --stay` |
| Path to a worktree | `wtp cd <branch>` |
| Path to the root worktree | `wtp cd @` |
| Run a command in a worktree | `wtp exec <branch> -- <cmd>` |
| Done, branch merged | `wtp remove <branch>` |
| Done, branch still needed | `wtp remove --keep-branch <branch>` |
| Tests fail during baseline | Report failures + ask |

## Common Mistakes

### Using raw git worktree commands

- **Problem:** Worktrees end up in ad-hoc directories (`.worktrees/`, `../worktree-x`) that humans and other agents can't find, and `.wtp.yml` hooks don't run
- **Fix:** Always use `wtp add` and `wtp remove`

### Deleting a branch that's still needed

- **Problem:** `wtp remove` deletes the branch by default
- **Fix:** Use `--keep-branch` when the branch has an open PR or the user wants to keep it

### Relying on `cd`

- **Problem:** Each shell call is independent, so a `cd` into the worktree doesn't carry over
- **Fix:** Use `wtp cd <branch>` to resolve the absolute path and pass it explicitly

### Proceeding with failing tests

- **Problem:** Can't distinguish new bugs from pre-existing issues
- **Fix:** Report failures, get explicit permission to proceed

## Example Workflow

```
You: I'm using the using-git-worktrees skill to set up an isolated workspace.

[wtp list --no-sync - no worktree for feature/auth]
[wtp add -b feature/auth --stay]
[path=$(wtp cd feature/auth)]
[Run npm install in $path]
[Run npm test in $path - 47 passing]

Worktree ready at <path>
Tests passing (47 tests, 0 failures)
Ready to implement auth feature
```

## Red Flags

**Never:**
- Run `git worktree add` or `git worktree remove` directly
- Choose a worktree directory yourself
- Force-remove a dirty worktree or unmerged branch without confirmation
- Skip baseline test verification
- Proceed with failing tests without asking

**Always:**
- Create and remove worktrees with `wtp`
- Resolve paths with `wtp cd <branch>`
- Verify clean test baseline

## Integration

**Called by:**
- **grilling** - when design is approved and implementation follows
- **executing-plans** - before executing any tasks
- Any skill needing isolated workspace

**Pairs with:**
- **finishing-a-development-branch** - for cleanup after work complete
