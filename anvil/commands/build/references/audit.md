Several reviewers reviewed branch `{{branch}}` against `{{base}}` (checked out at `{{worktree}}`; diff with `git -C "{{worktree}}" diff {{base}}...HEAD`). Their findings, each with an id and the reviewer that raised it:

<findings>
{{findings}}
</findings>

Audit every finding before anyone acts on it. For each id, read the code and decide:

- `confirmed`: the issue is real. Give the severity you'd assign (`critical`, `important` or `minor`), which may differ from the reviewer's.
- `rejected`: the issue isn't real, or doesn't apply. Say why.
- `duplicate`: the same issue as another finding; set `duplicateOf` to that id.

Return exactly one disposition per id through `submit_result`. Don't edit anything.
