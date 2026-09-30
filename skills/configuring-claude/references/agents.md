# Agent Capabilities Reference

Agents are expert AI personas that execute tasks autonomously. This reference documents what agents can and cannot do, for command authors who delegate work to agents.

## Core Principle

**Agents are autonomous executors, not interactive assistants.**

- They execute once with a prompt and tools
- They cannot ask users questions
- They return structured output when done
- Commands handle all user interaction

## Agent Tool Access

| Agent | Available Tools | Purpose |
|-------|----------------|---------|
| context-auditor | Glob, Grep, Read, Bash | Analyze codebase for documentation gaps |
| code-reviewer-opus | Bash, Glob, Grep, Read, TodoWrite | Deep, nuanced code review (Opus model) |
| code-reviewer-sonnet | Bash, Glob, Grep, Read, TodoWrite | Fast, broad code review (Sonnet model) |
| haiku | Bash, Read, Edit, Write, Grep, Glob | Fast, delegated tasks from other commands |
| log-reader | Read, Grep, Glob, Bash | Analyze large log files efficiently |

**Note:** No agent has access to AskUserQuestion. User interaction is always handled by commands.

## Agent Workflow Pattern

**Standard flow:**
```
Command → Invokes agent with prompt → Agent executes → Returns output → Command parses → Command interacts with user
```

**Not this:**
```
Command → Invokes agent → Agent asks user questions → ERROR
```

## context-auditor Agent

