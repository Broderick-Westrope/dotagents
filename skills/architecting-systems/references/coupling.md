# Loose Coupling and Dependency Management

Coupling is the #1 cause of systems becoming painful at scale. Every unnecessary dependency between modules is a future coordination problem.

## Deep Modules, Small Interfaces

A module's *interface* is everything a caller must know to use it: its public names plus their behavior, error modes, ordering rules, and invariants. That is not the same as a language-level `interface` declaration. In Go, the module is the package and its interface is the exported API.

The best modules are **deep**: a lot of behavior behind a small interface. A **shallow** module's interface is about as complex as what it hides, so it adds a layer without removing any work.

- **The deletion test:** imagine deleting the module. If the complexity vanishes, it was a pass-through. If it reappears across several callers, it earns its place.
- **The interface is the test surface.** If behavior can't be tested through it, there is probably a second module hiding inside.

## When to Declare an Abstraction

Declare an interface type (or protocol, or abstract class) only at a real **seam**: a place where behavior genuinely varies. "One adapter is a hypothetical seam, two is a real one." A test fake counts as the second adapter.

| Dependency | Abstraction? |
|---|---|
| Your own modules calling each other | No. Call them directly. |
| The database | No. Test against a real one. |
| Other services, vendor APIs | Yes. A small client interface you can fake. |
| Infrastructure outside the process (pubsub, clock, flags) | Yes. |
| "We might swap it later" | No. Add it when the second implementation arrives. |

```ts
// Vendor API: a real seam, faked in tests
class OrderService {
  constructor(private payments: PaymentsClient) {}
}

// Own storage: no repository interface just for mocking
class OrderService {
  constructor(private db: Database) {} // real test DB in tests
}
```

## Boundaries Through Contracts

Modules communicate through explicit, stable interfaces. Internal implementation details stay internal.

- **Public API per module:** Each module exports a clear interface. No deep imports into another module's internals.
- **Enforce boundary direction:** Shared packages never import from app code. Feature modules don't import from each other directly.
- **Anti-corruption layers:** When integrating with external systems or messy legacy code, translate at the boundary. Don't let external data shapes infect your domain.

## Communication Patterns

| Pattern | When | Coupling Level |
|---------|------|----------------|
| Direct function calls | Same module, synchronous | Tightest |
| Module's public API | Cross-module within a service | Moderate |
| Events/messages | Cross-service, async workflows | Loosest |
| API contracts | Service-to-service | Loose (if versioned) |

Choose the loosest coupling level that still makes the code readable and debuggable. Don't use event-driven architecture for something that's just a function call.

## The Dependency Rule

Dependencies point inward. Business logic never imports infrastructure details like HTTP handlers or UI. Where business logic needs an external system (a vendor API, another service), it defines the small interface it needs and infrastructure provides it.

```ts
// Domain defines what it needs from the vendor
interface PaymentsClient {
  charge(orderId: string, cents: number): Promise<void>;
}

// Infrastructure provides it
class StripePaymentsClient implements PaymentsClient {
  async charge(orderId: string, cents: number): Promise<void> {
    // actual vendor call here
  }
}
```

## Minimize External Dependencies

Every dependency is a liability: security surface, upgrade burden, potential abandonment. Before adding a library:

- Can the standard library do this?
- Is this solving a problem we actually have?
- What's the maintenance health of this project?
- Would 20 lines of code eliminate the need?

## Manage What You Can't Avoid

For dependencies you do take on:

- **Pin versions** and update deliberately, not reactively
- **Wrap libraries you might realistically replace** (unstable deps, vendor SDKs, libraries you're evaluating). Don't wrap stable utilities you'll use forever.
- **Isolate vendor-specific code** in infrastructure layers
