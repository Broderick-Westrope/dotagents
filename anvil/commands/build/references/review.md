Review the full diff of branch `{{branch}}` against `{{base}}`. The branch is checked out at `{{worktree}}`; get the diff with `git -C "{{worktree}}" diff {{base}}...HEAD` and read the surrounding code where you need context. The change implements {{doc}}. Don't edit anything.

Report every finding through `submit_result`: one entry per issue, with its severity (`critical`, `important` or `minor`), the file and line, a short title and the reasoning. Use `verdict: "approve"` only if there's nothing critical or important.
