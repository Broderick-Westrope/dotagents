#!/usr/bin/env bash
# Trace a request/correlation ID across multiple log files
# Usage: trace-request.sh <request-id> [log-files-or-dir]
# Examples:
#   trace-request.sh req-abc123 app.log           # Single file
#   trace-request.sh req-abc123 logs/             # All logs in directory
#   trace-request.sh req-abc123 *.log             # Multiple files
#   trace-request.sh abc-def-123 /var/log/app/    # UUID in directory

set -euo pipefail

request_id="${1:-}"
shift || true
log_sources=("${@:-./}")

if [[ -z "$request_id" ]]; then
    echo "Usage: trace-request.sh <request-id> [log-files-or-dir]" >&2
    echo "Examples:" >&2
    echo "  trace-request.sh req-abc123 app.log" >&2
    echo "  trace-request.sh req-abc123 logs/" >&2
    echo "  trace-request.sh abc-def-123 service1.log service2.log" >&2
    exit 1
fi

# Build list of log files to search
log_files=()
for source in "${log_sources[@]}"; do
    if [[ -d "$source" ]]; then
        # Directory - find all log files
        while IFS= read -r -d '' file; do
            log_files+=("$file")
        done < <(find "$source" -type f \( -name "*.log" -o -name "*.log.*" \) -print0 2>/dev/null)
    elif [[ -f "$source" ]]; then
        log_files+=("$source")
    fi
done

if [[ ${#log_files[@]} -eq 0 ]]; then
    echo "Error: No log files found" >&2
    exit 1
fi

echo "=== Request Trace ==="
echo "ID: $request_id"
echo "Searching ${#log_files[@]} file(s)..."
echo ""

# Create temp file for aggregated results
tmp_file=$(mktemp)
trap "rm -f '$tmp_file'" EXIT

# Search all files and collect results with file and line info
for log_file in "${log_files[@]}"; do
    if grep -n "$request_id" "$log_file" 2>/dev/null | \
       awk -v file="$log_file" '{print file ":" $0}' >> "$tmp_file"; then
        :
    fi
done

# Check if we found anything
if [[ ! -s "$tmp_file" ]]; then
    echo "No entries found for request ID: $request_id"
    exit 0
fi

total=$(wc -l < "$tmp_file" | tr -d ' ')
echo "Found $total entries"
echo ""

# Try to sort by timestamp if present
# Extract timestamp and sort, keeping original line
awk '
{
    line = $0
    ts = ""

    # Try ISO format
    if (match(line, /[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}/)) {
        ts = substr(line, RSTART, RLENGTH)
    }
    # Try common format
    else if (match(line, /[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}/)) {
        ts = substr(line, RSTART, RLENGTH)
    }

    if (ts != "") {
        print ts "\t" line
    } else {
        print "0000-00-00T00:00:00\t" line
    }
}
' "$tmp_file" | sort | cut -f2- | \
awk -v id="$request_id" '
BEGIN {
    prev_file = ""
    print "=== Chronological Trace ==="
    print ""
}
{
    # Extract filename from file:line:content format
    if (match($0, /^[^:]+/)) {
        file = substr($0, RSTART, RLENGTH)
        rest = substr($0, RLENGTH + 2)
    } else {
        file = "unknown"
        rest = $0
    }

    # Print file header when it changes
    if (file != prev_file) {
        if (prev_file != "") print ""
        print "--- " file " ---"
        prev_file = file
    }

    # Highlight the request ID
    gsub(id, "\033[1;33m" id "\033[0m", rest)
    print rest
}
'

echo ""
echo "=== Summary ==="

# Show which files had entries
echo ""
echo "Files with matches:"
cut -d: -f1 "$tmp_file" | sort | uniq -c | sort -rn | \
    awk '{ printf "  %4d  %s\n", $1, $2 }'

# Show severity breakdown if present
echo ""
echo "Severity levels:"
for level in ERROR WARN INFO DEBUG; do
    count=$(grep -ci "\b$level\b" "$tmp_file" 2>/dev/null || echo "0")
    if [[ "$count" -gt 0 ]]; then
        printf "  %4d  %s\n" "$count" "$level"
    fi
done
