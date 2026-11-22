---
description: "Start-of-day brief: what changed while you were away, and the few things to focus on today (or the next workday)"
argument_hint: "[optional: how you're feeling, time you have, or anything already on your mind]"
---

Brodie switches off outside work hours, so this brief is the bridge back in: it rebuilds where every thread stands from live state and picks the few things worth his day. It is read-only everywhere except `~/dev/topics/days/`: it changes no PR, ticket, Slack message or topic file, and it posts nothing; the one other write is the leftover-session sweep in step 5. Relative paths below are from `~/dev/topics`, the hub, whatever directory the session started in. Brodie's notes, if any: $ARGUMENTS

He works 9:00-17:00 Monday to Friday, Sydney time. Public holidays don't matter.

## 1. Place the day

- `TZ=Australia/Sydney date '+%a %Y-%m-%d %H:%M'` and `date -u '+%Y-%m-%dT%H:%M:%SZ'`.
- Pick the **target day** and the **mode**:
  - Workday before 9:00: plan today, full day.
  - Workday 9:00-15:00: plan the rest of today; say how many work hours are left.
  - Workday 15:00-17:00: the rest of today is for small items and wrap-up; on Friday, suggest `/shutdown` so Monday starts easy.
  - After 17:00, or a weekend: plan the next workday, and open the brief by saying so: nothing in it needs doing tonight.
- If `days/<target day>.md` already has a `## Plan`, this is a **re-plan**: Brodie has planned this day before and wants to see where it stands. That file's `## Plan` and any `## Replan` sections are the day's intent, and **since** is the time of the newest of those headings, converted to UTC.
- Otherwise pick **since**, the start of "what changed while you were away": the time of the newest `## Shutdown` in `days/`, else 17:00 Sydney on the last workday before now, converted to UTC. Read the newest `days/*.md` file: its plan and shutdown are yesterday's intent.

Done when you can state the target day, the mode, whether it's a re-plan, and since in one line.

## 2. Gather, in parallel

Run these in one message:

- **GitHub:** `"<command dir>/github.py" <since UTC>` (the directory of this `COMMAND.md` location; quote it) (about 20 seconds). It prints review requests on Brodie (direct, then team), his open PRs, PRs assigned to him (Gertrude's), his PRs closed since, and PRs mentioning him, with review decision, CI, unresolved threads, conflicts, and who reviewed or commented since (people and bots apart).
- **Linear** (MCP): `list_issues` assigned to `me`, newest first (the first page is enough; it returns done and canceled issues too, so drop those), keeping status, milestone and delegate; `list_milestones` for project P-EN-1298 (target dates); and anything updated since that mentions him if the MCP can filter it cheaply.
- **Slack** (MCP `slack_search_public_and_private`, his user ID `U09ML42RZNG`). Keep it light, three searches, `response_format: concise`:
  - `filters: "is:saved"`, `sort: timestamp`: his saved items. Slack has split saved from its to-do list and the MCP may only see one of them; if what comes back looks stale, say so once in the brief rather than digging.
  - `channel_types: "im,mpim"`, `after:` since (Unix seconds), `sort: timestamp`: DMs and group DMs since. Only people count: DMs from apps (Linear, Bank, Zapier, Claude) are noise, since GitHub and Linear already cover what Linear's DMs say. Set aside his own messages, except as context for a question he's waiting on.
  - `keywords: ["<@U09ML42RZNG>"]`, `after:` since: mentions in channels. Read the thread (`slack_read_thread`) of any mention by a person, so the brief can say what they want.
- **Topic state:** for each topic in the index in `CLAUDE.md` that isn't marked dormant, done or reference only: its current state (`state.md` where the entry file points to one, else the entry file's § Current state) and its last two days of log entries. Topics with an open-work register get it read too: `agentic-pipeline/` has `in-flight.md` § Open PRs and § Designs, `ideas.md` § Short-term plan and `guidance.md`. Also `inbox.md`.
- **Weekly review:** the newest `~/dev/topics/hub/reports/weekly-<date>.md`. Use it only if no earlier day file has shown it (`rg -l 'Weekly review shown: <date>' days/` finds nothing), so it surfaces once, in the first brief after it's written, even when Monday is skipped. Read just its `## Do now` (the first three items) and `## Inbox` sections.
- **Leftover sessions:** `"<command dir>/../wrap/scripts/sweep" --dry-run`, which lists sessions nobody wrapped.

Done when every source has answered or failed; a failed source gets one line in the brief, not a retry loop.

## 3. Sort every thread

Join GitHub, Linear, Slack and the topics by PR URL, ticket ID or subject, so one piece of work is one thread. `agentic-pipeline/in-flight.md` is a snapshot: where it disagrees with GitHub, GitHub wins, and the disagreement goes in the brief's last section for `/health-check`.

