#!/usr/bin/env bash
# Show error distribution over time (hourly or minute buckets)
# Usage: timeline.sh <log-file> [pattern] [bucket-size]
# Examples:
#   timeline.sh app.log                    # Errors by hour
#   timeline.sh app.log "ERROR" "minute"   # Errors by minute
#   timeline.sh app.log "timeout" "hour"   # Timeouts by hour

set -euo pipefail

log_file="${1:-}"
pattern="${2:-ERROR|WARN|FATAL}"
bucket="${3:-hour}"

if [[ -z "$log_file" ]]; then
    echo "Usage: timeline.sh <log-file> [pattern] [bucket-size]" >&2
    echo "Bucket sizes: hour (default), minute, day" >&2
    echo "Examples:" >&2
    echo "  timeline.sh app.log" >&2
    echo "  timeline.sh app.log \"ERROR\" minute" >&2
    echo "  timeline.sh app.log \"timeout|connection\" hour" >&2
    exit 1
fi

if [[ ! -f "$log_file" ]]; then
    echo "Error: File not found: $log_file" >&2
    exit 1
fi

echo "=== Error Timeline ==="
echo "File: $log_file"
echo "Pattern: $pattern"
echo "Bucket: $bucket"
echo ""

# Extract timestamps and bucket them
# Supports common formats:
# - ISO: 2024-01-15T10:30:45
# - Syslog: Jan 15 10:30:45
# - Common: 2024-01-15 10:30:45
# - Bracketed: [2024-01-15 10:30:45]

grep -Ei "$pattern" "$log_file" | \
awk -v bucket="$bucket" '
BEGIN {
    # Month name to number mapping
    months["Jan"]="01"; months["Feb"]="02"; months["Mar"]="03"
    months["Apr"]="04"; months["May"]="05"; months["Jun"]="06"
    months["Jul"]="07"; months["Aug"]="08"; months["Sep"]="09"
    months["Oct"]="10"; months["Nov"]="11"; months["Dec"]="12"
}
{
    ts = ""

    # Try ISO format: 2024-01-15T10:30:45
    if (match($0, /[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}/)) {
        ts = substr($0, RSTART, RLENGTH)
        gsub(/T/, " ", ts)
    }
    # Try common format: 2024-01-15 10:30:45
    else if (match($0, /[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}/)) {
        ts = substr($0, RSTART, RLENGTH)
    }
    # Try bracketed format: [2024-01-15 10:30:45]
    else if (match($0, /\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}/)) {
        ts = substr($0, RSTART+1, RLENGTH-1)
    }
    # Try syslog format: Jan 15 10:30:45
    else if (match($0, /[A-Z][a-z]{2} [ 0-9][0-9] [0-9]{2}:[0-9]{2}/)) {
        raw = substr($0, RSTART, RLENGTH)
        split(raw, parts, /[ :]+/)
        month = months[parts[1]]
        day = sprintf("%02d", parts[2])
        hour = parts[3]
        minute = parts[4]
        # Use current year as syslog doesnt include it
        ts = "YYYY-" month "-" day " " hour ":" minute
    }

    if (ts != "") {
        if (bucket == "minute") {
            # Keep YYYY-MM-DD HH:MM
            key = ts
        } else if (bucket == "day") {
            # Keep YYYY-MM-DD
            key = substr(ts, 1, 10)
        } else {
            # Default: hour - keep YYYY-MM-DD HH
            key = substr(ts, 1, 13)
        }
        counts[key]++
        total++
    }
}
END {
    if (total == 0) {
        print "No matching entries with parseable timestamps found."
        exit
    }

    # Sort keys
    n = asorti(counts, sorted)

    # Find max for bar scaling
    max = 0
    for (i = 1; i <= n; i++) {
        if (counts[sorted[i]] > max) max = counts[sorted[i]]
    }

    # Print histogram
    bar_width = 40
    printf "%-20s %6s  %s\n", "Time", "Count", "Distribution"
    printf "%-20s %6s  %s\n", "----", "-----", "------------"

    for (i = 1; i <= n; i++) {
        key = sorted[i]
        count = counts[key]
        bar_len = int((count / max) * bar_width)
        bar = ""
        for (j = 0; j < bar_len; j++) bar = bar "#"

        printf "%-20s %6d  %s\n", key, count, bar
    }

    print ""
    printf "Total: %d entries over %d %s buckets\n", total, n, bucket
    printf "Peak: %d at %s\n", max, sorted[n]
}
'
