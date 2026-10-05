---
name: mining-corrections
description: Mines past Anvil sessions for places where the user corrected the agent's style, conventions, architecture, scope or process, merges them into a correction ledger, and proposes the enforcement for each recurring theme. Use when the user asks for bulk reflection, a correction ledger, "what do I keep correcting", "mine my sessions", or a reflection on the current session.
---

# Mining corrections

Turns repeated user corrections into enforcement. Two modes share one pipeline:

- **Bulk**: every session since a date. The default, and the one the user will actually run.
- **Session**: one session id, typically the current one. `/goodbye` runs it at the end of every session.

The ledger lives at `$CORRECTION_LEDGER`, else `~/.agents/correction-ledger.md`. Its format is in [references/ledger-format.md](references/ledger-format.md).

## 1. Extract

In both modes, read "Last mined" from the ledger and pass it as `--since`, so a resumed session doesn't re-mine turns a bulk run already covered. With no ledger, mine everything. Also pass each "Mined individually" entry as `--mined <session>=<time>`, so turns already mined in session mode aren't counted twice.

```bash
python3 <skill-dir>/scripts/extract.py --since 2026-09-01 --mined <id>=2026-10-04T18:02:11+01:00 --out /tmp/corrections
python3 <skill-dir>/scripts/extract.py --current --all-turns --since 2026-09-01 --mined <id>=2026-10-04T18:02:11+01:00 --out /tmp/corrections
```

Session mode uses `--current` (reads `$ANVIL_ROOT_SESSION_ID`, which Anvil's bash tool sets to the top-level session even inside subagents) or `--session <id>`, plus `--all-turns`, because one session is small enough to read unfiltered. Note the time with `date -Iseconds` before running it; step 3 records it. The offset matters: `--mined` rejects times without one. The script prints the chunk and candidate counts. With no candidates, skip to step 3 and only record the time. Done when every chunk file exists.

## 2. Classify

Dispatch one `@explorer` per chunk in a single batch, using [references/classifier-prompt.md](references/classifier-prompt.md). Done when every chunk has returned a table.

## 3. Merge

Fold the results into the ledger:

- Map each correction to an existing theme, or create a new one when 2+ corrections share a rule.
- Corrections that happen once go under `## Singletons` as a single line each. Promote one to a theme when it recurs.
- For an **enforced** theme, check whether any new correction is dated after its enforcement. If so, reopen it and propose the next rung up.

Done when every correction is either in a theme or a singleton, and the ledger records what was mined:

- **Bulk:** set "Last mined" to today. Drop "Mined individually" entries dated before today; keep today's, since `--since` covers the whole day.
- **Session:** leave "Last mined" alone, because other sessions since then are still unmined. Add or update this session's "Mined individually" entry with the time noted in step 1.

## 4. Propose

Present the top themes by new count. For each, give:

1. The rule, in one sentence.
2. The highest rung that would actually hold: delete-the-need, type, lint, hook or permission, test, golden example, skill rule, CLAUDE.md.
3. The exact file to change, and whether it belongs in a company skill (the repo convention applies to everyone), a personal skill, or an agent prompt.

Before proposing a prose rule, grep the existing skills and agent prompts for it. If it's already written and still being corrected, prose isn't holding, so go up a rung. If a skill contradicts the rule, fix the skill first.

Don't apply changes without approval. Skill and prompt edits affect every future session.
