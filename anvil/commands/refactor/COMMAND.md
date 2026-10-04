---
description: Refactor code following best practices
argument_hint: "<file-path-or-pattern>"
---

Refactor code to improve quality, maintainability, and adherence to best practices.

Arguments:

- `$ARGUMENTS`: File path, function name, or pattern to refactor. If not provided, refactors unstaged changes.

First, determine what code to refactor:

**If `$ARGUMENTS` is provided:**

- Use the provided file path, pattern, or user instructions directly

**If `$ARGUMENTS` is empty:**

- If there are unstaged changes, use those as the refactoring target
- If no unstaged changes, use the following command to detect the set of changed files: `git diff --name-only $([ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] && echo "HEAD^" || echo "main...HEAD")`

Once you have the target, load the **refactoring-code** skill with:

- A detailed prompt that includes:
  - What code to refactor (file paths, function names, or the diff of unstaged changes)
  - Any specific focus areas mentioned by the user
  - Instructions to follow the refactoring guidelines in the agent's prompt
