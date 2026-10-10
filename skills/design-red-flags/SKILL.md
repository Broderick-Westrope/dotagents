---
name: design-red-flags
description: "A checklist of structural design problems (shallow modules, pass-throughs, information leakage, shotgun surgery and others), each with how to spot it, the fix, and the test that confirms it. Used by architecture surveys, code review and design decisions."
unlisted: true
---

# Design Red Flags

The next contributor to any codebase is probably an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Every flag below gets copied and spreads. Catch them while they are small.

Sources: Ousterhout's *A Philosophy of Software Design* (depth, information hiding, pass-throughs), Fowler's *Refactoring* chapter 3 (code smells), Feathers' *Working Effectively with Legacy Code* (seams). For the vocabulary (module, interface, deep, shallow, seam) and Go-specific rules, load the **go-style** skill when the code is Go.

## How to Use It

- A flag is a judgement call, not a rule. Report one only when you can point at `file:line` and say what it costs: which change got harder, which reader has to trace further, which bug it invites.
- The repo's own docs and consistent patterns win over this list. If the repo deliberately does something listed here, it is not a finding.
- Name the flag exactly as written here, so findings from different agents can be grouped.
- Prefer the fix that deletes code. A finding whose fix adds a layer needs a stronger case than one whose fix removes one.

## Module Shape

| Flag | Spot it | Fix |
|---|---|---|
| **Shallow module** | The exported surface is about as complex as what it hides. Callers must understand the internals to use it. | Merge it into its caller, or move more of the work behind the interface. |
| **Pass-through** | A function or type forwards calls to another with the same or nearly the same signature. Deletion test: delete it and the complexity vanishes. | Inline and delete. |
| **Middle man** | Most methods of a type just delegate to one other type. A pass-through at type scale. | Let callers use the delegate directly. |
| **Speculative generality** | An interface type with one implementation and no test-only need, a config option nobody sets, a parameter always passed the same value, a hook with no users. | Delete it. Add the seam when the second implementation arrives. |
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
| **Tests reach internals** | Tests call unexported helpers or assert on private state because the behavior can't be observed through the public surface. | The package is probably hiding a second module. Test through the interface, or split the module out. |
| **Mocking your own code** | Tests fake the repo's own packages or the database. | Test against the real code. Keep fakes for other services, vendor clients and out-of-process infrastructure. |

## Confirming a Finding

Before reporting a flag, check it holds:

1. Re-read the cited lines. Don't report from memory or from a search snippet.
2. Run the deletion test: imagine removing the module or layer. Say what would happen to the callers.
3. Count the evidence: how many callers, files or commits show the problem. One instance is usually a note, not a finding.
4. Name the cost in one sentence. If you can't, drop it.
