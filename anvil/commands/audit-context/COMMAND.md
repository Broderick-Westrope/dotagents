---
description: Identify knowledge gaps in CLAUDE.md and collect human context
argument_hint: "[path-to-claude-md]"
---

Analyze the codebase to identify documentation gaps, collect human knowledge interactively, and enhance CLAUDE.md with context that can't be inferred from code.

## Workflow

### Step 1: Locate CLAUDE.md

**If `$ARGUMENTS` is provided:**
- Use the provided path

**If `$ARGUMENTS` is empty:**
- Check `./CLAUDE.md`
- Check `../ CLAUDE.md` (if in subdirectory)
- Check `.claude/CLAUDE.md`

**If not found:**
- Ask user if they want to create one from scratch or specify path

### Step 2: Invoke Gap Analysis Agent

Launch the **context-auditor** agent to analyze the codebase and existing documentation:

```
Analyze the codebase at ${PROJECT_ROOT} and identify knowledge gaps in documentation.

Read existing CLAUDE.md (if present) at: ${CLAUDE_MD_PATH}

Your task:
1. Explore codebase structure, dependencies, patterns, and configurations
2. Read existing CLAUDE.md to see what's already documented
3. Identify high-impact knowledge gaps across 7 categories:
   - Business Context (problem, users, workflows)
   - Architectural Rationale (tech choices, why)
   - External Integrations (APIs, auth, quirks)
   - Domain Logic (business rules, state machines)
   - Known Issues & Debt (limitations, gotchas)
   - Team Conventions (PR process, testing philosophy)
   - Development Environment (setup, debugging)

4. Output structured analysis with:
   - Summary of gaps by priority (critical/important/nice-to-have)
   - 5-7 specific recommended questions with code context
   - Suggested CLAUDE.md section structure

Focus on gaps that:
- Can't be deduced from reading code
- Would cause real onboarding friction
- Are specific and actionable

Your output will be parsed to extract questions for the user.
```

### Step 3: Parse Agent Output

Extract from the agent's structured output:
- The **Recommended Questions** section (numbered list 1-7)
- The **Suggested CLAUDE.md Structure** (section outline)
- The **Summary** (gap counts and priorities)

### Step 4: Present Gap Analysis and Choose Collection Mode

Show the user what the agent found:

```markdown
## Knowledge Gap Analysis

The agent identified ${COUNT} documentation gaps:
- ${CRITICAL_COUNT} critical (would block developers)
- ${IMPORTANT_COUNT} important (would cause confusion)

### Critical Gaps
${LIST_CRITICAL_GAPS}

### Important Gaps
${LIST_IMPORTANT_GAPS}
```

**Then ask user for their preferred answer collection method:**

"I have ${QUESTION_COUNT} questions to fill these gaps. How would you like to answer them?

1. **Interactive prompts** - I'll ask one question at a time with a UI
2. **Show all questions** - I'll list them all and you can answer in chat

Which do you prefer?"

**Based on user choice:**
- If "Interactive prompts": Proceed to Step 5a (interactive question mode)
- If "Show all questions": Proceed to Step 5b (Manual mode)

### Step 5a: Collect Answers (Interactive Mode)

Present each question from the agent's "Recommended Questions" list interactively.

**For each question:**
- Show the category and full question with code context
- Allow user to provide detailed answers
- Allow user to skip questions ("Not applicable" or "I don't know")
- Track which questions were answered vs skipped

**Example interactive question format:**

For each question, present the category and question text, then offer options:
- "Provide answer" - the user will type the context
- "Skip" - not applicable or unknown

**CRITICAL: Validate response after each question**

After receiving the user's response, check if it contains actual answer data:

```
If response is empty or unclear:
  - Switch to Step 5b (Manual fallback) immediately
  - Tell user: "Let me show all questions instead so you can answer them in chat."

If response contains answer data:
  - Parse and record the answer
  - Continue with next question
```

If user chooses "Provide answer", prompt for free-text response.

### Step 5b: Collect Answers (Manual Mode)

**Present all questions as formatted markdown:**

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

### Step 6: Generate Enhanced Sections

For each answered question, generate a CLAUDE.md section:

**Section format:**
```markdown
## ${SECTION_TITLE}
<!-- Added by context-auditor on ${DATE} -->

${CONTENT_FROM_USER_ANSWER}

**Related code:** ${FILE_PATHS_FROM_AGENT_CONTEXT}
```

**Section mapping** (use agent's suggested structure):
- Business Context questions -> "## Business Domain" or "## Problem & Users"
- Architectural questions -> "## Architecture & Key Decisions"
- Integration questions -> "## External Integrations"
- Domain Logic questions -> "## Domain Model" or "## Core Workflows"
- Known Issues questions -> "## Known Limitations" or "## Technical Debt"
- Conventions questions -> "## Development Workflow" or "## Team Practices"
- Environment questions -> "## Setup & Troubleshooting"

### Step 7: Merge into CLAUDE.md

**If CLAUDE.md exists:**
- Use Edit tool to insert new sections at appropriate locations
- Follow the agent's suggested structure for placement
- Preserve all existing content
- Add sections after existing similar sections or at end

**If creating new CLAUDE.md:**
- Use Write tool to create complete file with:
  - Project header (name from package.json/pyproject.toml)
  - Overview section (generated from answered questions)
  - New sections from user answers
  - Quick commands section (if manifest has scripts)

### Step 8: Confirm with User

Present summary of changes:

```markdown
## Context Audit Complete

**Updated:** ${CLAUDE_MD_PATH}

**Sections added/enhanced:**
- ${SECTION_1} (from question ${Q_NUM})
- ${SECTION_2} (from question ${Q_NUM})
- ${SECTION_3} (from question ${Q_NUM})

**Questions answered:** ${ANSWERED_COUNT} of ${TOTAL_COUNT}
**Questions skipped:** ${SKIPPED_COUNT}

The enhanced CLAUDE.md now includes human context on:
- ${CATEGORY_1}
- ${CATEGORY_2}
- ${CATEGORY_3}

Run `/audit-context` again anytime to identify new gaps.
```

## Error Handling

**If CLAUDE.md path is invalid:**
- Show error: "CLAUDE.md not found at ${PATH}"
- Ask user to provide correct path or create new file

**If agent analysis fails:**
- Show error: "Failed to analyze codebase"
- Check if project root is correct
- Verify codebase has analyzable files

**If interactive questions fail (Step 5a):**
- The user may not respond or the interaction may not work as expected
- Detect this by checking if the response contains actual answer data
- Immediately switch to Step 5b (Manual mode) as fallback
- Tell user: "Let me show all questions instead so you can answer them in chat."

**If user skips all questions:**
- Ask: "All questions were skipped. Would you like to see the agent's full gap analysis instead?"
- If yes, display the complete agent output
- If no, exit without changes

**If Edit/Write fails:**
- Show error with file path and permission issue
- Ask user to check file permissions
- Offer to output generated sections to stdout instead

## Notes

- Agent executes once and returns structured analysis
- Command handles all user interaction (agent cannot ask questions)
- Questions are limited to 5-7 to respect user time
- Users can skip any question - partial information is valuable
- Generated content is marked with HTML comments for tracking
- Agent adapts question relevance to project type (CLI vs web app vs library)
