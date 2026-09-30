# Tool Reliability Patterns

Commands that use interactive tools should handle failures gracefully. This reference documents reliability patterns learned from production incidents.

## The Silent Failure Problem

Some tools can fail without throwing errors. They return "success" with empty or malformed data.

**Example: AskUserQuestion failure**
```
// Tool call appears to succeed
AskUserQuestion(question)

// Function result claims success but has no data
"User has answered your questions: ."  // <- Empty after colon

// Claude continues as if questions were skipped
// User never saw the questions
```

**Impact:**
- Command workflow breaks silently
- User must identify and report the failure
- No automatic recovery

## Core Pattern: Validate Then Fallback

For any interactive tool (AskUserQuestion, external APIs, etc.):

```
1. Call the tool
2. Validate response contains expected data
3. If invalid → switch to fallback immediately
4. If valid → parse and use response
```

**Never assume tool success based on:**
- No error thrown
- Function results returned
- Exit code 0

**Always check:**
- Response has expected fields
- Fields contain actual data (not empty strings)
- Data format matches expectations

## AskUserQuestion Pattern

**Problem:** Tool can return empty responses without errors

**Detection:**
```
If response matches pattern "User has answered your questions: .":
  → Empty response field (nothing after colon)
  → Tool failed silently
  → Fallback required
```

**Solution:**
```markdown
### Step: Collect User Input

**Try interactive mode first:**
Use AskUserQuestion to present questions.

**Validate response:**
After receiving function results, check if response contains actual answer data.

If response is empty ("User has answered your questions: ."):
  - Tool failed silently
  - Switch to manual fallback immediately
  - Tell user: "The interactive tool isn't working. Let me show questions instead."

If response contains answer data:
  - Parse and record the answers
  - Continue with next question

**Manual fallback:**
Present all questions as formatted text in chat.
Parse user's free-form text responses.
```

## User Choice Pattern

**Better approach:** Offer both modes upfront

Instead of assuming interactive mode always works:

```markdown
### Step: Choose Input Method

Ask user: "I have 5 questions. How would you like to answer them?

1. **Interactive prompts** - One question at a time with UI
2. **Show all questions** - List them all, answer in chat

Which do you prefer?"

Based on user choice:
- If "Interactive prompts": Try AskUserQuestion (with validation)
- If "Show all questions": Use manual mode from start
```

**Benefits:**
- Respects user workflow preference
- Some users prefer bulk answers over one-at-a-time
- No wasted time if tool is broken

## Fallback Design

Good fallbacks should:

**Be equivalent in function:**
- Collect same information
- Produce same output format
- No loss of capability

**Be clearly communicated:**
- Tell user why you're falling back
- Explain new workflow
- Set expectations for format

**Be actually tested:**
- Commands should document both happy path and fallback path
- Test scenarios should include tool failure

## Anti-Patterns

| Pattern | Problem | Fix |
|---------|---------|-----|
| Trust tool success without validation | Silent failures break workflow | Always validate response content |
| No fallback option | Users stuck if tool fails | Provide manual alternative |
| Assume user saw interactive UI | Tool may not have shown UI | Check for actual response data |
| Single mode only | Forces tool use even when broken | Offer user choice upfront |
| Continue on empty response | Treats tool failure as "user skipped" | Detect empty responses explicitly |

## Testing Guidance

Commands should document:

**Happy path:**
- Tool works as expected
- User provides all inputs
- Command completes successfully

**Tool failure path:**
- Tool returns empty responses
- Fallback activates automatically
- User completes task via fallback

**User preference path:**
- User chooses manual mode from start
- Tool never called
- Same outcome as happy path

## Example: audit-context Command

**Before fix:**
```markdown
### Step: Collect Answers

Use AskUserQuestion to present each question.

For each question:
- Show question
- Collect answer
- Track responses
```

**Problem:** No validation, no fallback, assumes tool works

**After fix:**
```markdown
### Step: Choose Collection Mode

Ask user: "How would you like to answer?
1. Interactive prompts
2. Show all questions"

### Step 5a: Interactive Mode

Use AskUserQuestion.

**CRITICAL: Validate response**
If response is empty → Switch to Step 5b immediately

### Step 5b: Manual Mode

Present all questions as markdown.
Parse user's free-form answers.
```

**Improvement:** User choice, validation, automatic fallback

## When to Use This Pattern

**Apply this pattern when:**
- Command depends on interactive tools
- User input is critical to workflow
- Tool failure would break command
- Alternative input method exists

**Not needed when:**
- Tool failure throws errors reliably
- No user interaction required
- Bash commands with proper error handling
- File operations (Read/Write/Edit have reliable error handling)

## Related Patterns

**Error handling:** Load `Skill(ce:handling-errors)` for broader error handling patterns

**Verification:** Load `Skill(ce:verification-before-completion)` for validating command outcomes

**Command design:** See `references/skills.md` for command structure guidelines
