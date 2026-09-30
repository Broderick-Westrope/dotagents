#!/usr/bin/env bash
# Extract and group stack traces from log files
# Usage: extract-stack-traces.sh <log-file> [pattern] [limit]
# Examples:
#   extract-stack-traces.sh app.log                    # Auto-detect traces
#   extract-stack-traces.sh app.log "NullPointer"      # Filter by pattern
#   extract-stack-traces.sh app.log "Traceback" 5      # Python tracebacks, top 5

set -euo pipefail

log_file="${1:-}"
filter_pattern="${2:-}"
limit="${3:-10}"

if [[ -z "$log_file" ]]; then
    echo "Usage: extract-stack-traces.sh <log-file> [pattern] [limit]" >&2
    echo "Examples:" >&2
    echo "  extract-stack-traces.sh app.log" >&2
    echo "  extract-stack-traces.sh app.log \"NullPointer\"" >&2
    echo "  extract-stack-traces.sh app.log \"\" 20" >&2
    exit 1
fi

if [[ ! -f "$log_file" ]]; then
    echo "Error: File not found: $log_file" >&2
    exit 1
fi

# Create temp file with cleanup trap
tmp_file=$(mktemp)
trap "rm -f '$tmp_file'" EXIT

echo "=== Stack Trace Report ==="
echo "File: $log_file"
[[ -n "$filter_pattern" ]] && echo "Filter: $filter_pattern"
echo ""

# Extract traces and group by unique signature
# Supports: Java, Python, Node.js, Go, Ruby, .NET
awk '
BEGIN {
    in_trace = 0
    trace = ""
}

# Start of trace markers
/Exception|Error:|Traceback \(most recent|panic:|goroutine [0-9]+ \[|RuntimeError|System\..*Exception/ {
    # Save previous trace if exists
    if (in_trace && trace != "") {
        # Normalize the trace for grouping (strip line numbers, memory addresses)
        normalized = trace
        gsub(/:[0-9]+\)/, ":N)", normalized)
        gsub(/:[0-9]+$/, ":N", normalized)
        gsub(/0x[0-9a-f]+/, "0xN", normalized)
        gsub(/\$[0-9]+/, "$N", normalized)

        traces[normalized] = traces[normalized] ? traces[normalized] : trace
        counts[normalized]++
    }
    in_trace = 1
    trace = $0 "\n"
    next
}

# Continuation lines
in_trace {
    # Java/Node: "at " prefix
    # Python: "File \"" or indented
    # Go: tab-indented or goroutine info
    # Ruby: "from " prefix
    # .NET: "at " or "--- End of"
    if (/^[[:space:]]+(at |File "|from |---)|^\t/) {
        trace = trace $0 "\n"
        next
    }

    # Caused by (Java)
    if (/^Caused by:/) {
        trace = trace $0 "\n"
        next
    }

    # Empty lines within trace (limit trace size to prevent memory issues)
    if (/^[[:space:]]*$/ && length(trace) < 5000) {
        trace = trace $0 "\n"
        next
    }

    # End of trace
    if (trace != "") {
        normalized = trace
        gsub(/:[0-9]+\)/, ":N)", normalized)
        gsub(/:[0-9]+$/, ":N", normalized)
        gsub(/0x[0-9a-f]+/, "0xN", normalized)
        gsub(/\$[0-9]+/, "$N", normalized)

        traces[normalized] = traces[normalized] ? traces[normalized] : trace
        counts[normalized]++
    }
    in_trace = 0
    trace = ""
}

END {
    # Handle final trace
    if (in_trace && trace != "") {
        normalized = trace
        gsub(/:[0-9]+\)/, ":N)", normalized)
        gsub(/:[0-9]+$/, ":N", normalized)
        gsub(/0x[0-9a-f]+/, "0xN", normalized)
        gsub(/\$[0-9]+/, "$N", normalized)

        traces[normalized] = traces[normalized] ? traces[normalized] : trace
        counts[normalized]++
    }

    # Sort by count (descending)
    n = 0
    for (key in counts) {
        n++
        keys[n] = key
    }

    for (i = 1; i <= n; i++) {
        for (j = i + 1; j <= n; j++) {
            if (counts[keys[j]] > counts[keys[i]]) {
                temp = keys[i]
                keys[i] = keys[j]
                keys[j] = temp
            }
        }
    }

    # Print sorted results
    for (i = 1; i <= n; i++) {
        key = keys[i]
        printf "=== Count: %d ===\n", counts[key]
        # Print first 30 lines of trace
        split(traces[key], lines, "\n")
        for (j = 1; j <= 30 && j in lines; j++) {
            print lines[j]
        }
        if (length(lines) > 30) {
            print "... (truncated)"
        }
        print ""
    }
}
' "$log_file" > "$tmp_file"

# Count total unique traces
total=$(grep -c "^=== Count:" "$tmp_file" 2>/dev/null || echo "0")

# Apply filter and limit
if [[ -n "$filter_pattern" ]]; then
    # Filter to traces containing the pattern
    awk -v pattern="$filter_pattern" -v limit="$limit" '
        /^=== Count:/ {
            if (found && count < limit) { print block }
            block = $0 "\n"
            found = 0
            count++
        }
        !/^=== Count:/ {
            block = block $0 "\n"
            if ($0 ~ pattern) found = 1
        }
        END { if (found && count <= limit) print block }
    ' "$tmp_file"
else
    head -n $((limit * 35)) "$tmp_file"
fi

echo ""
echo "Total unique stack traces found: $total"
