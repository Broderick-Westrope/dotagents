# /goodbye command and session notes convention

> **Status:** DRAFT

## Specification

**Problem:** Sessions end without a handoff. The next session (or the user, days later) has to rebuild state from git, PRs and memory: which worktrees are in play, what's pushed, what was decided, what's next. On 2026-10-04 a handoff was written by hand to `NOTES.local.md` in a worktree, and `**/NOTES.local.md` was added to the user-level git ignore (`~/.config/git/ignore`). There is no command that does this, no rule for where notes go when the work isn't in a worktree, and nothing reads the notes back.

Notes need different homes depending on where the work happened:

- **Topic folders** (`~/dev/topics/<name>/`) are evergreen, private working folders with their own conventions, indexed by each topic's `AGENTS.md` (e.g. `log.md`, `decisions.md`, `questions.md`, dated "read before" sections at the top of `AGENTS.md`). They sit inside the `~/dev` repo but are ignored by its `.gitignore` (`**/`). They shouldn't get a separate notes file.
- **Linked worktrees** hold branch-scoped, transient state. `NOTES.local.md` at the worktree root fits, but `git worktree remove` / `wtp remove` delete ignored files silently.
- **Root checkouts** are read-only by convention; work there is rare.
- **Elsewhere** (a session run from `~/dev` that touched several repos, or no repo at all) has no obvious home.

A single session often touches several of these. The 2026-10-04 session touched two worktrees, `~/.agents/` and `~/.config/`.

**Goal:** At the end of a session the user types `/goodbye`. The agent works out where the session's work happened, writes a concise handoff to the right place for each location, and reports what it wrote. The next Anvil session started in that worktree sees the notes at startup. Removing a worktree never silently loses its notes.

**Scope:**

- In:
  - a `/goodbye` command and `leaving-notes` skill in this plugin;
  - reading notes back through the user's Anvil config;
  - an archive step before worktree removal in `finishing-a-development-branch`;
  - documenting the convention in `~/dev/CLAUDE.md`.
- Deferred (Task 5, optional): a script that lists the files a session edited, using the Anvil DB.
- Out:
  - Anvil code changes;
  - a session-end hook event in Anvil;
  - automatically running `mining-corrections`;
  - automatically writing to anything tracked or shared (PR descriptions, tickets, repo docs);
  - Claude Code/Cursor support (the plugin has been Anvil-only since `e1048ae`).

**Success Criteria:**

- [ ] `/goodbye` is listed in Anvil's command palette. Running it loads the `leaving-notes` skill by name, so the skill's location (and its `references/`) resolves.
- [ ] Worktree session: `/goodbye` writes `<worktree>/NOTES.local.md` using the template, and `git status --porcelain` is identical before and after.
- [ ] Topic session: `/goodbye` updates only that topic's files, following its `AGENTS.md`, and creates no `NOTES.local.md`.
- [ ] Multi-location session:
  - each worktree with branch work gets its own branch-scoped notes;
  - one primary gets the cross-cutting handoff;
  - no existing notes are replaced by a pointer.
- [ ] Second `/goodbye` after hand-editing the notes:
  - the hand-edited lines and any non-template section survive;
  - no section is duplicated;
  - lines the agent couldn't confirm are kept and listed in the report, not deleted.
- [ ] Research-only session (no edits): `/goodbye` either writes notes to a reasoned destination or says nothing was worth keeping. It never errors.
- [ ] Nothing is written outside: the destinations in the table, `~/.agents/notes/` and `~/.agents/correction-ledger.md`. PR and ticket text is drafted in chat only.
- [ ] A fresh Anvil process started in a worktree with `NOTES.local.md` answers "what's the state of this work?" from the notes without running tools.
- [ ] `finishing-a-development-branch` copies `NOTES.local.md` to `~/.agents/notes/archive/` and checks the copy exists before removing a worktree. If the copy fails, it does not remove the worktree.

## Design decisions

