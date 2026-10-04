---
description: Audit and upgrade project dependencies
argument_hint: "[audit|upgrade|outdated]"
---

**DELEGATION ONLY**: Do NOT run any commands or investigate the codebase yourself. Your only job is to immediately delegate to the **haiku** agent as a subagent, passing the prompt template below with `$ARGUMENTS` substituted.

## Subagent Prompt for Haiku

```
Manage project dependencies.

User arguments: $ARGUMENTS
Default action: audit (alternatives: upgrade, outdated)

**Step 1: Detect the package manager**
- package.json (npm/yarn/pnpm)
- requirements.txt or pyproject.toml (pip/poetry)
- Cargo.toml (cargo)
- go.mod (go)
- Gemfile (bundler)

**Step 2: Execute based on action**

For **audit** (default):
- Run security audit (npm audit, pip-audit, cargo audit, etc.)
- Identify vulnerabilities by severity (critical, high, medium, low)
- Report affected packages and recommended fixes
- Check for deprecated packages

For **outdated**:
- List packages with available updates
- Show current vs latest versions
- Highlight major version bumps that may have breaking changes
- Note packages that are significantly behind

For **upgrade**:
- Show what would be upgraded
- Separate safe updates (patch/minor) from risky ones (major)
- Suggest running tests after upgrades
- For major upgrades, check changelogs for breaking changes

**Step 3: Provide actionable recommendations**
- Priority order for fixes (critical security first)
- Commands to run for each fix
- Warn about potential breaking changes

**Output Format:**

## Security Vulnerabilities
[List by severity with affected packages]

## Outdated Packages
[Table: package | current | latest | type of update]

## Recommendations
[Prioritized list of actions]
```
