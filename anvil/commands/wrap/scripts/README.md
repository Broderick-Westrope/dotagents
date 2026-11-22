# /wrap scripts

The machinery behind `/wrap`. The personal half lives in the hub (`$WRAP_HUB`, default `~/dev/topics/hub`): `wrap.md`, the procedure every wrap-up follows, plus `state/` and `reports/`. Everything here is the same whichever notes you wrap into.

| Script | When | What it does |
|---|---|---|
| `wrap-launch` | `/wrap` runs it | Detaches, waits for the session's turn to end, closes the herdr tab, then continues the session with `anvil run --session` so the wrap-up has the whole conversation and a warm prompt cache. Closing the tab kills the window, so it then dismisses the session's recovery record (`anvil session recover --clear <id>`, Anvil#174) to keep it off `anvil session recover`. `--close-only` just closes the tab and records the wrap, after `/wrap here` |
| `sweep` | `/today` starts it in the background when its dry run finds leftovers | Wraps top-level sessions idle 3h+ whose activity the ledger hasn't covered, from a text-only transcript extract, in a fresh session each. Skips subagent, workflow, benchmark and `/tmp` sessions, sessions under 6 messages or 2 user turns, and sessions whose last turn asked to record things in the topic docs. At most 12 a night |
| `weekly` | Mondays, 04:00 | One fresh session: `mining-corrections` in bulk, wrap-up quality, hub health and inbox proposals, written to `$WRAP_HUB/reports/weekly-<date>.md`. Its `Do now` and `Inbox` sections are what Brodie sees, through `/today` on Mondays |
| `wrap-guard` | Every tool call; acts only when `HUB_WRAP` is set | Non-interactive runs auto-approve every permission prompt, so this allows only reads, `git add <path>` and `git commit`, and edits inside `$WRAP_WRITABLE` (default `~/dev/topics:~/vaults/personal`). Everything else is denied, including destructive git, shell redirects, writes through `gh` or MCP, and delegation beyond @explorer and @librarian |
| `install` | Once, and after changing jobs | Adds the guard to `~/.config/anvil/anvil.json` (with a backup) and writes and loads the launchd jobs, all pointing at this directory, so run it from the checkout Anvil loads. `--uninstall` removes both |
| `hublib.py` | | Shared helpers: paths, the ledger, notifications, `anvil run` |

Only the weekly review is scheduled (launchd runs it on next wake if the laptop slept). The sweep runs while Brodie is at the laptop, so commits are signed normally and a clash with a live session is visible.

## State in the hub

`$WRAP_HUB/state/` (keep it out of git):

- `ledger.tsv`: one row per wrap (`session_id`, `wrapped_at` epoch seconds, `mode` wrap/here/sweep, `status` ok (something was committed, or nothing needed recording), partial (exited cleanly but committed nothing; retried), failed:N, skipped-small or skipped-manual, summary). The sweep treats a session as covered up to its latest ok or skipped row; activity after that gets wrapped again.
- `logs/`: one log per wrap, per night and per week, plus launchd's own output.
- `extracts/<date>/`: the transcripts the sweep fed to each wrap-up.
- `runs/`: the working directory for sweep and weekly sessions, so the sweep never wraps its own runs.

## Running by hand

```bash
scripts/sweep --dry-run          # what the next sweep would wrap
scripts/sweep --limit 1          # wrap one session now
scripts/weekly --print           # the weekly prompt
launchctl kickstart gui/$(id -u)/dev.brodie.hub.weekly   # run the weekly job now
```
