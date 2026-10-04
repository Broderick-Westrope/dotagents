---
description: Create or improve documentation (routes to appropriate doc agent)
argument_hint: "<file-path-or-doc-type>"
---

Create or improve documentation by routing to the appropriate agent with instructions.

Arguments:

- `$ARGUMENTS`: File path, doc type, or description of documentation needed

## Routing Logic

Analyze the arguments and context to determine which instructions to pass:

**Use CODE COMMENT instructions** (delegate to the **haiku** agent):

- Single source code file path provided (`.ts`, `.js`, `.py`, `.go`, `.rs`, etc.)
- Request mentions "comments", "inline docs", or "code comments"
- Task is auditing/cleaning up comments in a single file
- Task is asking to clean up comments in a group of files: find changed files via `git status -s` or by scoping to the folder the user specified

**Use DOCUMENTATION instructions (spawn general subagent):**

- Markdown file path provided (`.md`)
- Request mentions README, API docs, architecture, or `/docs/`
- Task spans multiple files or requires system-level understanding
- Request is for new documentation (guides, references, etc.)

## Process

1. **Parse arguments**: Determine what the user wants documented
2. **Detect scope**:
   - If file path provided, check extension and file type
   - If no path, analyze the request description
3. **Route appropriately**:
   - Delegate to the **haiku** agent with code comment instructions for single-file work
   - Spawn a general subagent with documentation instructions for complex work
4. **If ambiguous**: Ask user to clarify scope before proceeding

## Code Comment Instructions

Pass these instructions to the **haiku** agent for single-file code comment work:

<prompt_instructions>
You are auditing and improving inline documentation within source code files.

FIRST: Load the **documentation** skill and read its references/code-comments.md.

WORKFLOW:

1. Read target file completely, identify language and patterns
2. Audit comments using skill's checklist - categorize each comment
3. Apply fixes: remove unnecessary comments, rewrite unclear ones
4. Report changes: summarize removals, rewrites, and suggested refactors

SCOPE: Only handle inline code comments. If asked about markdown files, README, or /docs/ content, report that this requires a different scope.

OUTPUT: Be direct and concise. Prioritize actionable changes over explanations. When suggesting refactors, show specific code changes that would eliminate the need for a comment.
</prompt_instructions>

## Documentation Instructions

Spawn a general-purpose subagent with these instructions for markdown/multi-file documentation:

<prompt_instructions>
You are creating technical documentation that requires understanding of system context.

FIRST: Load the **documentation** skill and read its references/systems.md.

TASK-SPECIFIC WORKFLOWS:

API Documentation:

1. Read source files, types, route definitions, error handling paths
2. Plan structure using skill's progressive disclosure layers
3. Write {resource-name}.md in /docs/api/
4. Cross-reference related endpoints and guides

README Updates:

1. Audit existing README.md, package.json, configs, entry points
2. Update: quick start within first 30 lines, installation, config, links to /docs
3. Verify all code examples are runnable

Architecture Documentation:

1. Read core modules, trace dependencies, identify design decisions
2. Document decisions focusing on WHY, not just WHAT
3. Add diagrams using the **visualizing-with-mermaid** skill for flows
4. Write docs in /docs/architecture/

LOCATION STANDARDS:
| Doc Type | Location | Filename Pattern |
| ------------------- | --------------------- | -------------------- |
| Project overview | Root | README.md |
| API reference | /docs/api/ | {resource-name}.md |
| Architecture | /docs/architecture/ | {topic}.md |
| Guides/How-to | /docs/guides/ | {topic}.md |
</prompt_instructions>

## Examples

| Input                                                  | Routes To     |
| ------------------------------------------------------ | ------------- |
| `/document src/utils/auth.ts`                          | **haiku** agent     |
| `/document clean up code comments in unstaged changes` | **haiku** agent     |
| `/document README`                                     | general agent |
| `/document API docs for /users endpoint`               | general agent |
| `/document clean up comments in parser.py`             | **haiku** agent     |
| `/document architecture overview`                      | general agent |
