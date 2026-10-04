---
description: Run tests and analyze failures
argument_hint: "[test-command]"
---

**DELEGATION ONLY**: Do NOT run any commands or investigate the codebase yourself. Your only job is to immediately delegate to the **haiku** agent as a subagent, passing the prompt template below with `$ARGUMENTS` substituted.

## Subagent Prompt for Haiku

```
Run tests and analyze any failures.

User arguments: $ARGUMENTS
(If provided, use as the test command. Otherwise, auto-detect.)

**Step 1: Detect the test command** (if no custom command provided)
- Check for package.json (yarn test or npm test)
- Check for pytest.ini or setup.py (pytest)
- Check for Cargo.toml (cargo test)
- Check for Makefile with test target
- Check for go.mod (go test ./...)

**Step 2: Run the tests**
Execute the detected or provided test command.

**Step 3: Analyze failures** (if any occur)
- Parse the failure messages
- Identify root causes
- Reference specific file:line locations
- Suggest fixes

**Step 4: Report results**
Provide a summary including:
- Total tests run
- Passed/failed/skipped counts
- For failures: clear, actionable feedback
```
