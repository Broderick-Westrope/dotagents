---
name: onboarding-systems
description: Teaches users how Go and TypeScript microservices work through guided, interactive explanations. Applies only when the user requests an explanation, walkthrough, or onboarding to build their own understanding, such as "explain how this service works", "walk me through the purchase flow", or "help me understand these entity relationships". Covers architecture, domain logic, state machines, persistence, and integrations within that teaching context. Does not apply to an agent's own questions, codebase exploration, or context gathering for planning, implementation, debugging, refactoring, or review. The agent needing to understand a system is not a teaching request from the user.
---

# Onboarding Systems

**Core principle:** Understanding a production system means understanding *why* code exists, not just *what* it does. The goal is to build a mental model that lets you predict how the system behaves in situations you haven't seen yet.

## How This Skill Works

This skill runs as an interactive exploration session. Rather than dumping a wall of information, it follows a progressive pattern:

1. **Orient** — establish what the service does, its boundaries, and where it fits
2. **Map** — show entity relationships, state machines, and data flows for a chosen subsystem
3. **Trace** — follow a real request or event end-to-end through actual code
4. **Surface** — highlight non-obvious design decisions, gotchas, and tribal knowledge

Each response ends with 1-3 follow-up questions — not quizzes, but genuinely interesting directions for deeper exploration. The user drives what to explore next.

## Starting an Onboarding Session

When the user asks to understand a service or subsystem, follow this sequence.

### Step 1: Quick Reconnaissance

Before explaining anything, silently gather context:

```
1. Read the service's CLAUDE.md, README, and package.json / go.mod
2. Scan the top-level directory structure
3. Identify the entry point (index.ts / main.go / service.go)
4. Check for architecture docs (.claude/docs/, docs/, ARCHITECTURE.md)
5. Look at the proto definitions or API surface (rpcs/, handlers/, routes/)
```

Don't narrate this step. The user doesn't need to watch you read files — they need the insights.

### Step 2: Service Overview

Present a compact orientation. Keep this under 200 words. Cover:

| Element | What to include |
|---------|----------------|
| **Purpose** | One sentence: what business problem this service solves |
| **Boundaries** | What this service owns vs. what it delegates to others |
| **Key entities** | The 3-5 most important domain objects and how they relate |
| **Tech stack** | Language, framework, database, messaging — just the facts |
| **Scale indicators** | Number of RPCs/endpoints, test files, LOC — gives a sense of complexity |

Then ask: *"What area would you like to explore first?"* and suggest 3-4 subsystems based on what you found. Group by user-facing behavior, not file structure. For example: "How purchases work", "The tick/scheduling system", "Event-driven side effects" — not "the rpcs/ directory."

### Step 3: Subsystem Deep Dive

When the user picks a subsystem (or asks "how does X work?"), use the appropriate exploration lens from the reference material below.

## Exploration Lenses

Load the relevant reference based on what the user wants to understand:

| Exploring... | Load | File |
|--------------|------|------|
| Entity relationships, state machines, domain modeling | **Domain Model** | `references/domain-model.md` |
| Request/event flows, pub/sub chains, RPC handling | **Data Flow** | `references/data-flow.md` |
| Database patterns, queries, transactions, migrations | **Persistence** | `references/persistence.md` |
| External service calls, integrations, feature flags | **Integrations** | `references/integrations.md` |

Load multiple references when subsystems span topics (e.g., a purchase flow touches domain model, data flow, and persistence).

## Principles for Effective Onboarding

### Anchor explanations in code

Every claim should be traceable to a specific file and line. Don't say "the service validates inputs" — say "validation happens in `validators.ts:45` where `validateNodes()` checks for cycles in the linked list." The user can then go read that code with context for what they're looking at.

### Explain the "why" behind non-obvious patterns

Production code is full of decisions that look arbitrary without context. When you spot these, explain them:

- **Immutable ledgers instead of mutable rows** — why append-only? (audit trail, temporal queries)
- **Hardcoded ID sets** — why are specific node IDs listed? (reconciliation with external systems)
- **Aesthetic query type names** — why `ConventionalHermit`? (slonik-typegen generates these from migrations)
- **Per-worker test databases** — why not a shared test DB? (parallel test isolation)