**What it does:**
- Analyzes codebase structure and patterns
- Reads existing documentation
- Identifies knowledge gaps (what's missing)
- Generates targeted questions for user

**What it outputs:**
```markdown
# Knowledge Gap Analysis

## Summary
[Project type, gap counts by priority]

## Critical Gaps
[Gaps that would block developers]

## Important Gaps
[Gaps that would cause confusion]

## Recommended Questions
1. **[Category]** - [Specific question with code context]
2. **[Category]** - [Question]
...

## Suggested CLAUDE.md Structure
[Section outline showing where answers should go]
```

**Output is reliable:**
- Always follows format if codebase is analyzable
- Questions reference actual code
- Structure is parseable markdown

**Command responsibilities:**
- Parse "Recommended Questions" section
- Present questions to user (via AskUserQuestion or manual mode)
- Collect answers
- Generate CLAUDE.md sections from answers

**Example delegation:**
```markdown
### Step 2: Invoke Agent

Launch `context-auditor` agent:

"Analyze codebase at ${PROJECT_ROOT}...
Output structured analysis with:
- Summary of gaps by priority
- 5-7 recommended questions
- Suggested CLAUDE.md structure"

### Step 3: Parse Agent Output

Extract from agent's markdown:
- The "Recommended Questions" section
- The "Suggested CLAUDE.md Structure"
- The "Summary"

### Step 4: User Interaction (COMMAND HANDLES THIS)

Present questions to user via AskUserQuestion or manual mode.
Collect answers.
```

## code-reviewer-opus / code-reviewer-sonnet Agents

The `/ce:review` command launches both agents in parallel (Sonnet for speed/breadth, Opus for depth/nuance), then deduplicates and merges their findings. Both agents share identical review instructions.

**What they do:**
- Review code changes between branches
- Check technical quality, product impact, DX
- Enforce project standards
- Provide structured feedback by severity

**What they output:**
```markdown
# Code Review

## Critical Issues
[Must-fix before merge]

## Important Issues
[Should fix]

## Suggestions
[Nice to have improvements]

## Positive Observations
[What's done well]
```

**Output is reliable:**
- Always categorizes by severity
- References specific files/lines
- Follows consistent format

**Command responsibilities:**
- Pass branch names or commit range
- Launch both agents in parallel
- Deduplicate and merge findings
- Present unified review to user
- Optionally apply fixes

## haiku Agent

**What it does:**
- Fast execution of delegated tasks
- Used by other commands for sub-tasks
- Receives detailed instructions from commands

**What it outputs:**
- Varies by task (command specifies)
- Typically tool results or generated content

**Command responsibilities:**
- Provide complete, detailed instructions
- Specify exact output format needed
- Handle any errors

## log-reader Agent

**What it does:**
- Analyzes large log files efficiently
- Uses grep-style workflows (doesn't load full file)
- Filters by time, severity, patterns

**What it outputs:**
```markdown
# Log Analysis

## Summary
[Time range, log format detected, key findings]

## Errors Found
[Grouped errors with counts and examples]

## Patterns
[Recurring issues or anomalies]

## Recommendations
[What to investigate]
```

**Output is reliable:**
- Uses targeted search, not full file reads
- Groups similar entries
- Provides timestamps and context

**Command responsibilities:**
- Provide log file path
- Specify what to look for (errors, patterns, time range)
- Present findings to user

## Agent Output Validation

**Always validate agent output before using it:**

```markdown
### Step: Parse Agent Output

Extract sections from agent's markdown output.

**Check for expected sections:**
- "Recommended Questions" section must exist
- Section must have 1+ questions
- Each question has category and text

**If sections missing or malformed:**
- Show error: "Agent output format unexpected"
- Display raw agent output to user
- Ask user if they want to retry or proceed manually

**If sections found:**
- Parse and continue workflow
```

**Why validate:**
- Agent might fail to analyze codebase
- Output format might change
- Edge cases might break parsing

**Don't assume:**
- Agent always succeeds
- Output always follows format
- Sections always have content

## Handoff Boundaries

| Boundary | Agent Responsibility | Command Responsibility |
|----------|---------------------|----------------------|
| Analysis | Analyze code, find patterns, identify gaps | Parse analysis, decide what to do with it |
| Questions | Generate questions with code context | Present questions to user, collect answers |
| Validation | Validate own output format (self-check) | Validate received output before using |
| User interaction | Never (no AskUserQuestion access) | Always (via AskUserQuestion or manual mode) |
| Error handling | Return error output or partial results | Detect failures, provide fallbacks |

## Anti-Patterns

| Pattern | Problem | Fix |
|---------|---------|-----|
| Agent asks user questions | Agents can't access AskUserQuestion | Command handles all user interaction |
| Assume agent output format | Agent might fail or change format | Validate output before parsing |
| No error handling | Agent failures break command | Check for expected sections, handle missing data |
| Agent does everything | Can't interact with user mid-task | Agent analyzes, command interacts |
| Command duplicates agent work | Wastes tokens, slower execution | Let agent do analysis, command does interaction |

## When to Use Agents

**Use agents when:**
- Task requires codebase analysis
- Task is self-contained and autonomous
- Task produces structured output
- Command needs to interact with user about results

**Don't use agents when:**
- Task requires multiple rounds of user input
- Task is simple enough for direct tool calls
- Task needs real-time user decisions
- User interaction is the main workflow

**Example: Should I use an agent?**

**Good use case:**
- Command: `/ce:audit-context`
- Agent: Analyzes codebase, identifies gaps, generates questions
- Command: Presents questions, collects answers, generates docs
- Why good: Agent does heavy analysis, command handles interaction

**Bad use case:**
- Command: `/ce:fix-typo`
- Agent: Reads file, finds typo, asks user if fix is correct
- Why bad: Agent can't ask user questions; simple task doesn't need agent overhead

## Testing Agent Integration

Commands using agents should test:

**Happy path:**
- Agent executes successfully
- Output has expected format
- Command parses correctly
- User interaction works

**Agent failure path:**
- Agent returns error or incomplete output
- Command detects missing sections
- Command provides helpful error message
- User can retry or proceed manually

**Output variation path:**
- Agent output has unexpected structure
- Command validation catches it
- Command degrades gracefully

## Related Patterns

**Tool reliability:** Load `Skill(ce:configuring-claude)` and read `references/tool-reliability.md` for tool failure patterns

**Error handling:** Load `Skill(ce:handling-errors)` for error handling patterns

**Command design:** See `references/skills.md` for command structure guidelines
