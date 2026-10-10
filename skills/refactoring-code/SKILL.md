---
name: refactoring-code
description: Improves code structure while preserving behavior through test verification. Use when cleaning up code, reducing duplication, simplifying complexity, or reorganizing modules.
argument-hint: "<file-path-or-pattern>"
---

# Refactoring Code

**Core principle:** Refactoring changes structure, not functionality. If behavior changes, you're rewriting.

**Target:** If `$ARGUMENTS` is provided, use it as the refactoring target. Otherwise, check for unstaged changes. If none, diff against main: `git diff --name-only $([ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] && echo "HEAD^" || echo "main...HEAD")`

## The Five Phases

```
Refactoring Progress:
- [ ] Phase 1: Understand current behavior
- [ ] Phase 2: Verify behavior-driven tests exist
- [ ] Phase 3: Identify issues
- [ ] Phase 4: Plan incremental steps
- [ ] Phase 5: Execute with continuous verification
```

### Phase 1: Understand Current Behavior

- Read code to understand purpose, not just implementation
- Use Grep to find all call sites and consumers
- Document inputs, outputs, side effects, edge cases

### Phase 2: Verify Test Coverage (CRITICAL)

**Tests must verify BEHAVIOR, not implementation:**

```typescript
// ✅ Behavior-driven - survives refactoring
test('displays error when API returns 404', async () => {
  server.use(http.get('/api/users', () => new HttpResponse(null, { status: 404 })));
  render(<UserList />);
  expect(await screen.findByText(/not found/i)).toBeInTheDocument();
});

// ❌ Implementation-detail - breaks during refactoring
test('sets error state', () => {
  wrapper.instance().handleError(new Error('404'));
  expect(wrapper.state('error')).toBe('404');
});
```

**If tests are missing:** Pin the current behavior first using the **writing-tests** skill. For untested legacy code, write characterization tests that record what the code does today (even if it looks wrong), through the public surface. Type checks and lint are not a pin.

### Phase 3: Identify Issues

Load the **codebase-design** skill and check the target against its red flags (pass-throughs, shallow modules, growing switches, duplicated concepts, information leakage and the rest). Name each issue by flag, with `file:line`. Beyond structure, also look for names that don't say what a thing is (`x`, `data`, `temp`) and type gaps (`any`, unchecked assertions).

Length alone is not an issue. A long function that reads top to bottom as one concern stays inline. **Inline small steps, extract concepts.** For language-specific rules, load the matching style skill (e.g. **go-style**).

### Phase 4: Plan Refactoring

- **Subtract first.** Delete dead code, pass-throughs, and duplicate paths before building anything new.
- Break into small, independently testable steps
- High impact + low risk first (e.g., renames)
- When replacing an API, migrate every caller and delete the old one in the same change. Don't leave two ways to do one thing.
- Defer high-risk changes (algorithm rewrites)

### Phase 5: Execute & Verify

1. Make one change at a time
2. Run tests after each change
3. Run the type checker and linter
4. Verify behavior unchanged
5. Keep the change only if the code got easier to read: fewer layers to trace, less state to hold. If it didn't, revert it.

**If something breaks:** STOP. Use the **systematic-debugging** skill. Don't proceed until understood.

## Red Flags - STOP and Reassess

- Changing behavior while refactoring (separate concerns)
- Skipping tests ("just this once")
- Adding complexity to remove complexity
- "This is clever!" (clarity > cleverness)
- Abstracting before seeing pattern 3 times

## Quick Reference

Structural smells and their fixes live in **codebase-design**. Local ones:

| Smell | Refactoring |
|-------|-------------|
| Deep nesting | Early returns, guard clauses |
| Magic numbers | Named constants, declared in the function unless more than one function uses them |
| Long parameter list | Parameter object |

## When to Stop

Stop when code is clear, duplication eliminated, types explicit, tests pass.

**Don't continue if:**
- Making code "elegant" but harder to understand
- Abstracting before 3 occurrences
- Optimizing without measuring

For React/TypeScript patterns, see [references/react-typescript.md](references/react-typescript.md).
