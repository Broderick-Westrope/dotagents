The devil's advocate is satisfied with the change so far. Build the next slice of {{doc}}

Work as before: test-first, committing as you go, in the change's worktrees (or new ones if the slice needs another repository). Then rewrite the build note at `{{note}}` so it describes the whole change as it now stands, including its Where section. Report `slice` again if more slices will depend on this one, or `done` once the whole change is built.
