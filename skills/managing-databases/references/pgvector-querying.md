# PGVector Advanced Querying

Non-obvious techniques for vector similarity search in PostgreSQL.

## Contents

- Hybrid search (vector + keyword)
- Filtered vector search
- Sparse vectors
- Score fusion (RRF)
- Two-stage retrieval with reranking
- Practical patterns

## Hybrid search

Combine semantic (vector) search with lexical (keyword) search for better results. Hybrid search typically improves accuracy 8-15% over pure vector or pure keyword search.

### When to use hybrid

| Query type | Pure vector | Hybrid |
|------------|-------------|--------|
| Conceptual questions | Good | Better |
| Exact term matches | Poor | Better |
| Named entities | Poor | Better |
| Mixed intent | Poor | Better |

### Basic hybrid pattern

```sql
-- Combine BM25 (keyword) with vector similarity
WITH keyword_results AS (
    SELECT id, ts_rank(to_tsvector(content), plainto_tsquery('machine learning')) as keyword_score
    FROM documents
    WHERE to_tsvector(content) @@ plainto_tsquery('machine learning')
),
vector_results AS (
    SELECT id, 1 - (embedding <=> query_embedding) as vector_score
    FROM documents
    ORDER BY embedding <=> query_embedding
    LIMIT 100
)
SELECT
    COALESCE(k.id, v.id) as id,
    COALESCE(k.keyword_score, 0) * 0.3 + COALESCE(v.vector_score, 0) * 0.7 as combined_score
FROM keyword_results k
FULL OUTER JOIN vector_results v ON k.id = v.id
ORDER BY combined_score DESC
LIMIT 10;
```

### With pg_search extension (ParadeDB)

```sql
-- Cleaner hybrid search with pg_search
SELECT *
FROM documents
WHERE content @@@ 'machine learning'  -- BM25
ORDER BY paradedb.score(id) * 0.3 + (1 - (embedding <=> query_vec)) * 0.7 DESC
LIMIT 10;
```

## Filtered vector search

Combine vector similarity with traditional WHERE clauses.

### The overfiltering problem

Without iterative scan, filtered queries may return fewer results than requested:

```sql
-- May return < 10 results if filter is selective
SELECT * FROM documents
WHERE category = 'rare_category'
ORDER BY embedding <-> query_vec
LIMIT 10;
```

### Solution: iterative scan

```sql
-- Enable iterative scanning
SET hnsw.iterative_scan = relaxed_order;

-- Now returns 10 results (scans more if needed)
SELECT * FROM documents
WHERE category = 'rare_category'
ORDER BY embedding <-> query_vec
LIMIT 10;
```

### Pre-filtering vs post-filtering

| Strategy | When to use |
|----------|-------------|
| Pre-filter (WHERE) | High selectivity, large dataset |
| Post-filter | Low selectivity, need exact top-K |

```sql
-- Pre-filter: efficient for selective filters
SELECT * FROM documents
WHERE tenant_id = 123  -- Indexed, reduces scan set
ORDER BY embedding <-> query_vec
LIMIT 10;

-- Post-filter: scan vectors first, filter after
SELECT * FROM (
    SELECT * FROM documents
    ORDER BY embedding <-> query_vec
    LIMIT 100  -- Get more candidates
) sub
WHERE status = 'active'
LIMIT 10;
```

### Partial indexes for common filters

```sql
-- Index only active documents
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
WHERE status = 'active';

-- Queries on active docs use smaller index
SELECT * FROM documents
WHERE status = 'active'
ORDER BY embedding <=> query_vec
LIMIT 10;
```

## Sparse vectors

For hybrid search with SPLADE or similar sparse embedding models.

### Storage

```sql
-- Sparse vectors use sparsevec type
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    content TEXT,
    dense_embedding vector(384),      -- Dense for semantic
    sparse_embedding sparsevec(30000) -- Sparse for lexical
);
```

### Space efficiency

- 8 bytes per non-zero element + 16 bytes overhead
- Up to 16,000 non-zero elements
- Much smaller than dense vectors for sparse data

### Querying sparse vectors

```sql
-- Sparse inner product
SELECT * FROM documents
ORDER BY sparse_embedding <#> sparse_query_vec
LIMIT 10;
```

### Combining sparse and dense

```sql
-- Hybrid with both vector types
SELECT
    id,
    (1 - (dense_embedding <=> dense_query)) * 0.7 +
    (sparse_embedding <#> sparse_query) * 0.3 as score
FROM documents
ORDER BY score DESC
LIMIT 10;
```