1. **Where it lives: this plugin, not Anvil.** The behaviour is prompt content: a command plus a skill. Anvil already supports everything needed:
   - plugin commands and `$ARGUMENTS` (`internal/commands/commands.go`);
   - user `context_paths` appended to the defaults (`internal/config/load.go:644`), so read-back needs config only.

   An Anvil change becomes worth it only if a `Stop`/session-end hook event is added later; Anvil currently has only `PreToolUse`.
2. **The command loads the skill by name instead of using `skills:` preload.** Preloaded skills are inlined as `<skill_content>` blocks without their location (`internal/skills/format.go:11-26`), so `references/template.md` wouldn't resolve. The command body says "Load the leaving-notes skill", which goes through `view` and returns the location. `post-mortem.md` already works this way.
3. **File name: `NOTES.local.md`.** It's already git-ignored everywhere through `~/.config/git/ignore`. Anvil's default context paths include `ANVIL.local.md` and `CLAUDE.local.md`, but those hold instructions the user maintains. Agent-written session state mixed into them would blur instructions with state and risk overwriting user rules.
4. **Snapshot, not log, with conservative merging.** The agent owns only the template's sections. Inside them it updates lines this session's evidence shows are stale. Lines it can't confirm are kept and listed in the report. Sections it didn't create are left verbatim. History belongs in git, PRs and topic `log.md` files.
5. **Discovery from the session plus git, not a DB parser (for now).** Candidates come from:
   - the conversation, including sub-agent reports, which list files changed;
   - the working directory.

   Each candidate is then checked with git: `git -C <loc> status --short`, `git worktree list` and `git log -1`. A DB-backed script would catch edits the conversation lost. But tool calls in the DB are attempts, not successes, and bash edits don't appear there. Getting it right means joining tool results, resolving relative paths and skipping fetch scratch dirs. That's deferred to Task 5, to be built only if real runs show missed locations.
6. **Read back at startup.** Adding `NOTES.local.md` to `options.context_paths` includes it in the system prompt when the agent's prompt is built (session start or rebuild), resolved against the working directory only (`internal/agent/prompt/prompt.go:174`). It's not re-read each turn, there's no size cap, and sessions started in a subdirectory don't see it. Topics need nothing, because their `AGENTS.md` is already a default context path.
7. **Privacy boundary.** Notes and promotions go only to private, untracked places: worktree `NOTES.local.md`, topic files, `~/.agents/notes/` and the correction ledger. Anything meant for shared or tracked places is drafted in chat. Content copied out of one location must follow the destination's rules. For example, eucalyptusvc repos must not mention personal tooling such as Anvil; check the destination's `AGENTS.md`/`CLAUDE.md`.
8. **Single plan, not phased.** It's one repo, about five small files and one config edit. The reviewer suggested phasing five concerns. Deferring the discovery script removes the only independently risky one, and the rest can be reviewed together.

## Context Loading

_Run before starting (paths relative to this worktree unless absolute):_

```bash
read anvil/commands/post-mortem.md                 # command that loads a skill by name
read /Users/broderick.westrope/dev/helse/claude-essentials/ANVIL.md   # command frontmatter reference (git-ignored, only in the root checkout)
read skills/mining-corrections/SKILL.md            # sibling skill: tone, length, "Done when" steps
read skills/finishing-a-development-branch/SKILL.md
read skills/using-git-worktrees/SKILL.md
read README.md                                     # commands and skills tables
read "/Users/broderick.westrope/Library/Application Support/wtp/worktrees/eucalyptusvc/skills/skill-paths-hook/NOTES.local.md"  # the hand-written example
read /Users/broderick.westrope/dev/topics/spain-ima-integration/AGENTS.md   # a topic's conventions (first ~40 lines)
```

Conventions that apply to all prose here (from `~/.agents/correction-ledger.md`):

- Short sentences and plain words.
- No em dashes.
- State things once.
- No sections that restate what the reader can derive.

## Notes tasks

### Task 1: `leaving-notes` skill and `/goodbye` command

**Files:**
- Create: `skills/leaving-notes/SKILL.md`
- Create: `skills/leaving-notes/references/template.md`
- Create: `anvil/commands/goodbye.md`
- Modify: `README.md` (add a commands-table row and a skills-table row)

