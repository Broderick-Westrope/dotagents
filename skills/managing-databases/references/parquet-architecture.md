# Parquet File Architecture

Design guidelines for Parquet files optimized for analytical queries.

## Contents

- File sizing
- Row group sizing
- Partitioning strategy
- Compression selection
- Dictionary encoding
- Schema evolution
- Small file compaction

## File sizing

### Target sizes

| Environment | Target file size |
|-------------|------------------|
| HDFS/cloud storage | 128MB - 1GB |
| Local disk | 64MB - 512MB |
| Streaming ingestion | 64MB - 256MB |

### Why sizing matters

- **Too small (<64MB):** Metadata overhead, too many files to list, poor parallelism scheduling
- **Too large (>1GB):** Limited parallelism, memory pressure, slow failure recovery
- **Sweet spot:** Large enough for efficient I/O, small enough for parallelism

### Estimating file size

```python
# Rough calculation
rows_per_file = target_bytes / avg_compressed_row_size

# For 128MB target with 200 byte avg compressed rows:
# 128MB / 200B = ~640,000 rows per file
```

## Row group sizing

Row groups are the unit of parallelism within a file.

### Target sizes

| Scenario | Row group size |
|----------|---------------|
| General purpose | 128MB |
| Memory constrained | 64MB |
| Highly selective queries | 64MB (more granular pruning) |
| Full scans | 256MB (less overhead) |

### Configuration

```python
# PyArrow
import pyarrow.parquet as pq

pq.write_table(
    table,
    'output.parquet',
    row_group_size=1_000_000  # Rows, not bytes
)
```

```python
# Approximate row count for target size
target_row_group_bytes = 128 * 1024 * 1024  # 128MB
avg_row_bytes = table.nbytes / table.num_rows
row_group_size = int(target_row_group_bytes / avg_row_bytes)
```

## Partitioning strategy

### Choosing partition keys

| Good partition key | Bad partition key |
|-------------------|-------------------|
| Date (year/month/day) | High cardinality ID |
| Region (10-50 values) | Timestamp (unique per row) |
| Category (5-20 values) | Free-text field |
| Status (2-10 values) | UUID |

### Partition cardinality guidelines

- **Too few partitions (<10):** Limited pruning benefit
- **Good range (10-1000):** Effective pruning, manageable file counts
- **Too many (>10,000):** Small files, listing overhead, metadata bloat

### Hive-style partitioning

```
data/
  year=2024/
    month=01/
      part-0001.parquet
      part-0002.parquet
    month=02/
      part-0001.parquet
```

### Reading partitioned data

```sql
-- DuckDB automatically discovers partitions
SELECT * FROM read_parquet('data/**/*.parquet', hive_partitioning=true)
WHERE year = 2024 AND month = 1;
-- Only reads files in year=2024/month=01/
```

## Compression selection

### Compression comparison

| Codec | Compression ratio | Write speed | Read speed | Use when |
|-------|------------------|-------------|------------|----------|
| Snappy | Medium | Fast | Fast | Default, real-time ingestion |
| Zstd | High | Medium | Fast | Storage cost matters |
| Gzip | High | Slow | Medium | Compatibility required |
| LZ4 | Low | Very fast | Very fast | Maximum read speed |
| None | 1x | Fastest | Fastest | Already compressed data |

### Recommended defaults

- **Analytics workloads:** Zstd level 3
- **Real-time/streaming:** Snappy or LZ4
- **Archive/cold storage:** Zstd level 9 or Gzip

### Configuration

```python
# PyArrow
pq.write_table(
    table,
    'output.parquet',
    compression='zstd',
    compression_level=3
)
```

## Dictionary encoding

### When dictionary encoding helps

| Column type | Dictionary benefit |
|-------------|-------------------|
| Low cardinality strings (status, category) | High |
| Repeated strings (country names) | High |
| High cardinality strings (UUIDs, emails) | None/negative |
| Numeric columns | Usually none |

### How it works

- Unique values stored in dictionary
- Column stores integer indices
- Decompression is very fast

### Controlling dictionary encoding

```python
# PyArrow - disable for specific columns
pq.write_table(
    table,
    'output.parquet',
    use_dictionary=['status', 'category'],  # Enable only for these
    # Or: use_dictionary=False  # Disable entirely
)
```

### Dictionary size limits

Default dictionary page size is 1MB. Columns with >1MB of unique values fall back to plain encoding. For very high cardinality columns, explicitly disable dictionary to avoid the failed dictionary overhead.

## Schema evolution

### Safe schema changes

| Change type | Safe? | Notes |
|-------------|-------|-------|
| Add nullable column | Yes | Old files return NULL |
| Add column with default | Yes | Old files return default |
| Remove column | Yes | Old files still have it, ignored |
| Rename column | No | Breaks old files |
| Change type | No | Usually breaks |
| Reorder columns | Yes | Parquet uses names, not positions |

### Reading mixed schemas

```sql
-- DuckDB handles schema evolution
SELECT * FROM read_parquet('data/*.parquet', union_by_name=true);
-- Missing columns become NULL
```

### Best practices

- Add columns, don't rename
- Use nullable columns for new fields
- Version your schema in metadata
- Test reads with old and new files together

## Small file compaction

### When to compact

- Many files <64MB
- >10,000 files in a partition
- Query planning time is high

### Compaction strategies

**Manual compaction:**

```sql
-- DuckDB: Read and rewrite
COPY (SELECT * FROM read_parquet('data/small_files/*.parquet'))
TO 'data/compacted.parquet' (FORMAT PARQUET, ROW_GROUP_SIZE 1000000);
```

**Streaming compaction:**

```python
# Accumulate small files, write when buffer is large enough
buffer = []
buffer_bytes = 0
target_size = 128 * 1024 * 1024

for file in small_files:
    table = pq.read_table(file)
    buffer.append(table)
    buffer_bytes += table.nbytes

    if buffer_bytes >= target_size:
        combined = pa.concat_tables(buffer)
        pq.write_table(combined, f'compacted_{uuid4()}.parquet')
        buffer = []
        buffer_bytes = 0
```

### Table formats for automatic compaction

Consider Delta Lake, Iceberg, or Hudi if compaction is a recurring need. They handle:
- Automatic compaction
- ACID transactions
- Time travel
- Schema evolution
