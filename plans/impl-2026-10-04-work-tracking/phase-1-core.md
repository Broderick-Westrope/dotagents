# Phase 1: core

> Part of [README.md](README.md). Create a PR for human review when done; don't merge.

## Context Loading

_Run before starting (paths relative to this worktree unless absolute):_

```bash
read plans/impl-2026-10-04-work-tracking/README.md   # phases, design decisions
read skills/mining-corrections/SKILL.md               # sibling skill: tone, "Done when" steps, <skill-dir> script paths
read skills/mining-corrections/scripts/extract.py     # read-only anvil.db access pattern
read anvil/commands/post-mortem/COMMAND.md                    # a command that loads a skill by name
read /Users/broderick.westrope/dev/helse/claude-essentials/ANVIL.md   # command frontmatter (git-ignored; root checkout only)
read skills/finishing-a-development-branch/SKILL.md   # Step 5 removes worktrees
read anvil/commands/execute/COMMAND.md                        # "Post-Execution" removes worktrees directly
read skills/executing-plans/SKILL.md                  # "## 6. Cleanup" removes worktrees
read README.md
read "/Users/broderick.westrope/Library/Application Support/wtp/worktrees/eucalyptusvc/skills/skill-paths-hook/NOTES.local.md"  # hand-written handoff to generalise
sqlite3 "file:$HOME/.local/share/anvil/anvil.db?mode=ro" ".schema sessions"   # id, parent_session_id, title, working_dir, pinned, pin_note, updated_at (ms)
```

Code conventions (from `~/.agents/correction-ledger.md`):

- Inline functions with fewer than three non-test call sites. Small single-purpose helpers are fine only if they're used three or more times.
- Constants at the top of the file.
- Test through the CLI entry point, not internals.
- No comments that restate code.
- Prose: short sentences, plain words, no em dashes.

## Tracking script

### Task 1: `wip.py` and its tests

**Files:**
- Create: `skills/tracking-work/scripts/wip.py` (stdlib only, Python 3.11+)
- Create: `skills/tracking-work/scripts/test_wip.py`

**Settings** (each overridable by env var, so tests and sandboxes never touch real state):

| Setting | Env var | Default |
|---|---|---|
| Initiatives dir | `WIP_DIR` | `~/.agents/initiatives` |
| Worktrees root scanned for orphans | `WIP_WORKTREES_ROOT` | `~/Library/Application Support/wtp/worktrees` |
| Anvil DB | `ANVIL_DB` | `~/.local/share/anvil/anvil.db` |
| `gh` binary | `WIP_GH` | `gh` |

**File format.**
- One file per initiative: `<WIP_DIR>/<slug>.md`, where the slug matches `^[a-z0-9][a-z0-9-]{1,48}$`.
- The front matter is a JSON object between `---` lines. JSON is valid YAML, so markdown tools still read it.
- `json.dumps(indent=2, ensure_ascii=False)` writes it.
- The body after the closing `---` belongs to agents and the user. The script writes the template body on `new`, and otherwise copies the body byte-for-byte.
- All paths are stored absolute and with symlinks resolved.

```markdown
---
{
  "v": 1,
  "title": "Agent convention factory",
  "phase": "implementing",
  "phase_source": "manual",
  "since": "2026-10-04",
  "reason": null,
  "parked_from": null,
  "links": [
    {"kind": "worktree", "ref": "/Users/.../skill-paths-hook"},
    {"kind": "pr", "ref": "https://github.com/eucalyptusvc/skills/pull/235",
     "state": "draft", "observed": "2026-10-04T18:02:11Z", "error": null},
    {"kind": "topic", "ref": "/Users/broderick.westrope/dev/topics/agent-conventions"},
    {"kind": "doc", "ref": "/Users/.../plans/impl-2026-10-04-work-tracking/README.md"},
    {"kind": "session", "ref": "44330773-e820-4b13-90b6-73cf8cb722ad", "cwd": "/Users/broderick.westrope/dev"}
  ]
}
---

## Why

## Decisions

## Next
```

