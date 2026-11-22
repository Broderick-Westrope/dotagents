---
description: "End this session: record everything worth keeping in the right topic, then close the session and its herdr tab"
argument_hint: "[here] (wrap up in this tab and watch, instead of in the background)"
---

Brodie is done with this session. Mode from Brodie, if any: $ARGUMENTS

The scripts are in `scripts/` beside this file (the directory of the `COMMAND.md` location; quote the path, it may contain spaces). The procedure every wrap-up follows is `wrap.md` in the hub: `$WRAP_HUB`, else `~/dev/topics/hub`.

**Background (the default, inside herdr).** Run `"<command dir>/scripts/wrap-launch"` with the bash tool. It returns at once; a detached process waits for this turn to end, closes the tab, continues this session without a UI to run the wrap-up, and notifies Brodie with what was recorded. Then reply with one line: `Wrapping up in the background; this tab closes in a moment.` Make no other tool calls after the launch: the wrap-up starts only once your reply finishes.

**Here** (the argument is `here`, or `HERDR_TAB_ID` is unset, or the launcher exits non-zero). Run the wrap-up yourself now by following the hub's `wrap.md`, and show Brodie its report. Then, inside herdr, run `"<command dir>/scripts/wrap-launch" --close-only`, which records the wrap in the ledger and closes the tab once your reply ends, and reply with the report line only. Outside herdr, tell him the session can be closed.

`scripts/README.md` covers the nightly sweep, the weekly review, the guard hook and how they're installed.
