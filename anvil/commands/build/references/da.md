Review an early version of a change and challenge its premise and approach before it goes to code review.

Design doc or request: {{daDoc}}

The builder's note on what it assumed and decided. Its Where section lists each worktree, branch and base branch; review each full diff with `git -C "<worktree>" diff <base>...HEAD`, and check `git -C "<worktree>" status` for uncommitted work, which isn't part of the change yet. If the Where section doesn't lead to the change the note describes, that's a finding:

<build_note>
{{note}}
</build_note>

Judge the current version on its own. Attack the assumptions in the note and the ones the diff hides. Check that the change does what the design doc asks and nothing it rules out, and that it's in the right place. If the change includes database migrations, protobuf or public API contracts, or spans several services, focus on reversibility and rollout order. Don't edit anything.

Finish with:

- `kind: "wrong-approach"` when the premise or approach is wrong and patching it would be worse than rebuilding. Explain why in `lesson`, written so a fresh builder can avoid the same mistake.
- `kind: "changes"` when the approach holds but there are findings worth fixing, including anything the builder can't fix without the user. List each in `findings`.
- `kind: "clean"` when there's nothing worth changing.
