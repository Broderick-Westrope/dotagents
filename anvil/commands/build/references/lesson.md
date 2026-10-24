The devil's advocate judged this approach wrong:

<verdict>
{{verdict}}
</verdict>

Don't patch it; a fresh builder will start over from the base. Before replying:

- If you built on the design doc's own branch, reset that branch to the commit it was on before your first build commit, so its docs stay and this approach's code goes.
- If the change has a design doc, record what this approach taught in it, so it isn't lost, and commit it when it lives on a branch. (Reviewers read a copy taken when the build started, so this doesn't sway them.)
- Remove the other worktrees this approach created and delete their branches with `wtp`, as **using-git-worktrees** describes. Leave anything you didn't create, including the design doc's worktree.

Reply with a summary of the approach you took (`approach`) and the lesson for whoever rebuilds it (`lesson`). If you couldn't remove something, say what and where in `lesson`.
