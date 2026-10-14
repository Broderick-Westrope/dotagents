Review a change. It implements {{doc}}

The builder's note on the change. Its Where section lists each worktree, branch and base branch; review each full diff with `git -C "<worktree>" diff <base>...HEAD` and read the surrounding code where you need context:

<build_note>
{{note}}
</build_note>

Don't edit anything. Report every finding: one entry per issue, with its severity (`critical`, `important` or `minor`), the file and line, a short title and the reasoning. Use `verdict: "approve"` only if there's nothing critical or important.
