# Tactical Debugging Techniques

## Contents

- [Binary Search / Code Bisection](#binary-search--code-bisection)
- [Minimal Reproduction](#minimal-reproduction)
- [Strategic Logging](#strategic-logging)
- [Runtime Assertions](#runtime-assertions)
- [Differential Analysis](#differential-analysis)
- [Multi-Component Instrumentation](#multi-component-instrumentation)
- [Backward Tracing](#backward-tracing)

## Binary Search / Code Bisection

Systematically narrow down the problem:

1. Comment out or disable half the suspicious code
2. If bug persists, problem is in the active half
3. If bug disappears, problem is in the disabled half
4. Repeat until you isolate the exact line

**Git bisect for regression hunting:**

```bash
git bisect start
git bisect bad HEAD
git bisect good v2.1.0
# Run tests, mark good/bad, repeat until commit identified
```

## Minimal Reproduction

Strip away everything non-essential:

- Remove unrelated features, components, dependencies
- Use hardcoded data instead of complex data flows
- Simplify to the smallest code that reproduces the bug

Often reveals the bug during the simplification process.

## Strategic Logging

Add diagnostic output at key points:

```javascript
// Track values and types
console.log('Type:', typeof value, 'Value:', value)
console.log('Object keys:', Object.keys(object))

// Track timing
const start = performance.now()
await operation()
console.log(`Took ${performance.now() - start}ms`)
```

```python
# Trace execution
print(f"Input: {data}, Type: {type(data)}")
result = process(data)
print(f"Output: {result}")
```

```bash
set -x  # Print each command before executing
echo "DEBUG: $MY_VAR"
```

**Place logging:**
- Before/after critical operations
- At component boundaries
- Where data transforms
- In error handlers

## Runtime Assertions

Make assumptions explicit:

```javascript
if (!user) throw new Error('User should be authenticated here')
if (typeof id !== 'string') throw new TypeError(`Expected string, got ${typeof id}`)
```

```python
assert user is not None, "User should be authenticated"
assert isinstance(id, str), f"Expected str, got {type(id)}"
```

## Differential Analysis

Compare working vs broken states:

1. Identify working baseline
2. Identify broken case
3. List every difference
4. Test each difference in isolation

```bash
# Compare environments
diff <(env | sort) <(docker exec container env | sort)

# Compare configs
diff config/production.json config/staging.json
```

## Multi-Component Instrumentation

**For systems with multiple layers (CI -> build -> deploy, API -> service -> database):**

Add logging at EACH component boundary before proposing fixes:

```bash
# Layer 1: Entry point
echo "=== Input received: ==="
echo "PARAM: ${PARAM:+SET}${PARAM:-UNSET}"

# Layer 2: Processing
echo "=== After processing: ==="
env | grep PARAM

# Layer 3: Output
echo "=== Final state: ==="
cat output.json
```

Run once to see WHERE it breaks, THEN investigate that component.

## Backward Tracing

When error is deep in call stack, trace backward to find origin:

```
Symptom: git init creates .git in wrong directory
Why? → cwd parameter is empty string
Why? → projectDir passed empty
Why? → tempDir uninitialized when accessed
Why? → Variable accessed before beforeEach ran
Root Cause: Test setup timing issue
```

**Adding instrumentation:**

```javascript
async function problematicFunction(param) {
  console.error("DEBUG:", {
    param,
    stack: new Error().stack
  });
  // ... rest of function
}
```

Fix at the source, not at the symptom.
