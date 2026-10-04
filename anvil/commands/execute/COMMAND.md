---
description: Execute an implementation plan from the plans folder
argument_hint: "[plan-path] [--merge]"
---

Execute an implementation plan using the executing-plans skill.

Load the **executing-plans** skill first.

## Workflow

### If no arguments provided (`$ARGUMENTS` is empty):

1. **Find available plans:**
   Search recursively for plan files regardless of folder structure:
   ```bash
   glob ./**/plans/**/*.md
   glob ./**/plans/**/README.md
   glob ./plans/**/*.md
   glob ./plans/**/README.md
   ```

   Also check common alternative locations:
   ```bash
   glob ./**/*-PLAN.md
   glob ./**/*-plan.md
   ```

   **Identify plan files by:**
   - Files in any `plans/` directory at any depth
   - Files with `-PLAN.md` or `-plan.md` suffix
   - Files containing `> **Status:**` header pattern
   - For multi-file plans: `README.md` files that contain a phase table

2. **Filter to incomplete plans:**
   - Read each plan file
   - Check the `> **Status:**` header
   - Only show plans with status `DRAFT`, `APPROVED`, or `IN_PROGRESS`
   - Skip plans marked `COMPLETED`

3. **Present options:**
   List incomplete plans with their status and a brief description (from the User Story or first line of spec).

   Ask the user to select which plan to execute:
   ```
   Which plan would you like to execute?
   - [plan-1-name] (APPROVED) - Brief description
   - [plan-2-name] (IN_PROGRESS) - Brief description
   ```

4. **Load the selected plan** and proceed to execution prep below.

### If plan path provided (`$ARGUMENTS` has a value):

1. **Read the plan:**
   - If path ends in `.md`: single-file plan
   - If path is a directory or ends in `/`: multi-file plan, read `README.md`

2. **Verify plan exists and is executable:**
   - Check status is not `COMPLETED`
   - If `COMPLETED`, ask if user wants to re-execute

### Execution Prep (both paths):

1. **Review the plan:**
   - Display the specification and success criteria
   - Show the high-level task/phase breakdown
   - For multi-file plans, show the phase table with current progress

2. **Detect scaffolded tests (TDD mode):**
   - Check if the plan contains a `## Test Contract` section
   - If present, this plan has pre-scaffolded tests from `/scaffold-tests`
   - Note the test files and their locations — these become the **primary verification mechanism** for each task group
   - Tell the user: "This plan has scaffolded tests. I'll use them to verify each task group as I go."
   - During execution, after completing each task group, run its scaffolded tests. If tests fail, the task group is not done — fix until green.
   - The `## 4. Verify` step in the executing-plans skill still applies (automated tests, manual verification, DX quality, code review), but scaffolded tests are the first gate.

3. **Ask clarifying questions if needed:**
   - Ambiguous requirements
   - Missing context that can't be inferred
   - Unclear dependencies or ordering

4. **Set up a worktree:**
   Load the **using-git-worktrees** skill and follow it. If you're already in a linked worktree for this plan, work there. Otherwise create one on a branch named after the plan, e.g. `feat/<plan-name>`.

5. **Execute:**
   Follow the **executing-plans** skill workflow - it handles:
   - Dependency analysis and wave computation
   - Parallel task execution
   - Auto-recovery from errors
   - Progress tracking and status updates
   - Final verification and code review
   - Archiving completed plan to `plans/completed/`
   - Completion summary

### Post-Execution:

- **Without `--merge` (default):** report that the plan is complete and which branch and worktree hold the changes. Leave the worktree in place.
- **With `--merge`:** load the **finishing-a-development-branch** skill and follow its "Merge locally" option. The `--merge` flag is the user's choice of that option, so don't ask again.