Put each thread in the first bucket it fits. This is Brodie's order: close out what's started before starting anything new.

1. **Unblock others.** Someone is waiting on Brodie: a person (not a bot) asked him something in a DM or mention, a teammate's important PR needs his review, or a PR of his blocks someone else's. Codeowner review requests on PRs he has no stake in are noise: count them in one line, and only lift out PRs from the AI team, from people he's working with in this folder, or ones that ask for him by name in a comment.
2. **Close your own.** His PRs that can move today: approved and green (merge), new review comments from people (answer them), lgtm-buddy findings on his PRs (`agentic-pipeline/CLAUDE.md` § Conventions: act on them), CI red, conflicts, drafts that are finished but not marked ready, merged work with a post-merge check due (`in-flight.md` § Merged).
3. **Nudge.** PRs ready and waiting on a reviewer for more than a workday. These cost minutes: a ping, not a focus slot. In the AI team review is light-touch and trusted, so a nudge is usually all it needs.
4. **Build what's planned.** Designs or tickets already agreed (status Agreed or Building, the short-term plan, Linear In Progress or Todo), weighted by milestone target date: a milestone due within a week outranks everything here.
5. **New or replan.** Everything else, including ideas and parked work. These are only today's work if buckets 1-4 are empty or he asked for them.

Weigh within a bucket by date pressure (milestone targets, promises made in Slack or to the pilot group), then by how many people it unblocks.

**Work in progress:** count the threads in active build (his drafts and Building work, not PRs waiting on review). If more than three, say so, and prefer finishing one over adding one.

**Re-plan:** before sorting, mark each focus and unblock item from the newest plan section **done**, **moved** or **open**, from the evidence: GitHub, Linear, topic logs, and `git log --since=<since>` in the repos they belong to. Brodie's notes beat the evidence. If items are left with no evidence either way and his notes don't cover them, ask one question naming them ("Did X or Y move outside GitHub and Linear?") and use his answer. Done items leave the sort; open and moved items go into buckets like any other thread.

Done when every thread from step 2 sits in exactly one bucket, or in "safe to ignore today", and on a re-plan every earlier plan item is marked.

## 4. Write the brief

Size it to the mode: a full day gets up to three focus items, an afternoon one or two, a wrap-up only quick items. Each item is one line: what to do, why today, and its link (full PR or Linear URL).

```
**<target day>, <mode>.** <one sentence: the shape of the day>

### Focus
1. ...

### Unblock and nudge (minutes each)
- ...

### Since you were away
- <merges, approvals, people's replies, Gertrude's runs on your work: only what changes a decision>

### Agent system (weekly review <date>)
<only when the weekly review is new: its Do now items, then its Inbox items as `<item> -> <home>`, one line each and numbered so he can answer "do 1, move 2"; omit the section otherwise>

### Safe to ignore today
<one line: N codeowner requests, N parked drafts, N ideas, named by group>

### Questions
<only if the order is a real call: two options, which you'd pick, and why>

### Folder drift
<in-flight rows GitHub contradicts, one line each; omit if none>
```

A re-plan adds a `### Progress` section above Focus, one line per earlier plan item: `done`, `moved: <where it got to>` or `open`. It titles `Since you were away` as `Since the last plan (<time>)`, sizes Focus to the hours left, and keeps open items ahead of new ones of the same bucket.

When priorities conflict in a way the topics can't settle (two milestones pulling, or a new ask from Slack against the plan), say which you'd pick and ask; don't silently choose.

## 5. Record it

Write `days/<target day>.md` (create `days/` if missing). It is for the agent, so keep it short. A first plan writes `## Plan`:

```
# <Day YYYY-MM-DD>

## Plan (<Sydney time written>, since <since>)
- Focus: <items, with links>
- Unblock and nudge: <items>
- Deferred on purpose: <what was left out and why, one line>
- Open questions: <asked in the brief>
- Weekly review shown: <date> (only when the brief included it)
```

A re-plan appends a `## Replan` section and leaves every earlier section as written, so `/shutdown` still sees the original plan and the weekly-review marker stays where step 2 searches for it:

```
## Replan (<Sydney time written>, since <since>)
- Progress: <earlier items, each done, moved or open>
- Focus: <items, with links>
- Unblock and nudge: <items>
- Deferred on purpose: <what was dropped and why, one line>
- Open questions: <asked in the brief>
- Weekly review shown: <date> (only when the brief included it)
```

Commit only that file in the hub repo (`git -C ~/dev/topics add days/<file>`), subject `Plan <Day D Mon>`, or `Replan <Day D Mon>` on a re-plan. Then show Brodie the brief.

If the dry run listed sessions to wrap, start `"<command dir>/../wrap/scripts/sweep"` with `run_in_background` and end the brief with one line: `Wrapping <n> leftover sessions in the background.` It notifies him when it's done.

Done when the brief is shown and the day file is committed.
