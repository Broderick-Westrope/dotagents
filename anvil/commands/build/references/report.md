End your reply with a report:

- `status: "done"` when you've finished what you were asked to do.
- `status: "slice"`, only while building, when you've finished a slice that later slices depend on and want it challenged before you go on.
- `status: "blocked"` with a `question` for the user when you can't carry on without them: a decision the design doc leaves open, access you don't have, or anything you'd otherwise stop and ask about. Their answer comes back to you. Don't use it for problems you can solve yourself.
- `changed`: whether this turn changed the work (new commits or edits). Always include it.
