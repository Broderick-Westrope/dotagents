---
description: Create a pull request with auto-generated description
argument_hint: "[base-branch]"
---

Create a pull request for the current branch.

User arguments: $ARGUMENTS
(If provided, use as the base branch. Otherwise, default to main or master.)

The user invoking /pr is the explicit request to push this branch and open a PR.

**Step 1: Check Prerequisites**
- Run `git branch --show-current`, `git rev-parse --git-dir`, and `git rev-parse --git-common-dir`
- If the current branch is the default branch (main/master), or this is the root worktree (`--git-dir` equals `--git-common-dir`) on main/master, STOP and tell the user to move the work onto a feature branch using the **using-git-worktrees** skill rather than creating a PR from main
- Run `git status` to check for uncommitted changes
- If there are uncommitted changes, STOP and report: "Please commit your changes first before creating a PR"
- Run `git remote -v` to verify remote exists
- Check if branch is pushed: `git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null`
- If not pushed, push with: `git push -u origin $(git branch --show-current)`

**Step 2: Determine Base Branch**
- If user provided a base branch in arguments, use that
- Otherwise, detect default: check for `main` first, fall back to `master`
- Run: `git rev-parse --verify origin/main 2>/dev/null && echo main || echo master`

**Step 3: Gather Context**
- Get merge base: `BASE_BRANCH=<detected>; MERGE_BASE=$(git merge-base HEAD origin/$BASE_BRANCH)`
- List commits: `git log $MERGE_BASE..HEAD --oneline`
- Get diff stats: `git diff $MERGE_BASE..HEAD --stat`
- Get full diff for analysis: `git diff $MERGE_BASE..HEAD`

**Step 4: Analyze & Generate PR Content**

Follow **The Contributor** persona from the **writer** skill for PR conventions.

Analyze the commits and diff to determine:
- The type of change (feat, fix, refactor, docs, etc.)
- The primary purpose/intent of the changes
- Key modifications worth highlighting

Generate a **Title** using conventional format (50 chars max, imperative mood):
- `feat: add user authentication flow`
- `fix: resolve race condition in data sync`
- `refactor: simplify payment processing logic`

Generate a PR **Body** using this template:

<template>

## Summary

[2-3 sentences explaining what this PR does and why]

## Changes

- [Bullet list of key changes]

## Testing

- [ ] Tests added/updated

## Notes

[Any additional context for reviewers, or "None" if not applicable]

</template>

**Step 5: Create the PR**
Execute:
`gh pr create --title "<title>" --body "<body>" --base <base-branch>`

Use a heredoc for the body to preserve formatting:
```bash
gh pr create --title "<title>" --base <base-branch> --body "$(cat <<'EOF'
<body content here>
EOF
)"
```

**Step 6: Report Results**

- Print the PR URL returned by `gh pr create`
- Note any warnings (e.g., draft status, failing checks visible in output)

**Failure Handling**

- If `gh` is not installed: Report "GitHub CLI (gh) is required. Install with: brew install gh"
- If not authenticated: Report "Please authenticate with: gh auth login"
- If PR creation fails: Report the error message from gh
