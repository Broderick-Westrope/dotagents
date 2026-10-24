---
name: writing-design-docs
description: "Template and review loop for design docs in plans/design-*.md, the input /build reads. Use when writing or revising a design doc."
---

# Writing Design Docs

A design doc pins down what to build and why, clearly enough that a builder who wasn't in the conversation can build an early version with `/build`. It has three readers: that builder, the devil's advocate who reviews the doc and later the change, and the user who approves it. It records decisions and behaviour, and leaves the how to the builder: code, step lists and file-by-file changes are the builder's call.

Write the prose in the voice of the **writer** skill's Architect persona. This skill owns the structure; the Architect's own Structure and Checklist are for ADRs and architecture docs.

## Steps

1. **Write** the doc to `plans/design-YYYY-MM-DD-<topic>.md` with the template below. A location the user or repository prefers overrides this path. Work on the branch the change itself will land on, named for the change (`feat/retry-webhooks`, not `docs/retry-webhooks`), since `/build` builds on that same branch. When revising, work where the doc already lives. Done when every section is filled, or says "None" and why.
2. **Commit** the doc on its own.
3. **Review.** Dispatch a fresh **devils-advocate** agent with the doc's path. Fix the findings that hold. For a finding you reject, record why under Decisions so the next round sees your reasoning. Commit and re-dispatch. Done when a round brings no finding you accept. After 3 rounds, bring the remaining findings to the user.
4. **Hand over.** Ask the user to review it:

   > "Design doc written and committed to `<path>`. Review it and tell me what to change. When you're ready to build it, run `/build <path>`."

   Apply the changes they ask for and run step 3 again. Done when the user approves. Building it now or parking it is their call; the approved doc is the deliverable.

When revising an existing doc, edit it in place and run steps 2-4 again.

## Template

```markdown
# <Topic> Design Doc

**TL;DR:** <2-3 sentences: what changes, and the key decision behind it.>

**Problem:** <What's broken, missing or needed, and who it affects.>

**Goal:** <The end state once this ships.>

**Scope:**
- In: <what this change covers>
- Out: <what it deliberately leaves alone, and why>

**Constraints:** <Performance, compatibility, rollout order, tech stack.>

**Design:** <How the pieces fit: components, data flow, error handling.>

**Decisions:**
- <Decision>: <why>. Declined: <alternative>, because <reason>.

**Risks and Tradeoffs:** <What this design accepts, and what would show it was the wrong call.>

**Success Criteria:**
- [ ] <A behaviour the builder can check by running or observing something>

**Context Files:**
- `<path>`: <why it matters to the change>
```

- **Design:** add a Mermaid diagram when the change moves a flow or a boundary between components.
- **Decisions:** for a choice between three or more options, a table (option, pros, cons, verdict) reads faster than bullets.
- **Success Criteria:** each one is a check the builder and the devil's advocate can judge the change against, so write observable behaviour ("a duplicate webhook is acknowledged and ignored"), not qualities ("robust").

## Sizing

Size each section to the change. A small change still gets every section, each a sentence long. A large one earns a few paragraphs per section. Past about two pages, the change likely wants splitting into several docs, each built on its own.
