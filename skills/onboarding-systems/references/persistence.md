# Persistence Exploration

Use this lens when the user wants to understand database patterns, query strategies, transaction boundaries, or how data is stored and retrieved.

## Approach

### 1. Identify the Data Access Pattern

| Language | Pattern | Where to look |
|----------|---------|---------------|
| **TypeScript** | Static DAO class, Slonik `sql` template tags, typegen-generated query types | `dao.ts`, `queries.*.generated.ts` |
| **Go** | Repository struct with methods, sqlx named queries, squirrel query builder | `dao/`, `repository.go`, `queries.go` |

Explain how queries are structured in this specific service. For TypeScript services using slonik-typegen, note that query type names (like `ConventionalHermit`) are auto-generated and not meaningful — the actual query is what matters.

### 2. Map the Transaction Boundaries

Find where the service uses database transactions and explain why:

```typescript
// TypeScript (Slonik)
await db.transaction(async (tx) => {
  // Everything in here is atomic
  await Dao.insertX(tx, ...);
  await Dao.insertY(tx, ...);
});
```

```go
// Go (sqlx)
tx, err := db.BeginTxx(ctx, nil)
// ... operations ...
tx.Commit()
```

For each transaction boundary, explain:
- **What must be atomic** — which operations would leave corrupt state if partially applied
- **What's excluded** — side effects like pub/sub publishing that happen outside the transaction (and why)
- **Error handling** — how constraint violations (unique, foreign key) are caught and translated to user-facing errors

### 3. Explain the Migration Strategy

- Where are migrations stored? (in the service, or in a shared repo like `db-postgres`)
- How is the schema versioned?
- Are there any migration-related gotchas? (e.g., running typegen after migrations, backward-compatible migrations only)

### 4. Highlight Query Patterns

Common patterns to explain when found:

| Pattern | Example | Why it matters |
|---------|---------|---------------|
| **Read replica routing** | `dbRead` vs `db` | Load distribution, eventual consistency implications |
| **Batch queries** | `WHERE id = ANY($1)` | N+1 prevention, how the service handles bulk operations |
| **Cursor pagination** | `WHERE created_at > $cursor` | How large result sets are handled |
| **Upserts** | `ON CONFLICT DO UPDATE` | Idempotent writes, handling retries |
| **JSON columns** | `jsonb` fields for flexible data | Semi-structured data that doesn't fit relational model |
| **Array columns** | `text[]`, `uuid[]` | Denormalized relationships for query performance |

### 5. Connect Persistence to Domain

Don't just explain the queries — connect them back to the domain model:
- Which queries support which business operations?
- Where does the service join across tables vs make multiple queries?
- Are there any computed values (aggregations, derived state) and where do they live?

## Exploration Questions Template

After explaining persistence patterns, suggest questions like:
- "What happens under concurrent writes to [this entity]?"
- "How does the service handle [this table] growing to millions of rows?"
- "Why is [this data] stored as [this type] instead of [alternative]?"