**Steps:**

1. [ ] Write `anvil/commands/goodbye.md`:
   ```markdown
   ---
   description: Write handoff notes for this session where the next session will find them
   argument_hint: "[anything to emphasise]"
   ---

   Load the **leaving-notes** skill and follow it to write handoff notes for this session. If the user added anything below, make sure the notes cover it.

   $ARGUMENTS
   ```
2. [ ] Write `skills/leaving-notes/SKILL.md`. The frontmatter `description` should trigger on "/goodbye", "write handoff notes", "wrap up", "leave notes for next time" and "we're done for today". The body, under about 80 lines, has these steps, each ending with "Done when":
   1. **List candidates.** Take every location this session edited (yours and the sub-agents', from their reports) plus the working directory. Classify each, checking in this order:
      - `topic`: under `~/dev/topics/<name>/`. Check this first, because topics also sit inside the `~/dev` repo.
      - `worktree`: `git rev-parse --path-format=absolute --git-dir` differs from `--git-common-dir`.
      - `root`: in a git repo where the two are equal.
      - `other`: everything else.

      For each git location, record branch, short HEAD, `git status --short` and whether it's pushed. Done when every location is classified, or the session has no edits.
   2. **Decide what's worth keeping.** Keep only what isn't recoverable from git, the PR or the code: state, open decisions, next steps, gotchas. If nothing qualifies, say so and stop. Done when you have the list.
   3. **Choose destinations.**
      - Each `worktree` and `topic` with work gets its own notes about its own work.
      - The cross-cutting handoff goes to one primary: the location with unfinished work (open branch, PR, uncommitted changes), else the most-edited, else a topic in use, else `~/.agents/notes/`.
      - Other locations with notes get one appended pointer line to the primary.

      Done when each item has one home.
   4. **Write.** Use the table below and `references/template.md`.
      - Read any existing file first.
      - You own only the template's sections. Update lines your evidence shows are stale, keep lines you can't confirm (list them in the report), and leave other sections verbatim.
      - Never replace substantive notes with a pointer.
      - Keep `NOTES.local.md` under about 120 lines; it's loaded into the system prompt at startup.

      Done when every destination is written.
   5. **Promote, privately.**
      - Decisions and facts that must outlive a worktree go to the related topic's files, or to `~/.agents/notes/`.
      - Corrections the user gave about how agents work go to `~/.agents/correction-ledger.md` as singleton lines.
      - Anything meant for a PR, ticket or repo doc is drafted in the chat, never written.
      - Follow the destination's rules (check its `AGENTS.md`/`CLAUDE.md`), e.g. eucalyptusvc repos don't mention personal tooling.

      Done when nothing durable lives only in a worktree's notes.
   6. **Report.** List each file written with a one-line summary, plus any lines kept unconfirmed. Don't commit or push. Done when every path is shown.

   Destination table for the skill:

   | Kind | Write to | Never |
   |---|---|---|
   | `topic` | The topic's own files, per the Files section of its `AGENTS.md`. Without guidance: a dated section at the top of `AGENTS.md` for current state, plus a line in `log.md` | Create `NOTES.local.md` in a topic |
   | `worktree` | `<location>/NOTES.local.md` | Stage or commit it |
   | `root` | `<location>/NOTES.local.md` only if uncommitted work is there | Write anything else into the checkout |
   | `other` | `~/.agents/notes/YYYY-MM-DD-<slug>.md`, only when it's the primary | Write into config dirs like `~/.config` |

   Content rules for the skill:
   - Absolute paths, PR URLs and short SHAs.
   - Never credentials, tokens, connection strings or patient data.
3. [ ] Write `skills/leaving-notes/references/template.md`, generalised from the hand-written example. Sections:
   - **Header:** a title, `Last updated: <date> · branch <branch> @ <head>`, and one line: "Check `git log`/`git status` before trusting this; it may be stale."
   - **Where things are:** a table of what, location and state.
   - **Open decisions**
   - **Known limits / not yet tested**
   - **Next steps:** in order, with an owner if agreed.
   - **Gotchas:** facts that cost time and aren't written down elsewhere.

   Include the pointer variant: `See <primary path> for the handoff from <date>.`
4. [ ] Add README rows: `/goodbye` ("Write handoff notes for this session where the next session will find them") to the commands table, and `leaving-notes` ("Choose where session notes go and write them") to the skills table next to `post-mortem` and `mining-corrections`.

**Verify:**
```bash
grep -n "goodbye\|leaving-notes" README.md   # one row each
grep -c "Done when" skills/leaving-notes/SKILL.md   # 6
```

### Task 2: Read-back and convention docs

**Files:**
- Modify: `skills/using-git-worktrees/SKILL.md` (one line)
- Modify (user config, outside the repo): `~/.config/anvil/anvil.json`
- Modify (user memory, outside the repo; leave uncommitted): `/Users/broderick.westrope/dev/CLAUDE.md`

**Steps:**

1. [ ] Add `NOTES.local.md` to `options.context_paths` in `~/.config/anvil/anvil.json`:
   - create the `options` object if it's absent;
   - append to an existing `context_paths` array rather than replacing it;
   - check the file still parses with `jq .`.
2. [ ] Add to `using-git-worktrees`: "Session handoff notes live in `NOTES.local.md` at the worktree root (globally git-ignored). Read it first when resuming; see leaving-notes."
3. [ ] Add a "Session notes" section to `~/dev/CLAUDE.md`, after "Worktrees for New Work":
   - Handoffs live in `NOTES.local.md` at a worktree root, in a topic's own docs, or in `~/.agents/notes/`.
   - Read them first when resuming, and check them against git before trusting them.
   - `/goodbye` writes them.

**Verify:**
```bash
jq -e '.options.context_paths | index("NOTES.local.md")' ~/.config/anvil/anvil.json   # a number, not null
```

### Task 3: Archive notes before worktree removal

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md`

**Steps:**

1. [ ] Fix the existing inconsistency first. Step 5 says "For Options 1, 2, 4" remove the worktree, but the Quick Reference table and the common-mistakes section keep it for Option 2 (PR). Change Step 5 to "For Options 1 and 4", and Option 2 to keep the worktree, matching the table.
2. [ ] Add to the start of Step 5:
   ```bash
   notes="<worktree-path>/NOTES.local.md"
   if [ -f "$notes" ]; then
     dest="$HOME/.agents/notes/archive/$(basename "$(git -C "<worktree-path>" rev-parse --show-toplevel)")-$(git -C "<worktree-path>" branch --show-current | tr / -)-$(date +%Y-%m-%d).md"
     mkdir -p "$(dirname "$dest")" && cp "$notes" "$dest" && [ -s "$dest" ] || { echo "notes archive failed; not removing worktree"; exit 1; }
   fi
   ```
   Add one sentence after it: "`git worktree remove` and `wtp remove` delete ignored files without asking, so don't remove the worktree if the archive step failed."

**Verify:**
```bash
grep -n "Options 1 and 4\|notes archive failed" skills/finishing-a-development-branch/SKILL.md   # both present
```

## Verification task

### Task 4: End-to-end scenarios

**Prerequisites:**
- Point the plugin at this worktree: in `~/.config/anvil/anvil.json`, temporarily set `plugins[0].path` to this worktree's absolute path, and note the original value.
- Restore it at the end.
- Run Anvil through the terminal MCP, since `anvil run` doesn't expand slash commands.

**Fixtures:** all outside `/tmp`. Create them under `~/dev/helse/goodbye-e2e/` and delete them afterwards:
- (a) a git repo with a linked worktree at a path containing a space, with one tracked file;
- (b) `~/dev/topics/goodbye-scratch/` with an `AGENTS.md` whose Files section names `log.md`;
- (c) a second worktree of the same repo as (a).

**Steps:**

1. [ ] **(a) Worktree.** Start Anvil in worktree (a), edit the tracked file, record `git status --porcelain`, then run `/goodbye`.
   - Expect: `NOTES.local.md` created at the worktree root, the status unchanged, and no other files written. Compare `find ~/dev/helse/goodbye-e2e ~/.agents -newer <marker> -type f` before and after.
2. [ ] **Repeat run.** Hand-edit one line in (a)'s `NOTES.local.md`, add a `## My notes` section, and run `/goodbye` again.
   - Expect: both survive, no section is duplicated, and the report lists any unconfirmed lines.
3. [ ] **(b) Topic.** Start Anvil in the topic, edit a file, then run `/goodbye`.
   - Expect: only topic files change, and no `NOTES.local.md` is created.
4. [ ] **Mixed.** Start Anvil in `~/dev` and edit files in (a) and (c), then run `/goodbye`.
   - Expect: each worktree gets notes about its own branch, one primary holds the cross-cutting handoff, and (a)'s earlier notes aren't replaced by a pointer.
5. [ ] **Research-only.** Start Anvil in `~/dev` with no edits, then run `/goodbye`.
   - Expect: either notes in `~/.agents/notes/` with a reason, or "nothing worth keeping". No error either way.
6. [ ] **Privacy.** In (a), mention a synthetic marker `SECRET_TOKEN=abc123` and the word "Anvil" in the conversation, then run `/goodbye`.
   - Expect: the token doesn't appear in any written file.
7. [ ] **Read-back.** Quit, start a new Anvil process in (a), and ask "Without running tools, what's the state of this work?"
   - Expect: the answer matches the notes.
8. [ ] **Archive.** Follow `finishing-a-development-branch` Option 1 in (c).
   - Expect: the archive file exists under `~/.agents/notes/archive/` before the worktree disappears.
9. [ ] **Clean up.** Restore `plugins[0].path`, then delete the fixtures and the scratch topic.

**Verify:** record each scenario's outcome, the paths written and transcript excerpts as a checklist at the bottom of this plan.

## Deferred task

### Task 5 (optional): DB-backed discovery script

Build only if Task 4 or real use shows `/goodbye` missing locations. Requirements:

- Read `~/.local/share/anvil/anvil.db` read-only, for `$ANVIL_ROOT_SESSION_ID` and every descendant session (walk `parent_session_id` until no new children appear).
- Count only `edit`/`multiedit`/`write` calls whose matching tool result succeeded. Join on the tool call ID, and check the stored result shape first with a read-only query.
- Resolve relative paths against each session's `working_dir`.
- Skip `agentic_fetch` sub-sessions, which work in a scratch dir under the project directory.
- Ignore non-file inputs.
- Report bash-only sessions as "edits may be missing".
- Test with fixtures outside excluded temp roots, covering:
  - a topic inside an ignored repo;
  - two worktrees of one repo;
  - spaced paths and deleted paths;
  - failed calls;
  - bash-only and empty sessions.

## Open questions

- **Reflect at goodbye.** Should `/goodbye reflect` also run `mining-corrections` in session mode? The user prefers bulk reflection, and step 5's ledger lines are the cheap version. Defer until the bulk runs show whether per-session runs add anything.
- **Notes budget.** About 120 lines is a guess. Revisit after a few weeks of real notes.
- **Topic size.** The Spain topic's `CLAUDE.md` is about 144 KB and loads whenever a session starts there. It's out of scope here but worth a separate look.

<!-- Review notes (devils-advocate, 2026-10-04): caught that tool calls in anvil.db are attempts and bash edits are invisible (script deferred to Task 5 with the fixes); that `skills:` preload drops the skill's location (command now loads by name); that one-handoff-plus-pointers could overwrite another worktree's notes (each worktree now keeps its own); that "preserve user edits" had no ownership rule (agent owns template sections only); that promotion could leak private state into tracked/shared places (privacy boundary, drafts in chat only); that context files are read at prompt build, not per turn; that the e2e needs the plugin pointed at this worktree and fixtures outside /tmp; that finishing-a-development-branch already contradicts itself on Option 2; that ANVIL.md is git-ignored and only exists in the root checkout. Phasing was suggested but declined: one repo, ~5 small files, and the only independently risky piece is deferred. -->