Schema rules:

- `phase_source` is `manual` or `sync`.
- `reason` is required when the phase is `parked`, or when it's `done` with source `manual`. Newlines in it are collapsed to spaces.
- `v` other than 1, unknown keys, a duplicate `(kind, ref)` link, or invalid JSON all exit 1 with the file path. The file is never rewritten in that case.

**Writing safely.** Every mutation runs in this order:

1. If the command needs network, such as `sync` calling `gh`, do that first, outside the lock.
2. Take `fcntl.flock(LOCK_EX)` on `<WIP_DIR>/.lock`, with a 5 s timeout. The lock is released automatically if the process dies.
3. Make sure `WIP_DIR` is a git repo of its own: `git init` it if it isn't in one, add a `.gitignore` for `.lock` and temp files if missing, and exit 1 if it sits inside another repo. Then commit any uncommitted changes in `WIP_DIR` as "record edits made outside wip", so the history separates hand and agent edits from the script's.
4. Read the file and record a SHA-256 of its full contents.
5. Apply the change to the parsed metadata, recomputing derived phases from the observations fetched in step 1.
6. Just before writing, re-hash the file. If it changed (for example, an agent edited the body), commit that edit as in step 3 and go back to step 4, up to 3 times, then exit 1.
7. Write to a temp file in `WIP_DIR` and `os.replace` it into place.
8. Commit only the files written, with the message `wip <arguments>` (shell-quoted). If nothing was written, there's no commit. If the commit fails, exit 1 with a message naming the files written; the next change commits them as outside edits.

Agents still edit the body with their edit tool, outside the lock. Step 6 means a script write never clobbers one of those edits, and steps 3 and 6 mean their edits are committed separately from the script's. The script never pushes.

**Commands.** Exit 0 on success. Usage errors and rule violations exit 1 with a one-line message. Catch at `main`; never print tracebacks.