If you don't know why something exists, say so and suggest where the answer might live (git blame, PR history, team docs).

### Calibrate depth to the subsystem

Not every part of a service deserves equal attention. Spend more time on:

- **State machines** — these encode business rules that aren't documented anywhere else
- **Event handlers** — the pub/sub chain often hides the most complex orchestration
- **Validation logic** — reveals domain constraints that the schema alone doesn't capture
- **Test fixtures** — often the best documentation of how entities relate to each other

Spend less time on:
- Boilerplate (server setup, middleware registration, config loading)
- CRUD operations with no business logic
- Generated code (proto stubs, type definitions)

### Use diagrams for relationships

When explaining entity hierarchies or state machines, include a Mermaid diagram. A diagram of a 5-level entity hierarchy communicates in seconds what would take paragraphs of prose. Keep diagrams focused — show one relationship clearly rather than everything at once.

### Connect Go and TypeScript patterns

The user has deep Go expertise. When explaining TypeScript patterns, bridge the gap:

| TypeScript pattern | Go equivalent |
|-------------------|---------------|
| `nice-grpc` middleware chain | gRPC interceptors |
| Slonik `sql` template tags | `sqlx` named queries |
| `zod` schema validation | struct tags + custom validators |
| `jest.setup.js` per-worker DBs | `TestMain` + parallel subtests |
| Pub/Sub subscription handlers | Message consumer goroutines |
| DAO static class | Repository struct with methods |
| `async/await` chains | Goroutine coordination (channels/errgroup) |

This isn't about dumbing things down — it's about giving the user anchors to attach new concepts to.

### End with exploration questions

Every substantive response should close with 1-3 questions under a `**Next steps**` heading. These should be genuinely interesting directions, not busywork. Good questions:

- Follow a thread the current explanation opened ("How does the alignment node coordinate across sequences?")
- Connect to adjacent subsystems ("What happens when the payment for this order fails?")
- Surface design tensions ("Why are side effects immutable when CSC status can change?")

Bad questions:
- Stuff the user can grep for themselves ("What other RPCs exist?")
- Yes/no questions ("Did you understand the entity hierarchy?")
- Questions that require context the user doesn't have yet

## Go and TypeScript Microservice Patterns

These are the common structural patterns across Go (`svc.core.*`) and TypeScript (`svc-core-*`) microservices at Eucalyptus. Use these to quickly orient in any service.

### Go Service Structure

```
svc.core.<name>/
├── cmd/server/main.go     # Entry point, dependency wiring
├── service/               # gRPC handler implementations
│   ├── service.go         # Service struct, constructor, dependencies
│   └── <method>.go        # One file per RPC method
├── dao/                   # Database access (repository pattern)
├── domain/                # Business logic, pure functions
├── proto/                 # Generated proto stubs (or imported)
├── migrations/            # SQL migrations (or in db-postgres)
├── Makefile               # make test, make watch, make dbup/dbdown
└── go.mod
```

### TypeScript Service Structure

```
svc-core-<name>/
├── src/
│   ├── index.ts           # Entry point, server startup
│   ├── service.ts         # Service context, dependency injection
│   ├── dao.ts             # Database access (static class pattern)
│   ├── adapters.ts        # Proto-to-DB type mapping
│   ├── validators.ts      # Input validation (zod or manual)
│   ├── rpcs/              # One file per RPC method
│   ├── subscriptions/     # Pub/Sub event handlers
│   └── fixtures.ts        # Test helpers and factories
├── package.json
├── jest.config.js
├── tsconfig.json
└── Dockerfile
```

### Service Context Pattern (Both Languages)

Both Go and TS services inject dependencies through a context/service object rather than global state:

**Go:** A `Service` struct holds `db`, `logger`, `grpcClients`, `pubSubClient`, etc. Constructed in `main.go`, passed to handlers.

**TypeScript:** A `ServiceContext` type holds `db`, `dbRead`, `logger`, `grpcClients`, `pubSubClient`, `launchDarkly`, `environment`. Created in `index.ts`, threaded through RPCs.

This is the first thing to find in any new service — it tells you every external dependency at a glance.
