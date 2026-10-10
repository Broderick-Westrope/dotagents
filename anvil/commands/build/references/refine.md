The devil's advocate reviewed the current version and found the following. Fix each finding in the worktree at `{{worktree}}`, keeping tests green, and commit each fix separately (don't amend earlier commits).

<findings>
{{findings}}
</findings>

Then re-read the whole diff against `{{base}}` as one change and clean up its structure: pass-through layers, shallow modules, duplicated concepts, growing switches, unclear names, and code in the wrong place. Use the matching style skill and **refactoring-code**. Commit cleanup separately from behaviour changes.

Finally rewrite the build note at `{{note}}` so it describes the current version, not the history of changes.
