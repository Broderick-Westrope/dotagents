---
description: Identify knowledge gaps in the repo's memory file and collect human context
argument_hint: "[path-to-memory-file]"
---

Analyze the codebase to identify documentation gaps, collect human knowledge, and enhance the repository's memory file with context that can't be inferred from code.

## Workflow

### Step 1: Locate the Memory File

Anvil reads `AGENTS.md`, `ANVIL.md`, `CLAUDE.md`, and `GEMINI.md` as repository memory files.

**If `$ARGUMENTS` is provided:**
- Use the provided path

**If `$ARGUMENTS` is empty:**
- Check the project root (and the parent, if in a subdirectory) for `AGENTS.md`, `ANVIL.md`, `CLAUDE.md`, and `GEMINI.md`
- Prefer an existing one

**If not found:**
- Default to creating `AGENTS.md` at the project root, unless the user specifies another path

### Step 2: Analyze Gaps

Do the analysis yourself, delegating broad discovery to the **explorer** agent:

1. Explore codebase structure, dependencies, patterns, and configurations
2. Read the existing memory file (if present) to see what's already documented
3. Identify high-impact knowledge gaps across 7 categories:
   - Business Context (problem, users, workflows)
   - Architectural Rationale (tech choices, why)
   - External Integrations (APIs, auth, quirks)
   - Domain Logic (business rules, state machines)
   - Known Issues & Debt (limitations, gotchas)
   - Team Conventions (PR process, testing philosophy)
   - Development Environment (setup, debugging)

4. Produce a structured analysis with:
   - Summary of gaps by priority (critical/important/nice-to-have)
   - 5-7 specific recommended questions with code context
   - Suggested memory file section structure

Focus on gaps that:
- Can't be deduced from reading code
- Would cause real onboarding friction
- Are specific and actionable

### Step 3: Present Gap Analysis

Show the user what you found:

```markdown
## Knowledge Gap Analysis

I identified ${COUNT} documentation gaps:
- ${CRITICAL_COUNT} critical (would block developers)
- ${IMPORTANT_COUNT} important (would cause confusion)

### Critical Gaps
${LIST_CRITICAL_GAPS}

### Important Gaps
${LIST_IMPORTANT_GAPS}
```

### Step 4: Collect Answers

**Ask a single plain question listing all the proposed additions:**

"Here are the questions identified by the gap analysis. Please provide answers for any you'd like to document (you can skip any that aren't applicable):

**1. [Category]** - [Question with code context]

**2. [Category]** - [Question with code context]

...

**7. [Category]** - [Question with code context]

Please answer with: `1: [your answer]` or `Q1: [your answer]` format, or just provide free-form text with question numbers."

**Parse user's free-form response:**
- Look for numbered patterns: "1:", "Q1:", "Question 1:", "1."
- Allow multi-line answers
- Track which questions got answers vs were skipped
- Be flexible with formatting (users may answer in various styles)

### Step 5: Generate Enhanced Sections

For each answered question, generate a memory file section:

**Section format:**
```markdown
## ${SECTION_TITLE}
<!-- Added by audit-context on ${DATE} -->

${CONTENT_FROM_USER_ANSWER}

**Related code:** ${FILE_PATHS_FROM_ANALYSIS}
```

**Section mapping** (use the suggested structure from Step 2):
- Business Context questions -> "## Business Domain" or "## Problem & Users"
- Architectural questions -> "## Architecture & Key Decisions"
- Integration questions -> "## External Integrations"
- Domain Logic questions -> "## Domain Model" or "## Core Workflows"
- Known Issues questions -> "## Known Limitations" or "## Technical Debt"
- Conventions questions -> "## Development Workflow" or "## Team Practices"
- Environment questions -> "## Setup & Troubleshooting"

### Step 6: Merge into the Memory File

**If the memory file exists:**
- Use `edit` to insert new sections at appropriate locations
- Follow the suggested structure for placement
- Preserve all existing content
- Add sections after existing similar sections or at end

**If creating a new memory file:**
- Use `write` to create the complete file with:
  - Project header (name from package.json/pyproject.toml)
  - Overview section (generated from answered questions)
  - New sections from user answers
  - Quick commands section (if manifest has scripts)

### Step 7: Confirm with User

Present summary of changes:

```markdown
## Context Audit Complete

**Updated:** ${MEMORY_FILE_PATH}

**Sections added/enhanced:**
- ${SECTION_1} (from question ${Q_NUM})
- ${SECTION_2} (from question ${Q_NUM})
- ${SECTION_3} (from question ${Q_NUM})

**Questions answered:** ${ANSWERED_COUNT} of ${TOTAL_COUNT}
**Questions skipped:** ${SKIPPED_COUNT}

The enhanced memory file now includes human context on:
- ${CATEGORY_1}
- ${CATEGORY_2}
- ${CATEGORY_3}

Run `/audit-context` again anytime to identify new gaps.
```

## Error Handling

**If the memory file path is invalid:**
- Show error: "Memory file not found at ${PATH}"
- Ask user to provide correct path or create new file

**If analysis fails:**
- Show error: "Failed to analyze codebase"
- Check if project root is correct
- Verify codebase has analyzable files

**If user skips all questions:**
- Ask: "All questions were skipped. Would you like to see the full gap analysis instead?"
- If yes, display the complete analysis
- If no, exit without changes

**If `edit`/`write` fails:**
- Show error with file path and permission issue
- Ask user to check file permissions
- Offer to output generated sections to stdout instead

## Notes

- Questions are limited to 5-7 to respect user time
- Users can skip any question - partial information is valuable
- Generated content is marked with HTML comments for tracking
- Adapt question relevance to project type (CLI vs web app vs library)
