# Classifier prompt

Send one copy per chunk, replacing `{CHUNK}` and `{LEDGER}`. Use `@explorer`. All chunks go in one batch.

```
You are mining past AI-agent sessions for user corrections. Read the whole of {CHUNK} in pieces (view with offset/limit) until you reach the end. Each entry has the tail of the agent's reply and the user's next message. The entries are keyword-filtered, so most are NOT corrections: skip new tasks, questions, approvals and clarifications of intent.

A correction is the user telling the agent it chose wrong on HOW: style, conventions, architecture, naming, tests, comments, prose, PR or commit shape, tool or workflow choice, scope, verification, or acting without permission. Questions like "why did you add X?" count when the context shows the user disapproves.

Read {LEDGER} first if it exists, and reuse its theme names when a correction fits an existing theme.

Output markdown, no preamble:

1. Table: id | date | session | repo | theme | rule (imperative, reusable) | quote (verbatim, under 20 words)
2. Theme counts: theme | count | ids | existing or NEW
3. For each NEW theme, the enforcement rung you would pick (see ladder below) and why.

Ladder, highest first: delete-the-need (architecture or config), type, lint or formatter, hook or permission, test, golden example, skill rule, CLAUDE.md or agent prompt.

Don't invent corrections. Don't count the same correction twice when the user repeats it in consecutive turns; note the repeat in the quote column instead.
```
