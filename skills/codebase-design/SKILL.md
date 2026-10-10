---
name: codebase-design
description: "Structural design knowledge: red flags to spot in code (shallow modules, pass-throughs, information leakage, shotgun surgery and others) with their fixes, how severe each is in review, and the axes for comparing design options. Used by architecture surveys, code review and design decisions."
unlisted: true
---

# Codebase Design

The next contributor to any codebase is probably an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Every flag below gets copied and spreads. Catch them while they are small.

Sources: Ousterhout's *A Philosophy of Software Design* (depth, information hiding, pass-throughs), Fowler's *Refactoring* chapter 3 (code smells), Feathers' *Working Effectively with Legacy Code* (seams). For Go-specific rules, also load the **go-style** skill.

## Vocabulary

Use these terms exactly. Mixing them up leads agents to add interface types when the goal was a smaller surface. Never write bare "interface": say **surface** for what callers see, or **interface type** for the language construct.

| Term | Meaning |
|---|---|
| **Module** | A unit of code with a public surface and hidden internals: a package, a class, a service. The language's style skill says which unit counts. |
| **Surface** | Everything a caller must know to use a module: its public names plus their behavior, error modes, ordering rules, and invariants. |
| **Interface type** | A language-level declaration such as a Go `interface`, a TypeScript `interface` or an abstract class. One way to build a seam, and a separate decision. |
| **Deep** | A lot of behavior behind a small surface. |
| **Shallow** | The surface is about as complex as what it hides, so the module adds a layer without removing any work. |
| **Seam** | A place where behavior can change without editing callers. A module's surface is the default seam. An interface type is only worth declaring when a real second implementation exists. |
| **Deletion test** | Imagine deleting the module or layer. If the complexity vanishes, it was a pass-through. If it reappears across several callers, it earns its place. |

The surface is also the test surface. If behavior can't be tested through it, the module is probably hiding a second module.

Spot problems in code with the red flags below. Choose between designs with **Comparing Designs** at the end.

## How to Use the Red Flags

- A flag is a judgement call, not a rule. Report one only when you can point at `file:line` and say what it costs: which change got harder, which reader has to trace further, which bug it invites.
- The repo's own docs and consistent patterns win over this list. If the repo deliberately does something listed here, it is not a finding.
- Name the flag exactly as written here, so findings from different agents can be grouped.
- Prefer the fix that deletes code. A finding whose fix adds a layer needs a stronger case than one whose fix removes one.

## Module Shape

| Flag | Spot it | Fix |
|---|---|---|
| **Shallow module** | The exported surface is about as complex as what it hides. Callers must understand the internals to use it. | Merge it into its caller, or move more of the work behind its surface. |
| **Pass-through** | A function or type forwards calls to another with the same or nearly the same signature. Deletion test: delete it and the complexity vanishes. | Inline and delete. |
| **Middle man** | Most methods of a type just delegate to one other type. A pass-through at type scale. | Let callers use the delegate directly. |
| **Speculative generality** | An interface type with one implementation and no test-only need, a config option nobody sets, a parameter always passed the same value, a hook with no users. | Delete it. Add the interface type when the second implementation arrives; until then the module's surface is the seam. |
| **God module** | One file or type owns several unrelated concerns, and unrelated changes keep landing in it. A file passing about 1,000 lines is the usual sign. | Split by reason to change, not by size. Each part should have a small surface to the others. |

## Knowledge in the Wrong Place

| Flag | Spot it | Fix |
|---|---|---|
| **Information leakage** | Two modules both know the same decision: a format, a protocol, a key layout, an ordering rule. Changing it means editing both. | Give the decision one owner and have the other call it. |
| **Temporal decomposition** | Code is split by the order things happen (read, then parse, then save) rather than by what each part knows, so one piece of knowledge is spread across steps. | Regroup around the knowledge. |
| **Feature envy** | A function spends most of its time reading another module's data. | Move it to the data it uses. |
| **Message chains** | `a.B().C().D()`: the caller navigates a structure it shouldn't know. | Give the first object a method that answers the real question. |
| **Primitive obsession** | Domain concepts passed around as raw strings, ints or maps, with validation repeated at each use. | Introduce a type that parses once and owns the rules. |
| **Data clumps** | The same three or four values travel together through many signatures. | Make them one type. |
| **Wrong-direction dependency** | A low-level package imports a higher-level one (storage imports UI, a shared util imports a feature). | Move the code, or have the higher layer pass in what is needed. Then enforce the direction with a lint rule. |

## Change Patterns

| Flag | Spot it | Fix |
|---|---|---|
| **Shotgun surgery** | One logical change needs small edits across many files. Check `git log` for commits that keep touching the same scattered set. | Pull the scattered knowledge into one module. |
| **Divergent change** | One module changes for several unrelated reasons. | Split it along those reasons. |
| **Growing switch** | A `switch` or `if/else` chain gains a branch per feature, often repeated in several places. | Change the shape: a lookup table, a state machine, or a typed model whose methods own the rules. |
| **Hand-synced state** | Two booleans, two lists, or two maps that must be updated together, or a registry that must be edited whenever a type is added. | Derive one from the other, or make the invalid combination unrepresentable. |
| **Two ways to do one task** | An old and a new API for the same job both still have callers. | Migrate every caller and delete the old path in the same change. |
| **Duplicated concept** | The same logic with the same meaning in three or more places, or two copies that have already drifted. | Extract one owner. Two blocks that look alike but change for different reasons are not duplicates. |

## Tests

| Flag | Spot it | Fix |
|---|---|---|
| **Tests reach internals** | Tests call unexported helpers or assert on private state because the behavior can't be observed through the public surface. | The package is probably hiding a second module. Test through its surface, or split the module out. |
| **Mocking your own code** | Tests fake the repo's own packages or the database. | Test against the real code. Keep fakes for other services, vendor clients and out-of-process infrastructure. |

## Confirming a Finding

Before reporting a flag, check it holds:

1. Re-read the cited lines. Don't report from memory or from a search snippet.
2. Run the deletion test: imagine removing the module or layer. Say what would happen to the callers.
3. Count the evidence: how many callers, files or commits show the problem. One instance is usually a note, not a finding.
4. Name the cost in one sentence. If you can't, drop it.

## Severity in Review

When reviewing a diff, treat these as Important at least, because agents copy them into the next change:

- A change that pushes a file past about 1,000 lines, or adds another concern to a file already past it.
- A new pass-through, middle man, or interface type with one implementation.
- Shotgun surgery: one logical change spread across many files because a decision has no single owner.
- A new branch in a growing switch, or a second way to do a task that already has one.

Also look for **code judo**: a restructuring that would delete whole branches, layers or files rather than tidy them. Suggest it even when the diff is locally fine. Don't ask for helpers extracted only to shorten a function.

## Comparing Designs

When choosing between design options, compare each on these axes and name the tradeoffs rather than just picking a winner:

- **Depth:** how much behavior sits behind how small a surface. Prefer fewer, deeper modules.
- **Locality:** how many files a typical future change touches. Each decision should have one owner.
- **Seams:** where the option lets behavior change without editing callers. Prefer a package's exported API as the seam. An interface type needs a real second implementation (another service, a vendor client, out-of-process infrastructure); otherwise it is speculative.
- **Deletion:** whether the option removes layers or adds them. Prefer the one that leaves less code to read.
- **Testability:** whether behavior can be tested through the module's surface, without mocking the repo's own code.
- **Reversibility and migration cost:** what it takes to undo, and how callers move over.
- **Correctness, performance and operational complexity**, where they differ between options.

Screen each option against the red flags. An option that introduces one needs a stated reason.
