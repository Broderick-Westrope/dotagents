---
name: tracking-work
description: Tracks initiatives (pieces of code work spanning worktrees, PRs, docs and sessions) through workflow phases, and keeps their handoff notes. Use when the user asks what they were working on or what's left on a branch, wants to resume, park or check on work in progress, wraps up a session ("/goodbye", "we're done for today"), or when a workflow reaches an event in this skill's Events table (worktree created or removed, design doc or plan written, execution started, PR opened).
---

# Tracking work

## Model

An **initiative** is one piece of code work. Worktrees, docs, PRs and sessions are linked to it, and it can link topic folders as background. Each initiative is one file in `~/.agents/initiatives/<slug>.md`: JSON metadata owned by the script, then a body owned by agents and the user. The body holds all of the initiative's notes, including per-branch handoff notes; see [references/body-template.md](references/body-template.md).

Topic folders are never initiatives. A topic session updates the topic's own docs, and updates initiatives only when the discussion changed them.

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
- **Finding the initiative.** Run `wip which <path>` on the event's path (a worktree path or a doc). If that prints nothing, run it on the cwd. If that prints nothing, run `wip which --session "$ANVIL_ROOT_SESSION_ID"`. If several slugs come back, ask the user which one. `which` never matches topic folders.
- **Enrolment.** Only code work is enrolled: a worktree with changes, or a design doc or plan for code. If nothing matches, offer once per session: "Track this as an initiative?" Propose a slug, a title and the locations to link, or offer to attach the work to an existing slug (`wip` lists them). On acceptance, run `wip new <slug> --title "<title>"`, then `wip link` each location. If the user declines, skip tracking for the rest of the session and carry on with the workflow as normal. Never offer enrolment for topic edits or discussion.

## Writing the body

- Keep the body a current snapshot, not a log: Why, Decisions, Next, then one `### <branch>` section per linked worktree under `## Branches`.
- A branch section holds only what's left on that branch and its gotchas. No git or PR state; `wip show` gives that live.
- Read the file first. Update lines your evidence shows are stale. Keep lines you can't confirm, and list them in your report. Leave sections you don't own (anything outside the template) verbatim.
- Durable domain facts belong in the topic folder, following its `AGENTS.md`. Link the topic from the initiative rather than copying them.
- Corrections about how agents should work go in `~/.agents/correction-ledger.md` as single lines.
- Each fact has one home.

## Privacy

- Anything meant for a PR, ticket or repo doc is drafted in chat, never written.
- Follow each destination's rules. For example, eucalyptusvc repos don't mention personal tooling.
- Never write credentials, tokens, connection strings or patient data anywhere, including initiative files.

## Events

Find the initiative first (see Rules). Then:

| Event | Do |
|---|---|
| Worktree created | Find the initiative from the source location or session, then `wip link <slug> worktree <new path>` |
| Design doc written | `wip phase <slug> spec --doc <path>` |
| Implementation plan written | `wip phase <slug> planning --doc <path>` |
| Execution starts | `wip phase <slug> implementing` |
| PR opened | `wip link <slug> pr <url>`, then `wip sync <slug>` |
| Worktree about to be removed | Fold anything still useful from its `### <branch>` section into Decisions or Next, then delete the section. Remove the worktree (`git worktree remove <path>`), then run `wip unlink <slug> worktree <path>` and `wip sync <slug>`. With no initiative, just remove the worktree |
| Resuming, or "what's left here?" | `wip which .`, then `wip show <slug>`. Answer from the body, starting with this branch's section |
| Waiting on something | `wip phase <slug> parked --reason "<what we're waiting for>"` |
| Session ending | Follow "Ending a session" |

## Ending a session

1. **List locations.** Take the locations this session edited, yours and sub-agents' (from their reports), plus the cwd. Sort them into worktrees or repos, topic folders, and other files. For each git location, run `git status --short` and `git log -1 --format='%h %cs'`.
   Done when every location is listed. With no edits and no decisions worth keeping, say there's nothing to record and stop.
2. **Topic docs.** For each topic folder with edits or discussion, update its docs following its `AGENTS.md`. Without guidance, add a dated section at the top of `AGENTS.md`. Don't create or look up an initiative for the topic itself.
   Done when each topic's docs reflect the session.
3. **Find initiatives.**
   - For each worktree or code doc, find its initiative using the rules above. For unfinished code work with none, make the enrolment offer.
   - Run `wip which --session "$ANVIL_ROOT_SESSION_ID"` for initiatives this session already worked on.
   - If the session discussed code work without touching its worktrees (for example, planning in a topic), list active initiatives from `wip`, putting first any that link the topic (`grep -l '<topic path>' ~/.agents/initiatives/*.md`). Ask which ones the discussion changed. Don't guess.

   Done when every affected initiative is identified, or the user declined.
4. **Update each initiative.** For each one:
   - update Why, Decisions and Next, and the `### <branch>` section of each worktree touched;
   - run `wip link <slug> session "$ANVIL_ROOT_SESSION_ID"`;
   - link docs written this session, and the topic if the work relates to one;
   - apply any phase event that happened this session and wasn't recorded.

   Done when `wip show <slug>` reflects the session.
5. **Report.** Run `wip show <slug>` for each initiative touched. List each file written and any lines kept unconfirmed. Don't commit or push.
   Done when the user can see every path and the resume commands.
