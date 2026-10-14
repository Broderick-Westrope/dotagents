The devil's advocate reviewed the current version and found the following. Fix each finding in the worktree at `{{worktree}}`, keeping tests green, and commit each fix separately (don't amend earlier commits).

<findings>
{{findings}}
</findings>

Then do the cleanup pass below. Whether or not it changes anything, finish by rewriting the build note at `{{note}}` so it describes the current version, not the history of changes.
