#!/usr/bin/env bash
# Find slow operations by parsing duration fields from logs
# Usage: slow-requests.sh <log-file> [threshold-ms] [limit]
# Examples:
#   slow-requests.sh app.log                # Find all with duration, show slowest
#   slow-requests.sh app.log 1000           # Only show requests > 1000ms
#   slow-requests.sh app.log 500 20         # Top 20 requests > 500ms

set -euo pipefail

log_file="${1:-}"
threshold_ms="${2:-0}"
limit="${3:-10}"

if [[ -z "$log_file" ]]; then
    echo "Usage: slow-requests.sh <log-file> [threshold-ms] [limit]" >&2
    echo "Examples:" >&2
    echo "  slow-requests.sh app.log" >&2
    echo "  slow-requests.sh app.log 1000" >&2
    echo "  slow-requests.sh app.log 500 20" >&2
    exit 1
fi

if [[ ! -f "$log_file" ]]; then
    echo "Error: File not found: $log_file" >&2
    exit 1
fi

echo "=== Slow Requests Report ==="
echo "File: $log_file"
echo "Threshold: ${threshold_ms}ms"
echo "Limit: $limit"
echo ""

# Extract duration from common patterns:
# - "duration=123ms" or "duration: 123ms"
# - "took 123ms" or "took 123 ms"
# - "elapsed=123" or "elapsed: 123ms"
# - "latency=123ms" or "latency_ms=123"
# - "time=123ms" or "response_time=123"
# - "123ms" standalone
# - JSON: "duration": 123, "duration_ms": 123

awk -v threshold="$threshold_ms" -v limit="$limit" '
BEGIN {
    count = 0
}
{
    line = $0
    duration = -1

    # Try common patterns (case insensitive matching)
    lower = tolower(line)

    # Pattern: duration=123ms, elapsed=123ms, latency=123ms, time=123ms
    if (match(lower, /(duration|elapsed|latency|time|response_time)[=: ]+([0-9.]+)\s*(ms|milliseconds)?/)) {
        # Extract the number
        temp = substr(lower, RSTART, RLENGTH)
        if (match(temp, /[0-9.]+/)) {
            duration = substr(temp, RSTART, RLENGTH) + 0
        }
    }
    # Pattern: took 123ms, took 123 ms
    else if (match(lower, /took\s+([0-9.]+)\s*(ms|milliseconds)/)) {
        temp = substr(lower, RSTART, RLENGTH)
        if (match(temp, /[0-9.]+/)) {
            duration = substr(temp, RSTART, RLENGTH) + 0
        }
    }
    # Pattern: "duration": 123 or "duration_ms": 123 (JSON)
    else if (match(lower, /"(duration|duration_ms|elapsed|latency)":\s*([0-9.]+)/)) {
        temp = substr(lower, RSTART, RLENGTH)
        if (match(temp, /:\s*[0-9.]+/)) {
            num = substr(temp, RSTART+1, RLENGTH-1)
            gsub(/\s+/, "", num)
            duration = num + 0
        }
    }
    # Pattern: in 123ms
    else if (match(lower, /in\s+([0-9.]+)\s*(ms|milliseconds)/)) {
        temp = substr(lower, RSTART, RLENGTH)
        if (match(temp, /[0-9.]+/)) {
            duration = substr(temp, RSTART, RLENGTH) + 0
        }
    }
    # Pattern: seconds (convert to ms)
    else if (match(lower, /(duration|elapsed|took)[=: ]+([0-9.]+)\s*s(ec|econds)?/)) {
        temp = substr(lower, RSTART, RLENGTH)
        if (match(temp, /[0-9.]+/)) {
            duration = (substr(temp, RSTART, RLENGTH) + 0) * 1000
        }
    }

    if (duration >= threshold) {
        # Store with duration for sorting
        entries[count] = duration "\t" line
        durations[count] = duration
        count++
    }
}
END {
    if (count == 0) {
        print "No entries found with duration >= " threshold "ms"
        exit
    }

    # Sort by duration (descending) - simple bubble sort
    for (i = 0; i < count; i++) {
        for (j = i + 1; j < count; j++) {
            if (durations[j] > durations[i]) {
                temp = entries[i]; entries[i] = entries[j]; entries[j] = temp
                temp = durations[i]; durations[i] = durations[j]; durations[j] = temp
            }
        }
    }

    # Print results
    printf "=== Slowest Requests (Top %d of %d) ===\n\n", (limit < count ? limit : count), count
    printf "%10s  %s\n", "Duration", "Log Entry"
    printf "%10s  %s\n", "--------", "---------"

    for (i = 0; i < limit && i < count; i++) {
        split(entries[i], parts, "\t")
        dur = parts[1]
        entry = parts[2]

        # Format duration
        if (dur >= 1000) {
            dur_str = sprintf("%.1fs", dur/1000)
        } else {
            dur_str = sprintf("%dms", dur)
        }

        # Truncate long entries
        if (length(entry) > 100) {
            entry = substr(entry, 1, 100) "..."
        }

        printf "%10s  %s\n", dur_str, entry
    }

    # Statistics
    print ""
    print "=== Statistics ==="
    total = 0
    for (i = 0; i < count; i++) total += durations[i]
    avg = total / count

    printf "Total entries: %d\n", count
    printf "Average: %.1fms\n", avg
    printf "Slowest: %.1fms\n", durations[0]
    printf "Fastest (above threshold): %.1fms\n", durations[count-1]

    # Distribution buckets
    print ""
    print "=== Duration Distribution ==="
    bucket_100 = 0; bucket_500 = 0; bucket_1000 = 0; bucket_5000 = 0; bucket_more = 0
    for (i = 0; i < count; i++) {
        d = durations[i]
        if (d < 100) bucket_100++
        else if (d < 500) bucket_500++
        else if (d < 1000) bucket_1000++
        else if (d < 5000) bucket_5000++
        else bucket_more++
    }

    if (bucket_100 > 0) printf "  < 100ms:  %d\n", bucket_100
    if (bucket_500 > 0) printf "  100-500ms: %d\n", bucket_500
    if (bucket_1000 > 0) printf "  500ms-1s: %d\n", bucket_1000
    if (bucket_5000 > 0) printf "  1-5s:     %d\n", bucket_5000
    if (bucket_more > 0) printf "  > 5s:     %d\n", bucket_more
}
' "$log_file"
