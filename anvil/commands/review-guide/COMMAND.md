---
description: Write a REVIEW_GUIDE.md that explains an existing change and orders its files for review
argument_hint: "[pr-url | branch | worktree] [--no-file]"
---

Write a `REVIEW_GUIDE.md` for an existing change. The reader is the user: they want to understand the change, then review its files in a sensible order.

Target: $ARGUMENTS

With `--no-file`, give the same guide in chat instead of writing it.

## 1. Find the change

Resolve the target in this order: the argument (a PR link, branch or worktree), else the PR or change already under discussion, else the current worktree's branch against its base. Read the full diff, the PR description and linked ticket when there is one, and enough surrounding code to explain the change rather than just describe the diff. If `/review` already ran this session, build on its findings. Done when you can state why the change exists and how its parts connect.

## 2. Pick the scope and location

- **Local change**: write the guide at the root of the worktree the change lives in.
- **PR**: write it at the root of the worktree for the PR's branch. Set that up and open the editor by running these from the PR repo's local clone: the `~/dev/*/<repo>` whose `origin` matches the PR (ask if none does).

  ```bash
  branch=$(gh pr view <pr> --json headRefName -q .headRefName)
  git fetch origin "$branch"
  wtp add "$branch" --stay   # skip when `wtp list` already shows the branch
  wtp exec "$branch" -- code .
  ```
- **Spread across worktrees**: decide whether one worktree is the **primary** and the rest are **satellites** (small accompanying changes such as infra, deployment config or monitors).
  - Primary plus satellites: one guide in the primary worktree, with the satellites as their own review group.
  - Several substantial worktrees: one guide per worktree, and only for the worktree the user asked about. Name the others and offer to do them next.

Leave the guide uncommitted.

## 3. Write the guide

Sections, in order:

1. **Summary**: what changed and why, in a few sentences.
2. **How it works**: the mental model a reviewer needs before reading code: the flow, the new or changed boundaries, the key decisions and their reasons.
3. **Review order**: numbered groups of related files, ordered by dependency direction (contracts, schemas and core types first; implementations, then wiring and callers; tests after the code they exercise). Each group gets a one-line reason it comes here, its files as relative paths, and what to check while reading it. When the files have no natural order, say so and group by area instead.
4. **Skim or skip**: generated code, lockfiles, snapshots, mechanical renames.
5. **Worth asking the author**: open questions, risks, or surprising choices, framed as questions. Omit when there are none.

Size the guide to the change: a small change gets a short guide. Write plain, direct sentences in everyday words, one point each. The user can ask follow-up questions, so cover what they need to start reviewing and leave the rest for those.

Diagrams and code references are tools. Add a Mermaid diagram where it shows a flow, sequence, state change or structure faster than prose does; one or two carry most guides. Cite `path:line` where a claim needs grounding or the reader will want to jump straight to the spot.

Done when every changed file appears in exactly one review group or the skim list. Reply with the guide's path and a two-line summary of the review order.

## 4. After the guide

The user reviews; you answer their questions. They make every judgement, so stay read-only: explain the code, and leave fixes, approval and rejection to them.

- Ground each answer: "found at `path:line`" for what you saw, "inferring from ..." for what you didn't.
- When answering turns up something new and noteworthy, flag it once at the end of the reply, framed as worth asking the author.
