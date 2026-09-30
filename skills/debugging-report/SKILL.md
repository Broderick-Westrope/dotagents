---
name: debugging-report
description: Produce a structured debugging report documenting an investigation's findings, root cause, assumptions, and fix. Use when writing up the results of a debugging session, creating a bug investigation report, documenting a production incident investigation, or when the user asks for a debugging report, investigation summary, or wants to capture debugging findings in a structured document. Also use when the user says "make a debugging report", "write up the investigation", or "document what we found".
---

# Debugging Report

Produce a report on the investigation using exactly the structure below. Use the same section headings every time, in this order, even if a section is short. Never omit a section — if it doesn't apply, write "None" and say why.

**Output and lifecycle:**
- Write the report to a markdown file in the working directory: `./debugging-report-<short-slug>.md`.
- Treat it as a **living document**: as the discussion continues, fold new material into the correct section rather than appending — decisions and their rationale go in §7, new unknowns in §8, new evidence as numbered steps in §3 (and re-tag any §4/§5 claims it confirms or refutes).
- After **any** edit, verify the document's structure is intact: every heading below must be present, once, in order (`grep '^## ' <file>` is sufficient). Structural edits can silently consume adjacent headings.

Throughout the report, clearly distinguish between three kinds of statements:
- **[VERIFIED]** — something you directly observed (a log line, a reproduced failure, code you read)
- **[INFERRED]** — a conclusion you drew from evidence, but did not directly confirm
- **[ASSUMED]** — something you are taking as true without evidence

---

## Report Structure

ALWAYS use this exact template, in this order:

### 0. Plain-English Summary

A self-contained explanation for a reader who has **not** worked on this system and will not read the rest of the report. No jargon, no identifiers, no file paths — introduce any domain concept you rely on (one sentence each). Structure it as:

- **Background:** the minimum domain context needed (what the feature/flow does for the user/business).
- **The issue:** what is going wrong, in user/business terms.
- **Why it happens:** the cause as a short story, not a causal chain dump.
- **One sentence:** the entire root cause compressed to a single sentence.
- **The fix, in the same terms.**

Write this section **last**, after the technical sections are settled, but place it first. If the reader is known to be an expert on this exact system, this section may be brief — but never omit it; future readers won't be.

### 1. Verdict

One or two sentences: what the root cause was, and your confidence in the diagnosis — **High / Medium / Low**.

### 2. Symptom

What was reported or observed, in concrete terms: the exact error, the failing behaviour, when it started (if known), and how to reproduce it (if known). Quote exact error messages rather than paraphrasing them.

If the reporter gave a quantitative claim (count, rate, duration), measure it yourself and state **both numbers**. If they differ, flag the discrepancy explicitly here and carry it into §8 — do not silently substitute your measurement for the reported figure.

### 3. Investigation Trail

A chronological account of what you actually did, as a numbered list. Each step should follow the pattern:

> **Checked:** what you looked at → **Found:** what you saw → **Concluded:** what that told you

Include dead ends — steps that yielded nothing are still useful for the reader to know they were covered. Keep each step to 1–3 lines.

### 4. Root Cause Explanation

The full causal chain from root cause to observed symptom, written as a narrative a teammate could follow without re-doing the investigation: "X does A, which causes B, which under condition C produces the error seen in the symptom." Reference specific files, functions, line numbers, configs, or log entries wherever possible. Tag each link in the chain as [VERIFIED] or [INFERRED].

### 5. Load-Bearing Assumptions

This is the most important section. List every assumption your hypothesis depends on — the things that, if wrong, would invalidate the diagnosis. For each one:

- **Assumption:** the claim, stated precisely
- **Why I believe it:** the evidence or reasoning behind it (or "no direct evidence" if so)
- **How to verify:** a concrete check a human could run to confirm or refute it
- **If wrong:** what the diagnosis would shift to, or what would need re-investigation

Be honest and exhaustive here. An assumption you didn't notice you were making is exactly the kind of thing this section exists to surface. Ask yourself: "If my conclusion turns out to be wrong, which of my beliefs is the most likely culprit?" — those beliefs belong in this list.

### 6. Alternatives Ruled Out

Other plausible explanations you considered, and for each: the evidence that ruled it out. If you ruled something out on weak grounds (e.g. "seems unlikely" rather than direct evidence), say so explicitly.

### 7. Fix

What was changed (or should be changed), where, and why it resolves the causal chain in section 4. Note any risks or side effects of the change. If confidence in the diagnosis is Medium or Low, also state the single check that would most efficiently confirm the fix actually addressed the root cause rather than masking the symptom.

When a fix option is debated during discussion (e.g. "disable the flag entirely vs scope it"), record the **decision and the rationale for rejecting the alternatives** here, tagged [VERIFIED]/[INFERRED] like everything else — this section doubles as the decision log.

### 8. Open Questions

Anything you couldn't determine, couldn't access, or that still puzzles you. Unexplained details that don't fit the hypothesis go here — do not quietly drop them. This includes:

- Evidence that contradicts or doesn't fit the hypothesis (e.g. cohort members the mechanism can't explain)
- Discrepancies between reported and measured numbers (from §2)
- Tooling/access limitations that constrained the investigation (sampling windows, permissions, missing facets)

---

## Style Rules

- Do not overstate confidence. "I believe" and "the evidence suggests" are better than false certainty.
- Prefer specific references (file paths, line numbers, log timestamps, commit hashes) over vague descriptions.
- §0 is the only section where specific references are discouraged; everywhere else they are preferred.
