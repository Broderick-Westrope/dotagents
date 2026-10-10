---
name: domain-modeling
description: "Keeps a repo's GLOSSARY.md and architecture decision records (docs/adr/) up to date. Use when naming or renaming a type, package or concept, when two names are used for the same thing (or one name for two things), when the user asks what a term means in this codebase, or when a hard-to-reverse design decision should be recorded as an ADR."
---

# Domain Modeling

Agents name things after whatever the nearest file calls them, so one concept picks up three names and one name ends up meaning two things. A glossary gives every agent and person the same words. ADRs record the few decisions that would otherwise be undone by someone who doesn't know why they were made.

Sources: Evans' *Domain-Driven Design* (ubiquitous language, bounded contexts) and Nygard's ADR format.

## The Glossary

One `GLOSSARY.md` at the repo root. Create it the first time a term needs defining, not before.

### Format

```markdown
# Glossary

Terms used in this codebase. Code, docs and conversations use these words with these meanings.

## Session

A conversation between the user and an agent, stored with its messages.

- **Code:** `session.Session` (`internal/session`)
- **Not:** chat, thread, conversation. A **branch** is a fork of a session, not a separate session.
```

- One heading per term, alphabetical.
- Define what it is in the domain, in one to three sentences. No implementation detail beyond where it lives in code.
- **Code:** the type or package that owns it.
- **Not:** the synonyms to avoid, and the nearby terms it gets confused with.
- If the same word means different things in different parts of the system (a bounded context), give each part its own entry: `## Session (auth)` and `## Session (agent)`.

### When to Update It

Update it in the same change that introduces or renames the concept. Don't batch glossary edits for later.

- **New concept:** add an entry when a new type or package names something a reader would need defined.
- **Two names, one thing:** pick one with the user, add the others under **Not:**, and rename the code to match in the same change or a follow-up the user agrees to.
- **One name, two things:** split it. Name both, and say which code uses which.
- **Fuzzy term:** when the user or the code uses a vague word ("handler", "manager", "data", "info"), ask what it actually is. Offer a recommended name.

Before naming a new type, function or package, check the glossary. Use the existing term if one fits. If the code disagrees with the glossary, say so; don't silently follow either.

## ADRs

Record a decision as an ADR only when all three hold:

1. **Hard to reverse:** undoing it later means a migration, a rewrite, or breaking callers.
2. **Surprising without context:** a capable newcomer would look at it and want to change it.
3. **A real trade-off:** there was a credible alternative, and choosing it would have cost something.

Most decisions fail this test. Those go in the commit message or PR description instead.

### Format

Save as `docs/adr/NNNN-short-title.md`, numbered in order. Create the directory with the first ADR.

```markdown
# NNNN: <Decision as a short statement>

**Status:** Accepted | Superseded by NNNN
**Date:** YYYY-MM-DD

## Context

<The forces at play: what problem, what constraints, what made this hard. Facts, not the decision.>

## Decision

<What was decided, in one paragraph.>

## Alternatives

<Each credible alternative and why it lost.>

## Consequences

<What becomes easier, what becomes harder, and what would make us revisit it.>
```

- Never edit an accepted ADR's decision. Supersede it with a new one and update the old one's status.
- Keep it under a page. For the prose style, load the **writer** skill and use The Architect persona.
- When a later change conflicts with an ADR, raise it with the user rather than working around it.

## Done When

- Every new or renamed concept in the change has a glossary entry, and the code uses the glossary's term.
- Any decision that passes all three ADR tests has an ADR.
- Conflicts between code, glossary and ADRs have been raised with the user.
