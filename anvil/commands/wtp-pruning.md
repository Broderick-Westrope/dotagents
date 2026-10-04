---
description: Classify wtp worktrees and flag the stale ones
argument_hint: "[repo or path filter]"
---

Survey every worktree managed by `wtp` and classify each one so the user can decide what to archive.

This command is **read-only**. Do not remove worktrees, delete branches, run `git worktree prune`/`repair`, delete directories, or run `wtp remove`. The only state-changing command allowed is `git fetch`. If the user asks for cleanup afterwards, read `~/dev/helse/claude-essentials/anvil/references/wtp-pruning.md` before running anything; it covers the removal rules for each classification.

Arguments:

- `$ARGUMENTS`: Optional. A substring to restrict the survey to (e.g. `eucalyptusvc`, `svc.core.ima`, `Broderick-Westrope/anvil`). Empty means every worktree.

## Step 1: Discover worktrees

wtp keeps worktrees under `~/Library/Application Support/wtp/worktrees/<host-or-org>/<owner>/<repo>/<branch>`. Branch names containing `/` nest deeper (e.g. `.../anvil/feat/embed-wtp`), so the directory name is not always the branch name.

A linked worktree's `.git` is a **file**. Match on files only, and prune dependency directories, which contain their own `.git` directories (Terraform modules, vendored packages):

```bash
ROOT="$HOME/Library/Application Support/wtp/worktrees"
find "$ROOT" \( -name node_modules -o -name .terraform -o -name vendor \) -prune -o -type f -name .git -print
```

Apply the `$ARGUMENTS` filter to the paths, then report how many worktrees you found.

## Step 2: Gather local signals

For each worktree, collect:

| Signal | How |
|---|---|
| Branch | `git rev-parse --abbrev-ref HEAD` (it may differ from the directory name) |
| Default branch | `git symbolic-ref --short refs/remotes/origin/HEAD`; fall back to `origin/main`. Some repos use `master` |
| Last commit date | `git log -1 --format=%cs` |
| Dirty state | `git status --porcelain`, split into tracked modifications, untracked files and ` D` deletions |
| Upstream | `git rev-parse --abbrev-ref @{u}`. Report `none`, a branch that is gone on the remote, or tracking `origin/main` (wtp sometimes sets this, which makes "ahead" counts misleading) |
| Unique commits | `git rev-list --count <default>..HEAD` |
| Ancestor of default | `git merge-base --is-ancestor HEAD <default>` |
| Patch-equivalent | `git cherry <default> HEAD`: `+` lines are commits whose changes are not in main |
| Content in main | `git merge-tree --write-tree <default> HEAD` gives the same tree as `<default>^{tree}`. This catches squash merges that ancestry checks miss |
| Repo | Parse `git remote get-url origin` to `owner/repo`. SSH host aliases such as `github.com-personal` are fine for `gh --repo owner/repo` |

Run `git fetch -q origin` first so the comparisons use current remote state.

If `git` fails inside a worktree (e.g. `fatal: not a git repository`), read the `.git` file. A `gitdir:` that points at a path that no longer exists means the main checkout moved. Classify the worktree as **broken** and continue.

For dirty worktrees, list the actual changed paths (`git status --porcelain | head`) so you can tell real work from noise:

- **Real work:** source edits, notes files (e.g. `PR_REVIEW_NOTES.md`), untracked plan or script directories.
- **Noise:** ` D` deletions of tracked setup files that were never copied in, regenerated artifacts such as `*.pb.go` or lockfiles, editor or devenv state.

## Step 3: Gather remote signals

Look up PRs for each branch:

```bash
gh pr list --repo <owner/repo> --head <branch> --state all \
  --json number,state,updatedAt,headRefOid
```

Limit parallelism to about 8 concurrent `gh` calls (e.g. `xargs -P 8`). Unbounded `&` fan-out fails with `bad file descriptor`.

When no PR matches by head branch but the worktree has unique commits, look for a **replacement** PR before calling the work unpushed. The work may have landed under a different branch. Search by ticket ID (e.g. `oll-522`) or by keywords from the last commit subject:

```bash
gh pr list --repo <owner/repo> --state all --search "<ticket-or-keywords>" --limit 5 \
  --json number,state,headRefName,title,updatedAt
```

For merged or closed PRs, check whether the PR contained everything on the local branch:

```bash
git fetch -q origin "pull/<n>/head"
git merge-base --is-ancestor HEAD <headRefOid>   # true = no local commits beyond the PR
git rev-list --count <headRefOid>..HEAD          # local commits the PR never saw
```

## Step 4: Classify

Give each worktree exactly one primary classification. Where several apply, use the first that matches in this order:

| Classification | Criteria |
|---|---|
| `broken` | The gitdir target is missing, or git cannot operate in the worktree |
| `merged-complete` | PR merged, local HEAD is contained in the PR head, and no real dirty work |
| `merged-with-extras` | PR merged, but there are local commits beyond the PR head or real dirty work |
| `no-unique-commits` | No PR needed: HEAD is an ancestor of the default branch, or its content is already in main (scratch, verification or baseline worktrees) |
| `superseded` | Its own PR is closed or missing, but a replacement PR with the same intent merged |
| `closed-unmerged` | PR closed without merging and no replacement found |
| `unpushed-work` | No upstream and no PR, but it has commits not in main |
| `open-stale` | PR open with no PR activity for more than 14 days |
| `foreign` | The branch belongs to someone else (e.g. an `<name>/` prefix that isn't the user's, or the PR author is someone else). Only the local worktree is the user's to drop |
| `active` | Commits or PR activity within the last 7 days, or an open PR with recent activity |

Also flag any worktree checked out on the default branch (e.g. `master`). Its branch must never be deleted.

## Step 5: Report

Group the results by recommendation, not by repo:

1. **Safe to archive**: `merged-complete`, `no-unique-commits`, `broken` (needs repair first). Show the PR number per worktree and any noise-only dirty state.
2. **Probably stale, but has work that isn't on GitHub**: `merged-with-extras`, `superseded`, `closed-unmerged`, `unpushed-work`. Use a table with the last commit date and the exact risk (e.g. "3 unpushed commits + modified `dao.go`").
3. **Open PRs that have gone quiet**: `open-stale`, with the last activity date.
4. **Foreign**: note that only the local worktree would go.
5. **Active**: give a count, not a list, unless there are fewer than 5.

Use repo-relative worktree names (e.g. `svc.core.ima/ima-verify-fixes`), not full paths. End by offering cleanup for one or more groups. Do not act until the user picks.
