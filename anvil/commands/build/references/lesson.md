The devil's advocate judged this approach wrong:

<verdict>
{{verdict}}
</verdict>

Don't patch it; a fresh builder will start over from the base. Before replying:

- If the change has a design doc, record what this approach taught in it, so it isn't lost. (Reviewers read a copy taken when the build started, so this doesn't sway them.)
- Remove this approach's worktrees and delete their branches with `wtp`, as **using-git-worktrees** describes. Leave anything you didn't create.

Reply with a summary of the approach you took (`approach`) and the lesson for whoever rebuilds it (`lesson`). If you couldn't remove something, say what and where in `lesson`.
