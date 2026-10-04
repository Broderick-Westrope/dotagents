---
name: tracking-work
description: Tracks initiatives (pieces of work spanning worktrees, PRs, topics, docs and sessions) through workflow phases, and keeps session and worktree notes. Use when the user asks what they were working on, wants to resume, park or check on work in progress, wraps up a session ("/goodbye", "we're done for today"), or when a workflow reaches an event in this skill's Events table (worktree created or removed, design doc or plan written, execution started, PR opened).
---

# Tracking work

## Model

An **initiative** is one piece of work. Worktrees, topics, docs, PRs and sessions are linked to it. Each initiative is one file in `~/.agents/initiatives/<slug>.md`: JSON metadata owned by the script, then a body (Why, Decisions, Next) owned by agents and the user.

Run the script as:

```bash
python3 "<skill-dir>/scripts/wip.py" <command>
```

`wip` below means that command. `wip` with no arguments prints the board; `wip <command> --help` shows each command's flags.

| Phase | Entered when | Set by |
|---|---|---|
| `idea` | An initiative is created | `wip new` |
| `spec` | A design doc exists | `wip phase <slug> spec --doc <path>` |
| `planning` | An implementation plan exists | `wip phase <slug> planning --doc <path>` |
| `implementing` | Work starts | `wip phase <slug> implementing` |
| `review` | A linked PR is open and not a draft | derived by `wip sync` |
| `done` | Every linked PR is merged, or set by hand with a reason for work that has no PR | `wip sync` / `wip phase <slug> done --reason` |
| `parked` | Waiting on something | `wip phase <slug> parked --reason "<what we're waiting for>"` |

## Rules

- Change metadata only through the script. Never edit the JSON block by hand. Edit the body with your edit tool.
- `review` and `done` come from `wip sync` when the initiative has PRs. If the script rejects a phase change, report its message; don't work around it.
- Parking needs a real reason. "More time" is fine.
- Ask the user before parking or reopening an initiative.
- **Finding the initiative.** Run `wip which <path>` on the event's path. If that prints nothing, run it on the location the work came from (the cwd, or the doc's directory). If that prints nothing, run `wip which --session "$ANVIL_ROOT_SESSION_ID"`. If several slugs come back, ask the user which one.
- **Enrolment.** If nothing matches, offer once per session: "Track this as an initiative?" Propose a slug, a title and the locations to link, or offer to attach the work to an existing slug (`wip` lists them). On acceptance, run `wip new <slug> --title "<title>"`, then `wip link` each location. If the user declines, skip tracking for the rest of the session and carry on with the workflow as normal.

## Where notes go

- **Initiative body:** why the work exists, decisions, and next steps. Keep it a current snapshot, not a log.
- **`NOTES.local.md`** at a worktree root: only what's left on that branch and its gotchas. No git or PR state; `wip show` gives that live. It opens with one `Initiative: ~/.agents/initiatives/<slug>.md` line per initiative linking the worktree. Use [references/notes-template.md](references/notes-template.md).
- **Topic folder:** follows its own `AGENTS.md`. Durable domain facts go there, and the initiative links the topic.
- **`~/.agents/correction-ledger.md`:** single-line entries for corrections about how agents should work.

Each fact has one home. Link to it from the others.

## Privacy

- Before writing `NOTES.local.md`, check that it's ignored and untracked:
  ```bash
  git -C <worktree> check-ignore -q NOTES.local.md            # must succeed
  git -C <worktree> ls-files --error-unmatch NOTES.local.md   # must fail
  ```
  If either check doesn't hold, stop and tell the user.
- Anything meant for a PR, ticket or repo doc is drafted in chat, never written.
- Follow each destination's rules. For example, eucalyptusvc repos don't mention personal tooling.
- Never write credentials, tokens, connection strings or patient data anywhere.

## Editing notes

- Read the file first.
- You own the template's sections. Update lines your evidence shows are stale.
- Keep lines you can't confirm, and list them in your report.
- Leave other sections verbatim.
- Never replace substantive notes with a pointer.
- Keep `NOTES.local.md` under about 80 lines.

## Events

Find the initiative first (see Rules). Then:

| Event | Do |
|---|---|
| Worktree created | Find the initiative from the source location or session, then `wip link <slug> worktree <new path>` |
| Design doc written | `wip phase <slug> spec --doc <path>` |
| Implementation plan written | `wip phase <slug> planning --doc <path>` |
| Execution starts | `wip phase <slug> implementing` |
| PR opened | `wip link <slug> pr <url>`, then `wip sync <slug>` |
| Worktree about to be removed | Run `wip archive-notes <path>`. If it fails, stop and don't remove the worktree. Otherwise remove the worktree (`git worktree remove <path>`), then run `wip unlink <slug> worktree <path>`, `wip link <slug> doc <printed archive path>` (if it printed one) and `wip sync <slug>` |
| Waiting on something | `wip phase <slug> parked --reason "<what we're waiting for>"` |
| Session ending | Follow "Ending a session" |

The archive step runs even when no initiative tracks the worktree; only the `unlink`, `link` and `sync` steps need a slug.

## Ending a session

1. **List locations.** Take the locations this session edited, yours and sub-agents' (from their reports), plus the cwd. For each git location, run `git status --short` and `git log -1 --format='%h %cs'`.
   Done when every location is listed, or there were no edits. With no edits and nothing unfinished, say there's nothing to record and stop.
2. **Find initiatives.** Find each location's initiative using the rules above. For unfinished work with no initiative, make the enrolment offer. On acceptance, run `wip new`, then `wip link` every location: worktrees, the topic, and docs written.
   Done when every unfinished location is linked, or the user declined.
3. **Update each initiative.** For each initiative touched:
   - update its body (Why, Decisions, Next);
   - run `wip link <slug> session "$ANVIL_ROOT_SESSION_ID"`;
   - apply any phase event that happened this session and wasn't recorded.

   Done when `wip show <slug>` reflects the session.
4. **Worktree notes.** For each worktree with unfinished work, run the privacy check, then write or update `NOTES.local.md` from the template.
   Done when each one is written, or the privacy check stopped you and you told the user.
5. **Topic notes.** For each topic with work, follow its `AGENTS.md`. Without guidance, add a dated section at the top of `AGENTS.md`.
   Done when written.
6. **Report.** Run `wip show <slug>` for each initiative touched. List each file written and any lines kept unconfirmed. Don't commit or push.
   Done when the user can see every path and the resume commands.
