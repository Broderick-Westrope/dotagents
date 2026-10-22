---
description: Write a REVIEW_GUIDE.md that explains an existing change and orders its files for review
argument_hint: "[pr-url | branch | worktree]"
---

Write a `REVIEW_GUIDE.md` for an existing change. The reader is the user: they want to understand the change, then review its files in a sensible order.

Target: $ARGUMENTS

## 1. Find the change

Resolve the target in this order: the argument (a PR link, branch or worktree), else the PR or change already under discussion, else the current worktree's branch against its base. Read the full diff, the PR description and linked ticket when there is one, and enough surrounding code to explain the change rather than just describe the diff. Done when you can state why the change exists and how its parts connect.

## 2. Pick the scope and location

- **Local change**: write the guide at the root of the worktree the change lives in.
- **PR**: write it at the root of the worktree for the PR's branch. If none exists, create one with `wtp add <branch> --stay` (load the **using-git-worktrees** skill first).
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

Diagrams and code references are tools. Add a Mermaid diagram where it shows a flow, sequence, state change or structure faster than prose does; one or two carry most guides. Cite `path:line` where a claim needs grounding or the reader will want to jump straight to the spot.

Done when every changed file appears in exactly one review group or the skim list. Reply with the guide's path and a two-line summary of the review order.
