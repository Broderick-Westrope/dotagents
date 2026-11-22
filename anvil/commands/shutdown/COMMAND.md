---
description: "End-of-day shutdown: record what moved, what didn't and why, and the first thing for next time, so you can switch off"
argument_hint: "[optional: your notes on the day, dictated or rough]"
---

The point of a shutdown is that Brodie can stop thinking about work: every thread he touched has its next step written down, so `/today` can pick them up without him remembering. Run when he asks; it's occasional, and `/today` reconstructs the day from GitHub, Linear and Slack when it wasn't run. It edits only `days/` in the hub and `agentic-pipeline/in-flight.md`'s Next cells, and posts nothing. Relative paths below are from `~/dev/topics`, the hub, whatever directory the session started in. Brodie's notes, if any: $ARGUMENTS

## 1. What was meant, what happened

- `TZ=Australia/Sydney date '+%a %Y-%m-%d %H:%M'`; read today's `days/<date>.md`: its `## Plan` is what the day set out to do, and any `## Replan` sections record progress and changes of course since. If there's none, today's plan is whatever the `agentic-pipeline/in-flight.md` Next cells and Brodie's notes say.
- Gather the day's delta: `"<command dir>/../today/github.py" <09:00 Sydney today, as UTC> (the directory of this `COMMAND.md` location; quote it)`, `git log --since=<that> --oneline` and today's log entries in each active topic in the index in `CLAUDE.md` (and in the hub itself, for wraps and the inbox), and his Linear issues updated today (MCP `list_issues`, assignee `me`).
- Brodie's notes come first: what he says happened beats what the delta implies. If he gave none, ask one question at most ("Anything on your mind that isn't in GitHub or Linear?"), then go on with what you have.

Done when each plan item is marked moved, done or not started, with the evidence or his word.

## 2. Write it down

Append to `days/<date>.md` (create it with a `# <Day YYYY-MM-DD>` title if missing):

```
## Shutdown (<Sydney time>)
- Done: <items, with links>
- Moved: <item: where it got to>
- Not done: <item: why, in his words where he gave them>
- On his mind: <loose threads from his notes that belong to no PR or ticket>
- First thing next time: <one item, the one /today should lead with unless something urgent lands>
```

For each thread that moved today, update its `agentic-pipeline/in-flight.md` Next cell to the actual next step (re-read the row first; another session may have edited it). Rows only change on evidence, as in `/health-check`; a whole-row rebuild is that command's job, not this one.

Commit `days/<date>.md` in the hub repo and `in-flight.md` in the agentic-pipeline repo, each by path, subject `Shut down <Day D Mon>`.

## 3. Tell him

Three or four lines: what's done, the first thing next time, and anything the day left for a person that has a deadline before then. End there; this is the moment he switches off.

Done when the file is committed and he's seen the lines.