## Score fusion (RRF)

Reciprocal Rank Fusion combines rankings from multiple retrieval methods.

### RRF formula

```
RRF(d) = Σ 1 / (k + rank_i(d))
```

Where `k` is typically 60.

### Implementation

```sql
-- Basic RRF (equal weights)
WITH vector_ranked AS (
    SELECT id, row_number() OVER (ORDER BY embedding <=> query_vec) as rank
    FROM documents
    ORDER BY embedding <=> query_vec
    LIMIT 100
),
keyword_ranked AS (
    SELECT id, row_number() OVER (ORDER BY ts_rank(to_tsvector(content), query) DESC) as rank
    FROM documents
    WHERE to_tsvector(content) @@ query
    LIMIT 100
)
SELECT
    COALESCE(v.id, k.id) as id,
    COALESCE(1.0 / (60 + v.rank), 0) + COALESCE(1.0 / (60 + k.rank), 0) as rrf_score
FROM vector_ranked v
FULL OUTER JOIN keyword_ranked k ON v.id = k.id
ORDER BY rrf_score DESC
LIMIT 10;
```

### Weighted RRF (production pattern)

In practice, you usually want tunable weights:

```sql
-- Weighted RRF: semantic_weight=0.7, keyword_weight=0.3
SELECT
    COALESCE(v.id, k.id) as id,
    COALESCE(0.3 / (60 + k.rank), 0) + COALESCE(0.7 / (60 + v.rank), 0) as rrf_score
FROM vector_ranked v
FULL OUTER JOIN keyword_ranked k ON v.id = k.id
ORDER BY rrf_score DESC;
```

Weights depend on query type: conceptual queries favor semantic, exact-term queries favor keyword.

### Why RRF works

- Normalizes scores across different retrieval methods
- Robust to score distribution differences
- Simple, tunable weights for different query types
- Production-proven technique

## Two-stage retrieval

Retrieve candidates with fast ANN, then rerank with expensive model.

### Pattern

```sql
-- Stage 1: Fast approximate retrieval
WITH candidates AS (
    SELECT id, content, embedding
    FROM documents
    ORDER BY embedding <=> query_vec
    LIMIT 100  -- Get more than final K
)
-- Stage 2: Exact distance on candidates
SELECT id, content
FROM candidates
ORDER BY embedding <=> query_vec  -- Or use external reranker
LIMIT 10;
```

### With external reranking

```python
# Python pseudocode
candidates = db.query("""
    SELECT id, content FROM documents
    ORDER BY embedding <=> %s
    LIMIT 100
""", [query_vec])

# Rerank with cross-encoder
reranked = cohere.rerank(
    query=query_text,
    documents=[c.content for c in candidates],
    top_n=10
)

return [candidates[r.index] for r in reranked]
```

### When to rerank

| Scenario | Rerank? |
|----------|---------|
| High precision needed | Yes |
| Latency critical (< 50ms) | No |
| Complex relevance criteria | Yes |
| Simple similarity | No |

## Practical patterns

### Multi-tenant search

```sql
-- Partition by tenant for isolation
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
WHERE tenant_id = 1;

CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
WHERE tenant_id = 2;

-- Query uses appropriate partial index
SELECT * FROM documents
WHERE tenant_id = 1
ORDER BY embedding <=> query_vec
LIMIT 10;
```

### Batch similarity search

```sql
-- Find similar items for multiple queries
SELECT DISTINCT ON (q.id)
    q.id as query_id,
    d.id as match_id,
    d.embedding <=> q.embedding as distance
FROM query_items q
CROSS JOIN LATERAL (
    SELECT id, embedding
    FROM documents
    ORDER BY embedding <=> q.embedding
    LIMIT 5
) d;
```

### Deduplication by similarity

```sql
-- Find near-duplicates
SELECT a.id, b.id, a.embedding <=> b.embedding as distance
FROM documents a
JOIN documents b ON a.id < b.id
WHERE a.embedding <=> b.embedding < 0.1  -- Threshold
ORDER BY distance;
```

### Clustering similar items

```sql
-- Use with pgvector_kmeans extension or external clustering
SELECT
    id,
    content,
    embedding <=> cluster_centroid as distance_to_centroid
FROM documents d
CROSS JOIN (
    SELECT avg(embedding) as cluster_centroid
    FROM documents
    WHERE category = 'target_cluster'
) c
ORDER BY distance_to_centroid
LIMIT 100;
```
