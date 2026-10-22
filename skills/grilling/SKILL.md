---
name: grilling
description: "Interview the user about a feature to build shared understanding and produce a design doc. Use when the user wants to think through what to build — whether they already have a clear direction or are still exploring. Handles both targeted requirement refinement and open-ended design exploration through a single adaptive process."
---

# Grilling

Build deep shared understanding of a feature through targeted questioning, then produce a design doc. The design doc is either built right away with the `/build` command or parked until the work is prioritised.

A single entry point for pre-build work. After exploring the codebase and asking a few initial questions, the process adapts: if the user has a clear direction, it focuses on closing the communication gap through targeted grilling; if the direction is unclear, it shifts into approach exploration before converging on a design.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until a design doc has been written and approved. This applies regardless of how clear the feature seems.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this process. A todo list, a single-function utility, a config change — all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The design doc is sized to the project, but it MUST be written and approved.

## Checklist

Complete these steps in order:

1. **Explore project context** — check files, docs, recent commits relevant to the feature
2. **Assess clarity** — ask initial questions to determine if the user has a clear direction or needs exploration
3. **Grill or explore** — targeted questioning if direction is clear; propose approaches if not
4. **Present design** — if approaches were explored, present design sections scaled to complexity and get approval
5. **Write the design doc** — load the **writing-design-docs** skill and follow its steps, from writing the doc through the devil's advocate review to the user's approval

## Process Flow

```mermaid
flowchart TD
    A[Explore project context] --> B[Ask initial questions]
    B --> C{User has clear direction?}
    C -->|yes| D[Targeted grilling]
    C -->|no| E[Propose 2-3 approaches]
    C -->|partially| D
    D --> F{Shared understanding?}
    F -->|no, more questions| D
    E --> G[Present design sections]
    G --> H{User approves design?}
    H -->|no, revise| G
    H -->|yes| I[Write, review and get the design doc approved with writing-design-docs]
    F -->|yes| I
    I --> M{Build now?}
    M -->|yes| N([User runs /build with the doc path])
    M -->|no| O([Park the doc])
```

The terminal state is the approved design doc, which the user builds with `/build` or parks for later. Do NOT start implementing or invoke any implementation skill.

## Phase 1: Explore Context

**Start with the codebase, not the user:**

Before asking any questions, explore the project context. Read files, docs, and recent commits relevant to the feature area. Answer as many questions as you can from the code itself — don't ask the user what you can discover.

**Assess scope early:**

Before asking detailed questions, assess scope: if the request describes multiple independent subsystems (e.g., "build a platform with chat, file storage, billing, and analytics"), flag this immediately. Do not spend questions refining details of a project that needs to be decomposed first.

If the project is too large for a single design doc, help the user decompose into sub-projects: what are the independent pieces, how do they relate, what order should they be built? Then grill on the first sub-project through the normal flow. Each sub-project gets its own design doc and build cycle.

## Phase 2: The Questioning Process

**Ask questions one at a time:**

- One question per message. Wait for the answer before continuing.
- For each question, provide your recommended answer based on what you've learned from the codebase and conversation so far. This gives the user something concrete to react to rather than answering from scratch.
- Prefer multiple choice when possible, but open-ended is fine for nuanced topics.

**Detect the user's clarity level early:**

After 2-3 initial questions, you'll know whether the user has a clear direction or is still exploring. Don't ask them to classify themselves — infer it from their answers:

- **Clear direction**: They give specific, confident answers. They know what they want and why. → Shift to targeted grilling (Phase 2a).
- **Exploring**: Answers are tentative, they ask "what do you think?", or they describe a problem without a solution. → Shift to approach exploration (Phase 2b).
- **Mixed**: Some aspects are clear, others aren't. → Grill on the clear parts, explore the uncertain ones.

Conversations drift. A user might start clear and realize they're unsure about the approach mid-grill. Or start fuzzy and crystallize quickly. Adapt as you go — there's no wrong transition.

### Phase 2a: Targeted Grilling

When the user has a direction, the goal is to close the communication gap — make sure the agent understands the user's intent precisely.

**What to grill on:**

- **Intent** — what problem does this solve, who benefits, what does success look like?
- **Boundaries** — what's in scope, what's explicitly out, where does this touch other systems?
- **Constraints** — performance targets, compatibility requirements, tech stack mandates
- **Behaviour** — edge cases, error states, what happens when things go wrong
- **Existing patterns** — how does this fit with what's already in the codebase?

**Suggest alternatives to deepen understanding:**

When you spot potential issues or better approaches, suggest them. Not to explore alternatives (the user has a direction), but as a tool for understanding *why* they chose their approach. If they decline, their reasoning reveals intent that pure Q&A might miss.

**Know when to stop:**

Grilling is complete when you can confidently describe the feature back to the user — its purpose, boundaries, constraints, and key behaviours — and they agree. Don't over-grill simple features.

### Phase 2b: Approach Exploration

When the user is still figuring out what to build, help them converge on a direction.

**Exploring approaches:**

- Propose 2-3 different approaches with trade-offs
- Present options conversationally with a recommendation and reasoning
- Lead with the recommended option and explain why

**Presenting the design:**

- Once the idea is understood, present the design
- Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing
- Be ready to go back and clarify if something does not make sense

**Design for isolation and clarity:**

- Break the system into smaller units that each have one clear purpose, communicate through well-defined surfaces, and can be understood and tested independently
- For each unit, answer: what does it do, how do you use it, and what does it depend on?
- Can someone understand what a unit does without reading its internals? Can the internals change without breaking consumers? If not, the boundaries need work.
- Smaller, well-bounded units are also easier to work with — reasoning is better about code that fits in context at once, and edits are more reliable when files are focused. When a file grows large, that is often a signal that it is doing too much.

**Working in existing codebases:**

- Explore the current structure before proposing changes. Follow existing patterns.
- Where existing code has problems that affect the work (e.g., a file that has grown too large, unclear boundaries, tangled responsibilities), include targeted improvements as part of the design — the way a good developer improves code they are working in.
- Do not propose unrelated refactoring. Stay focused on what serves the current goal.

## After the Questioning

Load the **writing-design-docs** skill and follow it. It holds the template, the devil's advocate review and the user review. Fill the template from the shared understanding: Problem from the user's intent, Scope from the boundaries, Constraints and Success Criteria from those discussions, Decisions from the choices made and the alternatives the user declined, and Context Files from the code you explored.

Stop at the approved design doc. Building starts when the user runs `/build`.

## Key Principles

- **One question at a time** — Do not overwhelm with multiple questions
- **Multiple choice preferred** — Easier to answer than open-ended when possible
- **YAGNI ruthlessly** — Remove unnecessary features from all designs
- **Adapt to clarity** — Grill when the user is clear, explore when they're not
- **Incremental validation** — Present design, get approval before moving on
- **Be flexible** — Go back and clarify when something does not make sense