| Command | Behaviour |
|---|---|
| `wip` / `wip board [--all]` | The board, described below |
| `wip new <slug> --title <t>` | Creates the file at phase `idea`, with source `manual`. Rejects an existing or invalid slug |
| `wip show <slug>` | Prints the metadata and body, then one live board entry. Then prints resume commands for the most recent session (by `updated_at` in `ANVIL_DB`, else the last linked): `anvil --session <id> --there` (resumes in the session's original cwd), plus `cd '<worktree>' && anvil --session <id>` for each linked worktree. Earlier sessions get only the `--there` line, newest first |
| `wip which [<path>] [--session <id>]` | Prints matching slugs, one per line, deduplicated and sorted, or nothing. A path matches a `worktree` link if it equals the link or lies inside it, compared by path component after `realpath`. It matches a `doc` link only if it's the same file. `topic` links never match, since topics aren't initiatives. `--session` matches a session link. Callers must ask the user when more than one slug comes back |
| `wip link <slug> <kind> <ref> [--cwd <dir>]` | Kinds: `worktree`, `pr`, `topic`, `doc` or `session`. Validation by kind: <ul><li>`worktree`: a dir where `git rev-parse --path-format=absolute --git-dir` differs from `--git-common-dir`</li><li>`topic`, `doc`: an existing path</li><li>`pr`: `^https://github\.com/[^/]+/[^/]+/pull/\d+$`, stored with state `unknown`</li><li>`session`: a root session ID in `ANVIL_DB`. Its `working_dir` is stored as `cwd`. If the DB is absent, accept it and use `--cwd`</li></ul> Linking an existing link is a no-op |
| `wip unlink <slug> <kind> <ref>` | Removes the link, matching on the resolved ref. Errors if absent |
| `wip phase <slug> <target> [--doc <path>] [--reason <text>]` | Applies the transition matrix below. `target` is a phase, or `unpark` |
| `wip sync [<slug>]` | For each `pr` link, runs `$WIP_GH pr view <url> --json state,isDraft` with a 10 s timeout and maps the result: `OPEN` + draft → `draft`, `OPEN` → `open`, `MERGED` → `merged`, `CLOSED` → `closed`. If the call fails, it retries with the token of each account `gh auth status` lists as logged in, including the one marked active (the default call doesn't always use it), passed in `GH_TOKEN`, so PRs in work and personal orgs both resolve; tokens are never printed or stored. A call that fails on every account sets `error` and leaves `state` and `observed` unchanged. Then it applies the sync rules |
| `wip import-pins [--apply <session-id>...]` | Without `--apply`: lists pinned root sessions not linked by any initiative, with a proposed slug (from the title; non-ASCII stripped; `-2` appended on collision), the title, and the pin note flattened to one line. With `--apply`: creates only the listed sessions' initiatives, at `parked` with reason = the pin note (or "pinned in Anvil" if empty) and the session linked. Already-linked sessions are skipped, so it's safe to rerun |

**Transition matrix** for `wip phase`. Every allowed change sets `since` to today and `phase_source` to `manual`.

| From \ To | idea / implementing | spec / planning | review | done | parked | unpark |
|---|---|---|---|---|---|---|
| idea, spec, planning, implementing | allowed | needs `--doc <existing file>`, which is also linked | rejected: "link a PR and run `wip sync`" | needs `--reason` and no linked PR that's open, draft or unknown | needs `--reason`; previous phase stored in `parked_from` | rejected |
| review | allowed | allowed, with `--doc` as above | rejected | same as above | same as above | rejected |
| done | allowed with `--reason` (reopen) | allowed with `--reason` and `--doc` | rejected | rejected | rejected | rejected |
| parked | allowed; clears `reason` and `parked_from` | allowed, with `--doc` as above | rejected | rejected | rejected | returns to `parked_from` |

**Sync rules.** They're applied in order to each initiative whose phase isn't `parked`, and skipped if it has no PR links.

1. If any PR's state is `unknown`, or its last observation errored: no phase change, and the board flags it.
2. Any PR `open`: the phase becomes `review` (source `sync`). This also reopens a `done` initiative, whether its done was manual or synced.
3. Otherwise, any PR `draft`, and the phase is `review` or a synced `done`: the phase becomes `implementing` (source `sync`).
4. Otherwise, every PR `merged`: the phase becomes `done` (source `sync`).
5. Otherwise, there's a `closed` PR and none `open` or `draft`: if the phase is `review` or a synced `done`, it becomes `implementing` (source `sync`). The board flags "closed PR: unlink it if it was superseded".

A parked initiative never changes in `sync`, but the board still shows its PR states.

**Board.**

Discovery:
- Walk `WIP_WORKTREES_ROOT` with `os.scandir`.
- Stop descending at any dir that has a `.git` entry; that dir is a worktree candidate.
- Never descend into `node_modules`, `.git` or dot-dirs.
- Deduplicate candidates by `realpath`.

Git state:
- Get each worktree's state from `git -C <path> status --porcelain=v2 --branch` (branch, upstream, ahead/behind and dirty count in one call) and `git -C <path> log -1 --format=%cs`.
- Run these for both linked and unclaimed worktrees in a `ThreadPoolExecutor(max_workers=8)`, with a 3 s per-call timeout and a 20 s board deadline.
- A worktree that times out shows `?`, and the footer says how many timed out.

Output sections:
1. **Initiatives**, grouped by phase in workflow order (`idea`, `spec`, `planning`, `implementing`, `review`, `done`, `parked`). `done` is hidden if `since` is more than 14 days ago, unless `--all` is passed. Each initiative shows:
   - `slug · title · phase for Nd`, plus the reason when parked or manually done;
   - the first non-empty line under `## Next`;
   - per worktree: branch, `dirty N`, `↑N ↓M` or `no upstream`, last commit date, or `MISSING`;
   - per PR: state and observation age (`draft · 2h ago`), with `?` if unknown or errored;
   - the most recent session's resume command.
2. **Flags:**
   - parked for more than 30 days;
   - implementing with no commit in 14 days on any linked worktree;
   - a worktree missing;
   - a PR unknown or errored;
   - a closed PR (rule 5).
3. **Unclaimed worktrees**, newest commit first. Show the path relative to the root, the branch, dirty, ahead/no upstream and the last commit date.
4. **Unclaimed pinned sessions:** title, pin note and ID, read from `ANVIL_DB` with `?mode=ro`. Skip this section silently if there's no DB.
5. **Footer:** the oldest PR observation, and the count of timeouts.

The board never calls `gh`.

**Tests.** Use `unittest`. Each test runs the CLI as a subprocess, with every env var above pointed at a fresh `tempfile.mkdtemp()` (passed through `realpath`) and `WIP_GH` pointed at a fake `gh` shell script. The fake prints a JSON fixture chosen per URL through `FAKE_GH_<n>` env vars, or exits 1. Use real `git init` and `git worktree add` repos and a real sqlite fixture DB. Table cases go in dicts keyed by case name. Cover:

1. Format:
   - `new` → `show` round-trip;
   - the body survives byte-for-byte across `phase` and `link` calls, including non-ASCII text and CRLF;
   - unknown `v`, an unknown key or invalid JSON exits 1 and leaves the file unchanged.
2. Every cell of the transition matrix, including both rejections and the stored `parked_from`/`unpark`.
3. Sync rules 1 to 5, each from the fake `gh`, plus:
   - a mix of `merged` and `closed`, which isn't done;
   - a PR reopened after done;
   - a manually done initiative that later gets an open PR;
   - a parked initiative with an open PR, which doesn't change;
   - `gh` failing, so the state is kept and an error recorded.
4. `link` validation for each kind:
   - a worktree path containing a space, accepted;
   - a plain repo, rejected;
   - a session absent from the DB, rejected;
   - a session with the DB missing and `--cwd` given, accepted.
5. `which`:
   - a nested path inside a linked worktree;
   - a doc inside a worktree, which matches only as that exact file;
   - two initiatives linking the same worktree, so both are printed;
   - an unrelated sibling dir with a shared prefix (`/x/foo` vs `/x/foobar`), which doesn't match;
   - a topic root and a file inside a linked topic, which don't match;
   - `--session`.
6. The board:
   - a worktree under a branch name containing `/` that's deeper than 5 levels;
   - dirty, ahead and no-upstream worktrees;
   - a missing worktree;
   - unclaimed worktrees;
   - linked and unlinked pinned sessions;
   - no DB;
   - one worktree whose git call hangs (a fake `git` on `PATH` that sleeps). The board still finishes within the deadline and marks it `?`.
7. `import-pins`:
   - a dry run writes nothing;
   - `--apply` with one of two IDs creates only that one;
   - rerunning skips it;
   - multiline and empty pin notes.
8. Concurrency:
   - 8 parallel `link` calls with different refs all land;
   - a lock-holder process killed with SIGKILL doesn't block the next call;
   - a body edit made between read and write triggers the retry and is preserved, committed on its own before the script's commit.
9. History:
   - the first `new` initialises the repo, and `.lock` stays untracked;
   - outside edits to several files land in one commit before the script's, and the script's commit contains only its change;
   - a no-op `link`, `which` and the board add no commit;
   - a failing commit hook exits 1 naming the file written, and the next change commits it as an outside edit;
   - a `WIP_DIR` inside another repo exits 1 and leaves that repo untouched.

**Verify:**
```bash
python3 -m unittest discover -s skills/tracking-work/scripts -v   # all pass
time WIP_DIR=$(mktemp -d) python3 skills/tracking-work/scripts/wip.py   # real root and DB: ~80 unclaimed worktrees, 10 pinned sessions, under 20 s
```

## Skill and command

### Task 2: `tracking-work` skill, body template and `/goodbye`

**Files:**
- Create: `skills/tracking-work/SKILL.md`
- Create: `skills/tracking-work/references/body-template.md`
- Create: `anvil/commands/goodbye/COMMAND.md`
- Modify: `README.md` (one row in the commands table, one in the skills table)

**Steps:**

1. [x] Write `skills/tracking-work/SKILL.md`, under about 130 lines.

   The frontmatter `description` should trigger on:
   - tracking or resuming work in progress ("what was I working on", "what's left on this branch", "resume X", "park this");
   - wrapping up a session ("/goodbye", "we're done for today");
   - the events in the Events table.

   Sections:
   - **Model.** An initiative is a piece of code work. Worktrees, docs, PRs and sessions are linked to it, and it may link topics as background. The body holds all its notes, including one section per branch. Topic folders are never initiatives. Run the script as `python3 "<skill-dir>/scripts/wip.py"`. Include the phase table from the README.
   - **Rules.**
     - Change metadata only through the script.
     - `review` and `done` come from `wip sync` when there are PRs.
     - Parking needs a real reason; "more time" is fine.
     - Ask before parking or reopening.
     - When `wip which` returns several slugs, ask the user which one.
     - **Finding the initiative.** Run `wip which` on the event's path; if that finds nothing, on the cwd; if that finds nothing, run `wip which --session "$ANVIL_ROOT_SESSION_ID"`.
     - **Enrolment.** Only code work is enrolled (a worktree with changes, or a design doc or plan for code). If nothing matches, offer once per session: "Track this as an initiative?" Give a proposed slug, title and the locations to link, or the option to attach it to an existing slug. If the user declines, skip tracking for the rest of the session. Never offer it for topic edits or discussion.
   - **Writing the body.**
     - A current snapshot following the template: Why, Decisions, Next, Open questions, Context, then `## Branches` with one `### <branch>` section per linked worktree holding what's left there and its gotchas. No git or PR state. Delete lines that are no longer true; never append dated entries.
     - Read the file first. Update lines your evidence shows are stale. Keep lines you can't confirm, and list them in your report. Leave sections outside the template verbatim.
     - Durable domain facts go in the topic, following its `AGENTS.md`; the initiative links the topic.
     - `~/.agents/correction-ledger.md` gets single-line entries for corrections about how agents should work.
     - Each fact has one home.
   - **Privacy.**
     - Anything meant for a PR, ticket or repo doc is drafted in chat, never written.
     - Follow each destination's rules; e.g. eucalyptusvc repos don't mention personal tooling.
     - Never write credentials, tokens, connection strings or patient data anywhere, including initiative files.
   - **Events:**

     | Event | Do |
     |---|---|
     | Worktree created | Find the initiative from the source location or session; `wip link <slug> worktree <new path>` |
     | Design doc written | `wip phase <slug> spec --doc <path>` |
     | Implementation plan written | `wip phase <slug> planning --doc <path>` |
     | Execution starts | `wip phase <slug> implementing` |
     | PR opened | `wip link <slug> pr <url>`, then `wip sync <slug>` |
     | Worktree about to be removed | Fold anything still useful from its branch section into Decisions or Next, and delete the section. Remove the worktree, then `wip unlink <slug> worktree <path>` and `wip sync <slug>` |
     | Resuming, or "what's left here?" | `wip which .`, then `wip show <slug>`; answer from the body, starting with this branch's section |
     | Waiting on something | `wip phase <slug> parked --reason "<what we're waiting for>"` |
     | Session ending | See "Ending a session" |
   - **Ending a session.** Each step ends with a "Done when":
     1. **List locations.** The locations this session edited, yours and sub-agents', plus the cwd, sorted into worktrees, topics and other files. For each git location, run `git status --short` and `git log -1 --format='%h %cs'`. With no edits and no decisions worth keeping, say there's nothing to record.
     2. **Topic docs.** Update each topic with edits or discussion following its `AGENTS.md`; without guidance, add a dated section at the top of `AGENTS.md`. No initiative for the topic itself.
     3. **Find initiatives.** From worktrees and code docs (with the enrolment offer for unfinished code work), from `wip which --session`, and, when code work was discussed without touching its worktrees, by listing active initiatives (those linking the topic first) and asking which ones the discussion changed.
     4. **Update each initiative.** Why, Decisions, Next, Open questions, Context and the branch sections touched; link the session, docs written and the topic if relevant; apply unrecorded phase events. Done when `wip show <slug>` reflects the session.
     5. **Report.** `wip show` for each initiative touched; list each file written and lines kept unconfirmed. Don't commit or push.
2. [x] Write `skills/tracking-work/references/body-template.md`: `## Why`, `## Decisions`, `## Next` (the first line is what the board shows), `## Open questions` (removed once decided), `## Context` (where things are, cross-branch gotchas), and `## Branches` with one example `### <branch>` section giving the worktree path, **Left** and **Gotchas**. `wip new` and `import-pins` write this file as the new body, so there's one copy of the template, and the board skips `<placeholder>` lines under Next.
3. [x] Write `anvil/commands/goodbye/COMMAND.md`. It loads the skill by name, not through `skills:` preload, because preload drops the skill's location (`anvil/internal/skills/format.go:11-26`) and `<skill-dir>` wouldn't resolve:
   ```markdown
   ---
   description: Record where this session's work stands so it can be closed and resumed later
   argument_hint: "[anything to emphasise]"
   ---

   Load the **tracking-work** skill and follow its "Ending a session" section. If the user added anything below, make sure it's captured.

   $ARGUMENTS
   ```

   It then runs **mining-corrections** in session mode (see the README's decision 8). That needs `extract.py --mined <session>=<time>` and a "Mined individually" line in the ledger, so a session mined by `/goodbye` doesn't move "Last mined" forward for bulk runs or get counted twice.
4. [x] Add README rows:
   - `/goodbye`: "Record where this session's work stands so it can be closed and resumed later";
   - `tracking-work`: "Track code initiatives through workflow phases, with their handoff notes".

**Verify:**
```bash
grep -c "Done when" skills/tracking-work/SKILL.md   # 5 or more
grep -n "goodbye\|tracking-work" README.md         # one row each
grep -rn "NOTES.local" skills anvil                 # no output
```

## Integration

### Task 3: Guard every worktree-removal path

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md`
- Modify: `anvil/commands/execute/COMMAND.md` ("Post-Execution", step 1)
- Modify: `skills/executing-plans/SKILL.md` ("## 6. Cleanup")

**Steps:**

1. [x] In `finishing-a-development-branch`, fix the existing contradiction. Step 5 says "For Options 1, 2, 4", but the Quick Reference table and the common-mistakes section keep the worktree for Option 2 (PR). Change Step 5 to "For Options 1 and 4".
2. [x] In all three files, replace each direct worktree-removal instruction with: "Load **tracking-work** and follow its 'Worktree about to be removed' event; it folds what's still useful from the branch's notes into the initiative before removal, drops the rest, and unlinks the worktree after." Keep each file's surrounding conditions (when to remove) unchanged.

**Verify:**
```bash
grep -n "git worktree remove\|Remove worktree" skills/finishing-a-development-branch/SKILL.md anvil/commands/execute/COMMAND.md skills/executing-plans/SKILL.md   # none outside a tracking-work sentence
grep -n "Options 1 and 4" skills/finishing-a-development-branch/SKILL.md
```

### Task 4: Sandbox acceptance (manual, agent-driven)

These scenarios check agent behaviour, so they're acceptance checks, not deterministic tests. Record outcomes separately from Task 1's unit results.

**Setup:**

1. Create a sandbox. Back up and restore `~/.config/anvil/anvil.json` from `$S/anvil.json.bak` rather than editing it back by hand. Check first that no other Anvil sessions depend on the plugin path, since the swap affects every session:
   ```bash
   S="$HOME/dev/helse/wip-e2e"; mkdir -p "$S"/{initiatives,worktrees} && git init -q "$S/initiatives"
   git init -q "$S/repo" && git -C "$S/repo" commit -q --allow-empty -m init
   git -C "$S/repo" worktree add -q "$S/worktrees/wt a" -b wt-a
   git -C "$S/repo" worktree add -q "$S/worktrees/wt-c" -b wt-c
   mkdir -p "$HOME/dev/topics/wip-scratch" && printf '# Scratch\n\n## Files\n- `log.md`: dated log\n' > "$HOME/dev/topics/wip-scratch/AGENTS.md"
   cp ~/.config/anvil/anvil.json "$S/anvil.json.bak"
   ```
2. Point `plugins[0].path` at this worktree.
3. Start each Anvil session through the terminal MCP's `create_session`, with `env: {WIP_DIR: "$S/initiatives", WIP_WORKTREES_ROOT: "$S/worktrees"}`.
4. The first prompt in each session is "Run `echo $WIP_DIR` and nothing else". Expect the sandbox path. Stop if it's wrong.

**Scenarios:**

1. [x] **Worktree.**
   - Steps: in `wt a`, edit a file and record `git status --porcelain`, touch a marker file, then run `/goodbye` and accept enrolment.
   - Expect: an initiative is created with `wt a` linked and a `### wt-a` section under `## Branches`; git status is unchanged; nothing is written inside the worktree.
   - Expect: `find "$S" ~/.agents ~/dev/topics -newer <marker> -type f` lists only sandbox files.
2. [x] **Repeat.**
   - Steps: hand-edit a line in the initiative body, add `## Mine`, then run `/goodbye` again.
   - Expect: both survive, and nothing is duplicated.
3. [x] **Multi-worktree.**
   - Steps: start in `$S`, edit both worktrees, then run `/goodbye`.
   - Expect: one initiative linking both worktrees (asked, not assumed), with a branch section each; scenario 1's section is merged, not replaced.
4. [x] **Topic, discussion only.**
   - Steps: start in `~/dev/topics/wip-scratch`, discuss the initiative from scenario 1 and make a decision about it, edit the topic, then run `/goodbye`.
   - Expect: the topic is updated following its `AGENTS.md`; no enrolment offer and no initiative for the topic; the agent lists active initiatives, asks which the discussion changed, and updates only the one you pick.
5. [x] **Declined.**
   - Steps: start in `wt-c` with a new edit, run `/goodbye`, and decline enrolment.
   - Expect: no initiative is created and no further prompts.
6. [x] **Research-only.**
   - Steps: start in `$S` with no edits, then run `/goodbye`.
   - Expect: "nothing to record", or one note with a reason. No error.
7. [x] **Privacy.**
   - Steps: say `SECRET_TOKEN=abc123` in `wt a`, then run `/goodbye`.
   - Expect: `grep -r abc123 "$S" ~/dev/topics/wip-scratch` finds nothing.
8. [x] **Resume.**
   - Steps: quit, run `wip show <slug>`, and run both printed resume commands.
   - Expect: `--there` reopens in the session's original cwd, and the `cd` variant opens in the worktree.
   - Steps: in a fresh session in `wt a`, ask "what's left on this branch?".
   - Expect: it runs `wip which .` and answers from the `### wt-a` section.
9. [x] **Removal.**
   - Steps: follow `finishing-a-development-branch` Option 1 for `wt-c` after linking it to an initiative.
   - Expect: anything useful from its branch section is folded into Decisions or Next and the section is gone; `wip show` no longer lists the worktree.
10. [x] **Teardown.**
    - `cp "$S/anvil.json.bak" ~/.config/anvil/anvil.json`;
    - remove the worktrees and `$S`;
    - `rm -rf ~/dev/topics/wip-scratch`.

**Verify:** record each outcome, the paths written and transcript excerpts as a checklist at the bottom of this file.

#### Task 4 results (2026-10-04)

Run with the plugin path in `~/.config/anvil/anvil.json` pointed at this worktree, then restored byte-for-byte from the backup. Every session's first prompt printed the sandbox `WIP_DIR`. The sandbox and scratch topic were removed afterwards.

- [x] **Worktree.** `/goodbye` in `wt a` offered enrolment with a proposed slug, title and links. On acceptance it created `app-greeting`, linked the worktree and session, wrote a `### wt-a` section, and set `implementing`. Git status in `wt a` was unchanged and nothing was written inside the worktree. Outside the sandbox, only Anvil's own `.anvil/logs` changed.
  - Finding: the sandbox sat inside `~/dev`, which is itself a git repo, so the first `wip new` refused ("make it a repo of its own"). The agent stopped and asked rather than running `git init` itself. After a manual `git init` it carried on. The real `~/.agents` isn't inside a repo, so this doesn't affect normal use, but the sandbox setup should `git init "$S/initiatives"` or live outside any repo.
- [x] **Repeat.** A hand-edited gotcha line and a new `## Mine` section were left untouched on a second `/goodbye`, which reported nothing new and said `wip` would commit the edits next time. A later `wip` call committed them as "record edits made outside wip".
- [x] **Multi-worktree.** Started in `$S` and edited both worktrees. The agent linked `wt-c` because the user said it was the same work, and `/goodbye` added a `### wt-c` section, rewrote `### wt-a` from the diff, recorded the decision, and raised an open question about a stray line. `## Mine` survived.
- [x] **Topic, discussion only.** In the scratch topic, `/goodbye` updated the topic's `log.md`, made no enrolment offer, and asked whether to apply the discussion to `app-greeting`. On "yes" it moved the open question into Decisions and updated the `wt-a` section.
- [x] **Declined.** In `wt-d` with an edit, `/goodbye` offered new, attach or don't track. "Don't track" created nothing, made no commit and asked nothing further.
- [x] **Research-only.** In `wt-d` before any edit, `/goodbye` said there was nothing to record.
- [x] **Privacy.** A dummy `SECRET_TOKEN=abc123` given in chat was refused and never written: no match in the sandbox, the scratch topic, or the initiatives repo's full history (`git log -p`). The decision from the same message was recorded.
- [x] **Resume.** `anvil --session <id> --there` started from `$S` reopened the session in `wt a`. The `cd '<worktree>' && anvil --session <id>` form opened it in `wt-c`. A fresh session in `wt a` asked "what's left on this branch?" ran `wip which .` and `wip show`, and answered from the `### wt-a` section.
  - Finding: `wip show` printed 12 resume lines for 4 sessions and 2 worktrees (every session crossed with every worktree). It's correct but noisy.
- [x] **Removal.** `finishing-a-development-branch` Option 1 for `wt-c` merged it, followed the "Worktree about to be removed" event (folded the branch section into Decisions and deleted it), removed the worktree and branch, then ran `wip unlink` and `wip sync`. `wip show` no longer listed `wt-c`.
- [x] **Teardown.** `anvil.json` restored and checked with `cmp`; worktrees, `$S` and `~/dev/topics/wip-scratch` removed.

**History check.** The sandbox initiatives repo ended with 16 commits that alternate cleanly: each `wip <command>` commit was preceded by a "record edits made outside wip" commit whenever an agent had edited the body first.

**Findings to act on:**

1. Every agent edit to an initiative file outside the session's cwd triggers an Anvil permission prompt ("path outside working directory"). Adding a permission rule for `~/.agents/initiatives/*.md` would remove it.
2. `wip show` resume output is noisy (see Resume above). Fixed: it now prints the `cd` variants only for the most recent session.
3. Fix the sandbox setup step so `$S/initiatives` is its own repo (see Worktree above). Fixed in the setup step.

### Task 5: User setup (after Task 4 passes)

**Files** (outside the repo, left uncommitted):
- `/Users/broderick.westrope/dev/CLAUDE.md`

**Steps:**

1. [x] Add a "Work in progress" section to `~/dev/CLAUDE.md`, after "Worktrees for New Work":
   - initiatives live in `~/.agents/initiatives/`, managed through the tracking-work skill;
   - when resuming in a worktree, find its initiative with the skill and read its branch section first;
   - `/goodbye` before closing a session.
2. [x] Tell the user they can add this alias to `~/.zshrc`. Don't edit the file:
   ```
   alias wip='python3 ~/dev/helse/claude-essentials/skills/tracking-work/scripts/wip.py'
   ```

**Verify:**
```bash
grep -n "tracking-work" ~/dev/CLAUDE.md   # the new section
```
