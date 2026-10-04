# wtp pruning: cleanup reference

Read this before acting on anything `/wtp-pruning` reported. The command itself is read-only. This file covers what to do once the user asks for cleanup.

## Ground rules

- **Only act on the classifications the user named.** "Clean up the merged ones" means `merged-complete`, not `merged-with-extras` or `superseded`. If the scope is ambiguous, list exactly which worktrees you would remove and confirm first.
- **Re-verify right before removing.** The survey may be stale. Fetch again and recheck the criteria for each worktree immediately before its `wtp remove`.
- **Never touch remote branches.** Cleanup is local only: no `git push --delete`, and no closing of PRs.
- **Never delete the default branch.** If a worktree is checked out on `main` or `master`, use `--keep-branch`.
- **Never bulk-delete directories under the wtp root.** See "Leftover directories" below. A `find ... -empty -delete` over the wtp root descends into the *remaining* worktrees and strips empty directories from `node_modules`, `.terraform` and `.devenv`. That loses nothing tracked by git, but it breaks installed dependencies.
- **Report what was kept and why**, alongside what was removed.

## How to remove

`wtp remove` must be run from the worktree's main repository, not from inside the worktree:

```bash
main=$(dirname "$(git -C "$wt" rev-parse --path-format=absolute --git-common-dir)")
cd "$main" && wtp remove [flags] "<branch>"
```

| Flag | When |
|---|---|
| (none) | Removes the worktree and deletes the branch, but only if git considers the branch merged |
| `--force-branch` | The branch was squash- or rebase-merged, so `git branch -d` refuses even though the work is in main. Use it only after confirming containment (see below) |
| `-f` | The worktree is dirty and you have confirmed the changes are disposable noise |
| `--keep-branch` | Remove the worktree but keep the branch: default-branch checkouts, `foreign` branches, or anything with commits worth keeping |

Pass the **branch name**, not the directory name; they differ when the branch contains `/` or was renamed.

After each removal, verify both effects:

```bash
[ -d "$wt" ] && echo "DIR REMAINS"
git -C "$main" show-ref -q --verify "refs/heads/<branch>" && echo "BRANCH REMAINS"
```

## Containment check (required before `--force-branch`)

A branch is fully included in a merged PR when the local HEAD is an ancestor of the PR's final head commit:

```bash
oid=$(gh pr view <n> --repo <owner/repo> --json headRefOid --jq .headRefOid)
git -C "$wt" fetch -q origin "pull/<n>/head"
git -C "$wt" merge-base --is-ancestor HEAD "$oid" && echo contained
git -C "$wt" rev-list --count "$oid"..HEAD        # must be 0
```

If the PR head can't be fetched, fall back to the content check: `git merge-tree --write-tree <default> HEAD` gives the same tree as `<default>^{tree}`. When the two checks disagree, treat the branch as **not** contained.

## Handling each classification

### `merged-complete`

Safe. Run `wtp remove --force-branch <branch>`, adding `-f` only if every dirty path is noise (see "Dirty state triage"). This is the default target of "clean up merged PRs".

### `merged-with-extras`

**Keep by default.** Show the user the extra commits (`git log --oneline <pr-head>..HEAD`) or the dirty paths. Common cases:

- **Post-merge experiments or follow-up commits:** these may deserve their own PR.
- **Uncommitted notes files** (review notes, scratch plans): ask whether to move them somewhere before removal.
- **Regenerated artifacts only** (e.g. `*.pb.go` rebuilt with a different toolchain): usually disposable, but confirm first.

Remove only with explicit consent, and use `--keep-branch` if the extra commits might matter.

### `no-unique-commits`

Safe. Nothing on the branch is missing from main; these are typically verification, baseline or scratch worktrees. Use `wtp remove <branch>`, adding `--force-branch` if git still refuses, since content equality is enough. If the worktree is on the default branch, use `--keep-branch`.

### `superseded`

**Verify before removing.** Diff the branch against main and confirm that the replacement PR carried the same intent:

```bash
git -C "$wt" diff <default>...HEAD --stat
git -C "$wt" diff <default> HEAD -- <key files>
```

A replacement PR often covers *most* but not all of the work (e.g. it registered three of five new brands). Report any remaining delta. Remove only if nothing meaningful remains, or if the user agrees to drop it. If there is a delta, prefer `--keep-branch`.

### `closed-unmerged`

**Ask.** The PR was abandoned and the work isn't in main. Options to offer:

- Keep it as is.
- Remove the worktree but keep the branch (`--keep-branch`) so the commits stay recoverable.
- Delete both (`--force-branch`), but only on explicit instruction.

### `unpushed-work`

**Ask.** These commits exist nowhere else. Unless the user says to discard them, the safe default is to keep the branch: push it or `--keep-branch`. Never use `--force-branch` here without explicit instruction naming the worktree.

### `open-stale`

**Do not remove.** The PR still references the branch. Suggest that the user either revive or close the PR. If they close it, the worktree becomes `closed-unmerged` on the next survey.

### `foreign`

Use `--keep-branch` at most. The branch belongs to someone else and may still matter to them. Removing the local worktree is fine if the user no longer needs a local checkout.

### `broken`

The worktree's `gitdir:` points at a main repository that no longer exists at that path, usually because the repo was moved.

1. Find where the repo lives now. Try `zoxide query -l <repo>`, then match `git remote get-url origin` in the candidates. The `.git/worktrees/<name>` entry should exist in the new location.
2. Repair the link: `git -C <new-main> worktree repair "<wt-path>"`. It may print `.git file broken` and still fix the link, so verify with `git -C "<wt-path>" status` and `git -C <new-main> worktree list`.
3. Once git works, re-check the worktree as if it were new (dirty state, unique commits, PR) and handle it under its real classification.
4. If the repo can't be found anywhere, the worktree's commits live only in a repo you can't reach. Report it and stop. `git worktree prune` from the new main only clears dangling metadata; it never recovers work.

### `active`

Leave it alone.

## Dirty state triage

| Status | Typical meaning | Disposable? |
|---|---|---|
| ` D` on tracked setup files (mocks, patches, deployment yaml) | Files that wtp's setup hook never copied into the worktree | Yes, they're still in git |
| ` M` on generated code (`*.pb.go`, lockfiles) | Regenerated with a different toolchain | Usually, but confirm |
| ` M` on source files | Real in-progress work | **No** |
| `??` notes or markdown (`*_NOTES.md`, plans) | Human working notes | **No**, ask |
| `??` directories of scripts or tooling | Experiments | **No**, ask |
| `D ` (staged deletion) together with `??` | A move in progress | **No** |

Only use `-f` when every path in `git status --porcelain` is disposable.

## Leftover directories

Removing a worktree whose branch contains `/` (e.g. `feat/foo`) can leave an empty parent (`.../<repo>/feat/`). Clean up by walking up from the removed path only, stopping at the first non-empty directory or the wtp root:

```bash
ROOT="$HOME/Library/Application Support/wtp/worktrees"
dir=$(dirname "$wt")
while [ "$dir" != "$ROOT" ] && rmdir "$dir" 2>/dev/null; do dir=$(dirname "$dir"); done
```

`rmdir` refuses non-empty directories, so this never touches other worktrees. Do not use `find -empty -delete` or any recursive delete under the wtp root.

## Final report

After cleanup, report:

1. **Removed** worktrees, plus whether each branch was deleted (and whether that needed `--force-branch`).
2. **Kept** worktrees, with the specific reason (extra commits, real dirty work, closed PR, default branch).
3. **Anything unexpected**: failed removals, repairs, or branches left behind.

Remote branches are untouched; say so explicitly.
