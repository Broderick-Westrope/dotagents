Review an early version of a change and challenge its premise and approach before it goes to code review.

- Design doc or request: {{daDoc}}
- Base branch: `{{base}}`
- The change is on branch `{{branch}}`, checked out at `{{worktree}}`. Review the full diff with `git -C "{{worktree}}" diff {{base}}...HEAD`.

The builder's note on what it assumed and decided:

<build_note>
{{note}}
</build_note>

Judge the current version on its own. Attack the assumptions in the note and the ones the diff hides. Check that the change does what the design doc asks and nothing it rules out. If the change includes database migrations, protobuf or public API contracts, or spans several services, focus on reversibility and rollout order. Don't edit anything.

Finish by calling `submit_result` with:

- `kind: "wrong-approach"` when the premise or approach is wrong and patching it would be worse than rebuilding. Explain why in `lesson`, written so a fresh builder can avoid the same mistake.
- `kind: "changes"` when the approach holds but there are findings worth fixing. List each in `findings`.
- `kind: "clean"` when there's nothing worth changing.
