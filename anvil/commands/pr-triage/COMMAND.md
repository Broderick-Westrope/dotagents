---
description: Sort your open PRs into merge, chase, refine, open, rework and close
argument_hint: "[repo filter]"
---

Triage every open PR the user authored and recommend one next move for each. Each run is a fresh **snapshot**: gather the data again, classify every PR from that data alone, and write the full report. When the user runs this again in the same session, the new report replaces the old one, so it reads complete and standalone: every PR, every bucket, current facts. Leave comparisons with earlier runs out of it ("still", "now", "no longer", "since last time").

This command is **read-only**. Gather, read and report. Merging, marking ready, rebasing, commenting, requesting reviewers and closing happen only after the user picks them from the report.

Filter: `$ARGUMENTS` (optional substring of `owner/repo`, e.g. `eucalyptusvc` or `svc.core.ima`; empty means every repo).

## 1. Gather

Run `scripts/gather.sh` from this command's directory (the directory of the `COMMAND.md` location), passing the filter. Quote the path; it may contain spaces:

```bash
"<command dir>/scripts/gather.sh" "$ARGUMENTS" > /tmp/pr-triage.jsonl
gh api user --jq .login
```

It prints one JSON object per open PR authored by the active `gh` account: draft state, review decision, mergeability, failing and pending checks, size, last commit time, reviews, human comments, **unresolved review threads** with their comments, the state of every PR the body links to (`dependencies`), and the first 1,500 characters of the body. It retries flaky `gh` calls and re-asks GitHub once when mergeability is still `UNKNOWN`. It takes a minute or two for twenty PRs. Run it with `auto_background_after` of at least 300.

`@me` is whichever account `gh` is logged in as in the current directory. Name that account at the top of the report. A line with an `error` field means that PR couldn't be fetched. Re-run the script for just that repo, and if it fails again, list the PR under **Couldn't check**.

Done when every PR from the search has a JSON line or is listed under Couldn't check.

## 2. Read each PR

The JSON gives you facts. You decide what they mean. For each PR, work out:

- **Feedback state.** Read every unresolved thread and every review or comment with a body. Feedback is **addressed** when the author replied in the thread agreeing to a change and a commit landed after that reply, or when the author's reply settles the question. It is **open** when the reviewer spoke last and no commit came after, or when reviewers disagree with each other. Bot reviews (`lgtm-buddy`, risk and security scanners, Atlantis, Linear) count only when they flag a real finding.
- **Dependencies.** Read the body for ordering: "stacked on", "merge after", "deploy after", "don't merge before", "companion to". `dependencies` gives each linked PR's state. A PR is **gated** while a PR it must follow is still open. A linked PR that closed without merging means the plan changed; check whether a replacement exists.
- **Health.** Failing checks: tell flaky or unrelated failures from real ones by name, and treat a failing security or secrets scan as worth investigating on any PR. Merge conflicts (`DIRTY`) and branches behind base (`BEHIND`) need a rebase.
- **Staleness.** Measure age from the later of the last commit and the last human comment. More than 14 days quiet is stale. For stale PRs that depend on outside state (data mutations pinned to reviewed values, vendor API behaviour, config), say what to re-check before moving them.

Done when you can state, for every PR, its feedback state, gates, health problems and age.

## 3. Classify

Put each PR in exactly one bucket, taking the first that fits:

| Bucket | Fits when |
|---|---|
| **Close or rethink** | Quiet for more than 30 days with no review activity, or it has no description and failing checks, or a linked PR closing shows the plan moved on. Say why it might still be worth keeping. |
| **Merge now** | Ready for review, approved, `CLEAN`, all feedback addressed, not gated. |
| **Refine, then merge** | Ready for review, with open feedback, conflicts, failing checks, or approved but behind. |
| **Chase review** | Ready for review, healthy, no open feedback, waiting on a reviewer. Gated PRs go here with their gate named. |
| **Open the draft** | Draft, healthy, no open feedback, and the work looks complete for its stated scope. |
| **Rework before opening** | Draft with open feedback, design disagreement, conflicts, failing checks, or a reviewer concern that changes the approach. |

Done when every PR from step 1 appears in exactly one bucket or under Couldn't check.

## 4. Report

Header: the `gh` account, the filter if any, the snapshot time, and the PR count per bucket.

Then one section per bucket in the table order above, skipping empty buckets. For each PR give its full URL and one or two lines: the facts that put it there and the concrete next move. Name reviewers, threads and gates specifically (who disagrees about what, which PR must merge first). Where PRs belong together (companion PRs, a shared workflow and its callers, stacked PRs), group them in the same bucket and give their order.

When two or more PRs are ordered by gates, add a Mermaid `flowchart LR` of the merge order.

End by offering the actions the report suggests, such as merging the merge-now PRs, rebasing the conflicting ones, marking drafts ready or nudging reviewers, and wait for the user to choose.
