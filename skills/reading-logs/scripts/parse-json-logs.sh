#!/usr/bin/env bash
# Parse JSON/JSONL logs with jq
# Usage: parse-json-logs.sh <log-file> [jq-filter] [limit]
# Examples:
#   parse-json-logs.sh app.log                              # Pretty print all
#   parse-json-logs.sh app.log 'select(.level == "error")'  # Filter by level
#   parse-json-logs.sh app.log 'select(.status >= 500)' 100 # Filter with limit

set -euo pipefail

log_file="${1:-}"
jq_filter="${2:-.}"
limit="${3:-0}"

if [[ -z "$log_file" ]]; then
    echo "Usage: parse-json-logs.sh <log-file> [jq-filter] [limit]" >&2
    echo "Examples:" >&2
    echo "  parse-json-logs.sh app.log" >&2
    echo "  parse-json-logs.sh app.log 'select(.level == \"error\")'" >&2
    echo "  parse-json-logs.sh app.log '.message' 50" >&2
    exit 1
fi

if [[ ! -f "$log_file" ]]; then
    echo "Error: File not found: $log_file" >&2
    exit 1
fi

# Check for jq
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed" >&2
    echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)" >&2
    exit 1
fi

# Detect format based on first non-empty line
first_char=$(grep -m1 -o '^.' "$log_file" 2>/dev/null || echo "")

process_jsonl() {
    # Process newline-delimited JSON efficiently
    # Skip non-JSON lines gracefully, apply filter
    if [[ "$limit" -gt 0 ]]; then
        jq -c "select(. != null) | $jq_filter" "$log_file" 2>/dev/null | head -n "$limit" | jq .
    else
        jq -c "select(. != null) | $jq_filter" "$log_file" 2>/dev/null | jq .
    fi
}

process_json_array() {
    # Process JSON array format
    if [[ "$limit" -gt 0 ]]; then
        jq ".[:$limit][] | $jq_filter" "$log_file"
    else
        jq ".[] | $jq_filter" "$log_file"
    fi
}

# Try to process based on detected format
if [[ "$first_char" == "[" ]]; then
    process_json_array
elif [[ "$first_char" == "{" ]]; then
    process_jsonl
else
    # Mixed format - try line by line with error handling
    echo "Warning: Log file may contain non-JSON lines, processing line by line..." >&2
    count=0
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip empty lines and non-JSON
        [[ -z "$line" ]] && continue
        [[ "${line:0:1}" != "{" ]] && continue

        # Apply filter
        result=$(echo "$line" | jq -e "$jq_filter" 2>/dev/null) || continue
        [[ -n "$result" && "$result" != "null" ]] && echo "$result" | jq .

        # Check limit
        if [[ "$limit" -gt 0 ]]; then
            ((count++))
            [[ "$count" -ge "$limit" ]] && break
        fi
    done < "$log_file"
fi
