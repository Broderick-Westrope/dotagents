#!/usr/bin/env bash
# Prints one JSON object per open PR the current gh user authored or is assigned to.
# Usage: gather.sh [filter]   (filter is a substring of owner/repo)
set -uo pipefail

filter="${1:-}"

retry() {
  local attempt out
  for attempt in 1 2 3; do
    if out="$("$@" 2>/dev/null)"; then
      printf '%s\n' "$out"
      return 0
    fi
    sleep $((attempt * 2))
  done
  return 1
}

pr_state() {
  local repo="$1" num="$2"
  retry gh pr view "$num" --repo "$repo" --json state,isDraft,mergedAt,title \
    | jq -c --arg ref "$repo#$num" '{ref: $ref} + .' \
    || jq -nc --arg ref "$repo#$num" '{ref: $ref, error: "lookup failed"}'
}

one() {
  local repo="$1" num="$2" me="$3" owner name view threads deps body mergeable
  owner="${repo%%/*}"
  name="${repo#*/}"

  view="$(retry gh pr view "$num" --repo "$repo" --json \
    url,title,body,author,assignees,isDraft,createdAt,updatedAt,baseRefName,headRefName,additions,deletions,changedFiles,reviewDecision,mergeable,mergeStateStatus,statusCheckRollup,reviews,comments,commits)" \
    || { jq -nc --arg ref "$repo#$num" '{ref: $ref, error: "gh pr view failed after 3 attempts"}'; return; }

  mergeable="$(jq -r .mergeable <<<"$view")"
  if [ "$mergeable" = "UNKNOWN" ]; then
    sleep 5
    local again
    if again="$(retry gh pr view "$num" --repo "$repo" --json mergeable,mergeStateStatus)"; then
      view="$(jq -c --argjson m "$again" '. + $m' <<<"$view")"
    fi
  fi

  threads="$(retry gh api graphql -f query="{repository(owner:\"$owner\",name:\"$name\"){pullRequest(number:$num){reviewThreads(first:100){nodes{isResolved path comments(first:20){nodes{author{login} createdAt body}}}}}}}" \
    --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)]')" || threads='null'

  body="$(jq -r '.body // ""' <<<"$view")"
  deps="$(
    {
      grep -oE 'github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[0-9]+' <<<"$body" \
        | sed -E 's#github\.com/([^/]+/[^/]+)/pull/([0-9]+)#\1 \2#'
      grep -oE '(^|[^A-Za-z0-9_/.-])([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)?#[0-9]+' <<<"$body" \
        | sed -E 's#^[^A-Za-z0-9#]*##' \
        | awk -v self="$repo" -F'#' '{print ($1 == "" ? self : $1), $2}'
    } | sort -u | grep -v "^$repo $num\$" | while read -r drepo dnum; do pr_state "$drepo" "$dnum"; done | jq -sc .
  )"

  jq -c --arg repo "$repo" --arg me "$me" --argjson threads "$threads" --argjson deps "${deps:-[]}" '
    def checkstate: (.conclusion // .state // .status // "UNKNOWN");
    {
      ref: "\($repo)#\(.url | split("/") | last)",
      url, title,
      author: .author.login,
      assignees: [.assignees[].login],
      relation: ([if .author.login == $me then "author" else empty end, if any(.assignees[]; .login == $me) then "assignee" else empty end]),
      isDraft, createdAt, updatedAt, baseRefName, headRefName,
      size: {additions, deletions, changedFiles},
      reviewDecision, mergeable, mergeStateStatus,
      checks: {
        total: (.statusCheckRollup | length),
        failing: [.statusCheckRollup[]? | select(checkstate | IN("FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED")) | (.name // .context)],
        pending: [.statusCheckRollup[]? | select(checkstate | IN("PENDING", "IN_PROGRESS", "QUEUED", "EXPECTED", "WAITING")) | (.name // .context)]
      },
      lastCommitAt: (.commits | last | .committedDate),
      commitCount: (.commits | length),
      reviews: [.reviews[] | {author: .author.login, state, at: .submittedAt, body: (.body[:600])}],
      comments: [.comments[] | select(.author.login | IN("linear-code", "linear", "github-actions") | not) | {author: .author.login, at: .createdAt, body: (.body[:600])}],
      unresolvedThreads: $threads,
      dependencies: $deps,
      body: (.body[:1500])
    }' <<<"$view"
}

export -f one retry pr_state

ME="$(retry gh api user --jq .login)" || { echo 'gather.sh: gh api user failed; is gh logged in?' >&2; exit 1; }
export ME

for role in author assignee; do
  retry gh search prs "--$role" @me --state open --limit 200 --json repository,number \
    --jq '.[] | "\(.repository.nameWithOwner) \(.number)"' \
    || echo "gather.sh: gh search prs --$role failed after 3 attempts; results are incomplete" >&2
done \
  | sed '/^$/d' | sort -u \
  | { if [ -n "$filter" ]; then grep -F -- "$filter" || true; else cat; fi; } \
  | xargs -P 6 -L 1 bash -c 'one "$0" "$1" "$ME"'
