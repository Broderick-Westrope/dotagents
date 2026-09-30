# PGVector Architecture

Index types, configuration, and maintenance for PostgreSQL vector similarity search.

## Contents

- Index type comparison (HNSW vs IVFFlat)
- HNSW configuration
- IVFFlat configuration
- Storage and memory
- Build optimization
- Maintenance and vacuuming

## Index type comparison

### Quick decision table

| Factor | HNSW | IVFFlat |
|--------|------|---------|
| Query speed | Faster (15x in benchmarks) | Slower |
| Recall at same speed | Higher | Lower |
| Build time | Slower | Faster |
| Memory usage | Higher | Lower |
| Index updates | Resilient | Degrades recall |
| Build without data | Yes | No (needs training data) |
| Best for | Low-latency, high-recall | Batch updates, memory constrained |

### When to choose HNSW

- Production applications with latency requirements
- Frequent updates/inserts (maintains recall)
- Can afford memory and build time
- Need high recall (>0.99)

### When to choose IVFFlat

- Memory-constrained environments
- Batch-updated data (rebuild periodically)
- Faster initial index builds needed
- Acceptable recall at 0.95-0.98

## HNSW configuration

### Index creation

```sql
-- Basic HNSW index
CREATE INDEX ON documents USING hnsw (embedding vector_l2_ops);

-- With custom parameters
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

### Parameters

| Parameter | Default | Effect |
|-----------|---------|--------|
| `m` | 16 | Connections per node. Higher = better recall, more memory |
| `ef_construction` | 64 | Build-time search depth. Higher = better recall, slower build |

**Tuning guidance:**
- Start with defaults
- Increase `m` to 24-32 for high-recall requirements
- Increase `ef_construction` to 100-200 for better recall if build time is acceptable

### Query-time parameters

```sql
-- Increase search depth for better recall
-- Default: 100 (as of pgvector 0.7.0; was 40 in earlier versions)
SET hnsw.ef_search = 200;

-- For single query
BEGIN;
SET LOCAL hnsw.ef_search = 200;
SELECT * FROM documents ORDER BY embedding <-> query_vec LIMIT 10;
COMMIT;
```

### Iterative scan for filtered queries

Prevents underfiltering when combining vector search with WHERE clauses:

```sql
-- Strict ordering (preserves exact distance order)
SET hnsw.iterative_scan = strict_order;

-- Relaxed ordering (better recall, slight ordering variation)
SET hnsw.iterative_scan = relaxed_order;
SET hnsw.max_scan_tuples = 50000;

SELECT * FROM documents
WHERE category = 'tutorial'
ORDER BY embedding <-> query_vec
LIMIT 10;
```

## IVFFlat configuration

### Index creation

```sql
-- Basic IVFFlat index (must have data first!)
CREATE INDEX ON documents USING ivfflat (embedding vector_l2_ops)
WITH (lists = 100);
```

### Choosing list count

| Row count | Recommended lists |
|-----------|-------------------|
| < 1M rows | rows / 1000 |
| > 1M rows | sqrt(rows) |

**Minimum data requirement:** Need at least 10x more rows than lists for good centroid quality. Creating `lists=1000` with only 500 rows produces garbage.

```sql
-- For 500K rows: 500 lists
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 500);

-- For 10M rows: ~3162 lists
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 3162);
```

### Query-time parameters

```sql
-- Increase probes for better recall (default 1)
-- Rule of thumb: sqrt(lists)
SET ivfflat.probes = 22;  -- For 500 lists

-- For single query
BEGIN;
SET LOCAL ivfflat.probes = 50;
SELECT * FROM documents ORDER BY embedding <-> query_vec LIMIT 10;
COMMIT;
```

### Iterative scan for filtered queries

```sql
SET ivfflat.iterative_scan = relaxed_order;
SET ivfflat.max_probes = 100;

SELECT * FROM documents
WHERE created_at > '2024-01-01'
ORDER BY embedding <-> query_vec
LIMIT 10;
```

## Storage and memory

### Inline storage

Avoid TOAST overhead for frequently accessed vectors:

```sql
ALTER TABLE documents ALTER COLUMN embedding SET STORAGE PLAIN;
```

### Memory requirements

**HNSW:**
- Larger than IVFFlat
- Grows with `m` parameter
- Keep index in memory for best performance

**IVFFlat:**
- Smaller footprint
- Stores centroids + vector IDs
- More memory-efficient for large datasets

### Checking sizes

```sql
SELECT
    indexrelname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE indexrelname LIKE '%embedding%';
```

## Build optimization

### Memory for index builds

```sql
-- Increase for faster HNSW builds
SET maintenance_work_mem = '8GB';

-- Watch for this warning:
-- "hnsw graph no longer fits into maintenance_work_mem"
-- If seen, increase maintenance_work_mem
```

### Parallel builds

```sql
-- Use multiple workers
SET max_parallel_maintenance_workers = 7;

-- Build concurrently (doesn't block reads)
CREATE INDEX CONCURRENTLY ON documents
USING hnsw (embedding vector_l2_ops);
```

### Build after loading data

Always create indexes after initial data load:

```sql
-- 1. Load data
COPY documents FROM 'data.csv';

-- 2. Then create index
CREATE INDEX ON documents USING hnsw (embedding vector_l2_ops);
```

## Maintenance and vacuuming

### HNSW vacuuming is slow

Speed up with reindex first:

```sql
-- Reindex first, then vacuum
REINDEX INDEX CONCURRENTLY documents_embedding_idx;
VACUUM documents;
```

### IVFFlat recall degradation

IVFFlat centroids don't update with new data. For heavily updated tables:

```sql
-- Periodic rebuild to maintain recall
REINDEX INDEX documents_embedding_idx;

-- Or drop and recreate
DROP INDEX documents_embedding_idx;
CREATE INDEX documents_embedding_idx ON documents
USING ivfflat (embedding vector_l2_ops) WITH (lists = 500);
```

### Monitoring index usage

```sql
SELECT
    indexrelname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE indexrelname LIKE '%embedding%';
```

## Distance operators

Match index operator to query operator:

| Distance | Index Operator | Query Operator |
|----------|---------------|----------------|
| L2 (Euclidean) | `vector_l2_ops` | `<->` |
| Cosine | `vector_cosine_ops` | `<=>` |
| Inner product | `vector_ip_ops` | `<#>` |
| L1 (Manhattan) | `vector_l1_ops` | `<+>` |

**Common bug:** Creating an index with `vector_cosine_ops` but querying with `<->` (L2). PostgreSQL silently does a sequential scan instead of using the index. No error, just slow queries.

```sql
-- Cosine similarity (most common for embeddings)
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);
SELECT * FROM documents ORDER BY embedding <=> query_vec LIMIT 10;  -- Correct

-- WRONG: index is cosine, query is L2
SELECT * FROM documents ORDER BY embedding <-> query_vec LIMIT 10;  -- Seq scan!

-- L2 distance
CREATE INDEX ON documents USING hnsw (embedding vector_l2_ops);
SELECT * FROM documents ORDER BY embedding <-> query_vec LIMIT 10;
```
