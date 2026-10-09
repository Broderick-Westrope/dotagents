---
name: go-style
description: "Go design conventions for any Go repository: package depth, when to extract a function, when to declare an interface type, where error details go, and how to lay out tests. Use when writing, editing, or reviewing Go code, or when deciding how to structure a Go package."
---

# Go Style

This skill covers design decisions. Naming, formatting, enums, and time injection live in **euc-go**, which applies in every Go repo. **euc-go-microservice** adds service layout rules in Eucalyptus services.

## Precedence

1. The repo's own docs (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`) and its consistent existing patterns.
2. Company skills (`euc-*`) in Eucalyptus repos.
3. This skill.

The rules below are written to agree with Eucalyptus practice. They sharpen euc-go's "no single-implementation interfaces" and "prefer inlining" rather than contradict them. If you find a real conflict, follow the higher rule and tell the user. A rule that helps agents is worth proposing to the team, so don't diverge silently.

## Vocabulary

Use these terms exactly. Mixing them up leads agents to add interface types when the goal was a smaller package API.

| Term | Meaning in Go |
|---|---|
| **Module** | A package. (Not a Go module from `go.mod`.) |
| **Interface** | A package's exported API: its identifiers plus their behavior, error modes, ordering rules, and invariants. |
| **Interface type** | A Go `interface { ... }` declaration. A separate decision, covered below. |
| **Deep** | A lot of behavior behind a small exported surface. |
| **Shallow** | The exported surface is about as complex as what it hides. |
| **Seam** | A place where behavior can be swapped without editing callers. |

## Packages

- **Aim for deep packages.** Keep the exported surface small and unexport by default. Callers should get a lot done with a few identifiers.
- **Apply the deletion test.** Imagine deleting the package or function. If the complexity vanishes, it was a pass-through and should go. If the complexity reappears across several callers, it is earning its place.
- **Split by reason to change, not by file size.** Two packages are worth it when they change for different reasons and the surface between them is small. A package that needs most of another package's exported API is the same module in two places.
- **The exported API is the test surface.** If behavior can't be tested through it, the package is probably hiding a second module (see Tests).

## Extract or Inline

**Inline small steps. Extract concepts.**

Extract a function when deleting it would push complexity onto its callers:

- It protects an invariant every caller must respect.
- It names a domain concept that would appear in a glossary.
- It hides a decision likely to change (a format, a policy, an algorithm).
- It is a seam a test needs.
- The same logic with the same meaning appears in three or more places.

Do not extract:

- To make a function shorter.
- To give one step a name. A well-named variable usually does that.
- Single-use helpers, or helpers that exist only so a test can call them.
- Two blocks that look alike but change for different reasons.

A long function is fine when it reads top to bottom as one concern. It is not fine when it mixes concerns. The classic case is a big `switch` over message or event types, or an `if/else` chain that gains a branch per feature. Fix that with a different shape, not with a pile of helpers:

- A **lookup table**: a map from type or key to handler.
- A **state machine**: explicit states and transitions.
- A **typed model**: a type whose methods own the rules.

Signs you need one: every new feature adds a case to the same switch, or two booleans have to be kept in sync.

## Interface Types

Declare an interface type only at a real seam. "One adapter is a hypothetical seam, two is a real one." A test fake counts as the second adapter only when the real implementation can't run in tests, such as an external API client, another service, or out-of-process infrastructure. A fake for the repo's own code doesn't count; test against the real code instead.

Declare one for:

- Other services (gRPC and GraphQL clients).
- Vendor and third-party HTTP clients.
- Infrastructure outside the process: pubsub, clock, feature flags, object storage.

Do not declare one for:

- Your own packages calling your own packages.
- The database. Test against a real one.
- "We might need another implementation later."

When you do declare one, define it in the consuming package, keep it small, and have constructors accept interface types and return concrete structs.

Microservices with an RPC or GraphQL API already have their main interface at the network boundary, so they need very few interface types. Larger repos without that boundary rely on package APIs instead, which is the same rule.

## Errors

Wrap with `%w`. Messages are lower case, name the operation, and skip "failed to" (`open session: %w`, not `failed to open session: %w`).

Where the details go depends on whether the repo has telemetry. Check:

```bash
rg -l 'eucalyptusvc/sprig|dd-trace-go|go.opentelemetry.io' go.mod
```

- **Telemetry present** (Sprig, Datadog, OpenTelemetry, or similar): keep error messages constant so they group and filter cleanly. Put IDs, enums, and reasons on the span as tags.
- **No telemetry** (CLIs, local tools, libraries): the error text is often all you get, so include the identifiers that make it debuggable: `fmt.Errorf("load session %s: %w", id, err)`.

Either way, never put patient data, PII, or secrets in errors or span tags.

## Tests

- **Use external test packages** (`package foo_test`). Test unexported behavior through the exported API. If you need to call an unexported function directly, it is usually a deep module hiding inside the package. Consider moving it into its own package. Internal tests are a rare, justified exception, such as state with no exported way to observe it.
- **Use map tables** keyed by case name:

  ```go
  tests := map[string]struct {
      input string
      want  string
  }{
      "valid http": {input: "http://example.com", want: "example.com"},
  }
  for name, tc := range tests {
      t.Run(name, func(t *testing.T) { ... })
  }
  ```

  Random iteration order exposes tests that depend on each other, and duplicate names fail to compile.
- **Mock other services, vendor clients, and infrastructure** (pubsub, clock, flags). Use a real database. Never mock the repo's own packages.
- Follow the repo's assertion library. Most use testify `require`.
- Don't copy loop variables (`tc := tc`). Go 1.22 made it unnecessary.

## Making Rules Stick

Agents copy the nearest code. When a rule here keeps being broken in a repo, propose a check (a `golangci-lint` rule such as `depguard` for import direction, or a test) instead of restating the rule in prose.
