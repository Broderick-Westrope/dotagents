---
description: Create a well-formatted git commit for current changes
argument_hint: "[context]"
---

Create a git commit for the current changes.

User arguments: $ARGUMENTS
Default context: staged (use "unstaged" only if user specifies)

Load the **preflight-checks** skill.

Don't commit in the repository's root worktree (where `git rev-parse --git-dir` equals `git rev-parse --git-common-dir`) unless the user or a repository memory file explicitly says to. The user invoking /commit there counts as explicitly saying to.

1. **Gather context** (if you didn't just make these changes yourself in this conversation, or are unsure what changed and why):
   - `git log -n 10 --oneline` to learn the project's existing casing and scoping conventions
   - `git status` to see staged, unstaged, and untracked files
   - `git diff --cached` (for staged) or `git diff` (for unstaged) to read the code changes

2. **Stage by explicit path:**
   ```bash
   git add <path>...
   ```
   Never use `git add -A`, `git add .`, or `git commit -a`. Confirm with `git diff --cached --name-only` that the staged files match what you expect.

3. **Preflight checks:**
   Run preflight checks on staged files before committing. Fix formatting/lint issues, re-stage fixed files by path.

4. **Draft the message** following Conventional Commits (schema below):
   - Capture the *intent* of the change (Why was this done?), not just the syntax (What changed?)
   - Infer the **scope** from the directory name or module (e.g., `src/auth/login.ts` -> `auth`). Avoid file extensions in scopes

5. **Execute:**
   ```bash
   git commit -m "your_header" -m "your_body"
   ```
   Pass the header and body as separate `-m` flags for proper newline formatting.

6. **Handle pre-commit failure** (max 3 attempts):

   If `git commit` fails (exit code != 0):

   a. Parse the error output. Identify what failed: formatting, lint, type errors, or tests.

   b. **Auto-fix if possible:**
      - Formatters: run the formatter directly (`prettier --write`, `black`, `ruff format`, `gofmt -w`)
      - Linters with auto-fix: `eslint --fix`, `ruff check --fix`
      - Type errors / test failures: read the error, fix the code

   c. Re-stage fixed files by path and retry the commit.

   d. After 3 failed attempts, **escalate**:
      - Status: FAILED (after 3 attempts)
      - Attempts log: what was tried each round
      - Remaining errors: current error output
      - Drafted message: the commit message for when errors are resolved

## Commit Message Style

Follow **The Contributor** persona from the **writer** skill for commit message conventions.

**Quick reference:**
- Format: `<type>(<scope>): <subject>` + body
- Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`
- Header: 50 chars max, imperative mood, lowercase, no period
- Body: 72 char wrap, focus on WHY not WHAT
- Breaking: Use `feat!:` or `fix!:` prefix

**Important:**
- Include any attribution lines Anvil is configured to add; don't add any others.
- If the diff is massive, focus on the *primary* architectural change rather than listing every file
