---
description: Fix a GitHub issue by number
argument_hint: "<issue-number>"
---

Fetch a GitHub issue and implement a fix for it.

Arguments:

- `$ARGUMENTS`: Required. The GitHub issue number (e.g., "123" or "#123")

Process:

1. Fetch the issue details:
   ```bash
   gh issue view <number> --json title,body,labels,comments
   ```

2. Analyze the issue:
   - Understand what's being requested or what bug is reported
   - Check labels for context (bug, feature, enhancement, etc.)
   - Review any comments for additional context or constraints
   - Identify acceptance criteria if specified

3. Explore the codebase:
   - Find relevant files mentioned in the issue
   - Understand the current implementation
   - Identify where changes need to be made

4. Plan the fix:
   - Break down the work into steps
   - Consider edge cases mentioned in the issue
   - Think about testing requirements

5. Implement the fix:
   - Make the necessary code changes
   - Follow existing code patterns and style
   - Keep changes focused on the issue scope

6. Verify the fix:
   - Run relevant tests
   - Check that the acceptance criteria are met
   - Ensure no regressions

7. Summarize what was done:
   - List files changed
   - Explain the approach taken
   - Note any follow-up items or considerations

Do not create a PR. Let the user review the changes and decide when to open one. In a linked worktree, commit as you go. In the repository's root worktree, do not commit.

If the issue number is not provided or the issue cannot be found, ask for clarification.
