#!/usr/bin/env bash
# Aggregate and rank error patterns by frequency
# Usage: aggregate-errors.sh <log-file> [severity-pattern] [limit]
# Examples:
#   aggregate-errors.sh app.log                    # Default: ERROR|WARN, top 10
#   aggregate-errors.sh app.log "ERROR" 20         # Only ERROR, top 20
#   aggregate-errors.sh app.log "FATAL|CRITICAL"   # Custom severity

set -euo pipefail

log_file="${1:-}"
severity="${2:-ERROR|WARN|FATAL|CRITICAL}"
limit="${3:-10}"

if [[ -z "$log_file" ]]; then
    echo "Usage: aggregate-errors.sh <log-file> [severity-pattern] [limit]" >&2
    echo "Examples:" >&2
    echo "  aggregate-errors.sh app.log" >&2
    echo "  aggregate-errors.sh app.log \"ERROR\" 20" >&2
    exit 1
fi

if [[ ! -f "$log_file" ]]; then
    echo "Error: File not found: $log_file" >&2
    exit 1
fi

echo "=== Error Aggregation Report ==="
echo "File: $log_file"
echo "Severity: $severity"
echo "Top $limit patterns"
echo ""

# Total count
total=$(grep -Eic "$severity" "$log_file" 2>/dev/null || echo "0")
echo "Total matching lines: $total"
echo ""

if [[ "$total" -eq 0 ]]; then
    echo "No matching log entries found."
    exit 0
fi

echo "=== Top Error Patterns ==="
echo ""

# Normalize and aggregate
# - Strip timestamps (common formats)
# - Strip request IDs, UUIDs, hex strings
# - Strip numeric values that vary
grep -Ei "$severity" "$log_file" | \
    sed -E '
        # Strip ISO timestamps
        s/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.0-9]*Z?//g
        # Strip syslog timestamps
        s/^[A-Z][a-z]{2} [ 0-9][0-9] [0-9]{2}:[0-9]{2}:[0-9]{2}//g
        # Strip common log prefix timestamps (2024-01-15 10:30:45)
        s/[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}[.0-9]*//g
        # Strip epoch timestamps (10-13 digits)
        s/[0-9]{10,13}//g
        # Strip UUIDs
        s/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}//gi
        # Strip hex strings (8+ chars)
        s/0x[0-9a-f]{8,}//gi
        # Strip IP addresses
        s/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}//g
        # Strip port numbers after colon
        s/:[0-9]{2,5}\b//g
        # Strip standalone numbers (but keep ones in words)
        s/[[:space:]][0-9]+[[:space:]]/ /g
        # Normalize whitespace
        s/[[:space:]]+/ /g
        # Trim leading/trailing whitespace
        s/^[[:space:]]+//
        s/[[:space:]]+$//
    ' | \
    sort | \
    uniq -c | \
    sort -rn | \
    head -n "$limit" | \
    awk '{
        count = $1
        $1 = ""
        gsub(/^[[:space:]]+/, "", $0)
        printf "%6d  %s\n", count, substr($0, 1, 120)
    }'

echo ""
echo "=== Severity Breakdown ==="
echo ""

# Count by severity level
for level in ERROR WARN WARNING FATAL CRITICAL; do
    count=$(grep -Eic "\b$level\b" "$log_file" 2>/dev/null || echo "0")
    if [[ "$count" -gt 0 ]]; then
        printf "%8s: %d\n" "$level" "$count"
    fi
done
