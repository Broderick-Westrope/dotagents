#!/usr/bin/env python3
"""Brodie's GitHub picture for /today and /shutdown, one line per PR.

Usage: <claude-essentials>/anvil/commands/today/github.py SINCE
  SINCE is an ISO date or datetime (UTC), e.g. 2026-11-20T06:00:00Z.

Sections: review requests on Brodie, his open PRs, PRs assigned to him
(Gertrude's), his PRs merged or closed since SINCE, and PRs that mention
him updated since SINCE. "new-from-*" names who reviewed or commented since SINCE
(Gertrude counts as a bot).
"""
import json
import subprocess
import sys

FIELDS = """
number title url isDraft state mergedAt closedAt updatedAt reviewDecision mergeable
repository { name }
author { __typename login }
commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
reviews(last: 20) { nodes { author { __typename login } state submittedAt } }
comments(last: 20) { nodes { author { __typename login } createdAt } }
reviewThreads(first: 100) { nodes { isResolved } }
reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login } ... on Team { slug } } } }
"""

QUERY = """
query($q: String!) {
  viewer { login }
  search(query: $q, type: ISSUE, first: 50) {
    issueCount
    nodes { ... on PullRequest { %s } }
  }
}
""" % FIELDS


def search(q):
    out = subprocess.run(
        ["gh", "api", "graphql", "-f", f"query={QUERY}", "-f", f"q={q}"],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        return None, [], out.stderr.strip()
    data = json.loads(out.stdout)["data"]
    return data["viewer"]["login"], data["search"]["nodes"], None


BOTS = {"lgtm-buddy", "vera-fier", "linear-code", "linear", "github-actions", "g3rtrude"}


def is_bot(author):
    return author.get("__typename") == "Bot" or author.get("login") in BOTS


def line(pr, me, since):
    recent = [x for x in pr["reviews"]["nodes"] if (x["submittedAt"] or "") >= since]
    recent += [x for x in pr["comments"]["nodes"] if x["createdAt"] >= since]
    recent = [x["author"] for x in recent if x.get("author") and x["author"]["login"] != me]
    people = sorted({a["login"] for a in recent if not is_bot(a)})
    bots = sorted({a["login"] for a in recent if is_bot(a)})
    unresolved = sum(1 for t in pr["reviewThreads"]["nodes"] if not t["isResolved"])
    rollup = pr["commits"]["nodes"]
    ci = ((rollup[0]["commit"]["statusCheckRollup"] or {}).get("state") if rollup else None) or "-"
    reqs = [r["requestedReviewer"].get("login") or r["requestedReviewer"].get("slug")
            for r in pr["reviewRequests"]["nodes"] if r["requestedReviewer"]]
    if pr["state"] == "OPEN":
        state = "draft" if pr["isDraft"] else "ready"
    else:
        state = "merged" if pr["mergedAt"] else "closed"
    bits = [
        f'{pr["repository"]["name"]}#{pr["number"]}',
        state,
        f'review={pr["reviewDecision"] or "-"}',
        f"ci={ci}",
        f'unresolved={unresolved}',
        "new-from-people=" + (",".join(people) or "-"),
        "new-from-bots=" + (",".join(bots) or "-"),
        f'by={pr["author"]["login"] if pr["author"] else "-"}',
        f'updated={pr["updatedAt"][:16]}',
    ]
    if pr["mergeable"] == "CONFLICTING":
        bits.append("CONFLICTS")
    if reqs:
        bits.append("waiting-on=" + ",".join(reqs))
    return "  ".join(bits) + f'\n    {pr["title"]}  {pr["url"]}'


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    since = sys.argv[1]
    day = since[:10]
    sections = [
        ("Review requested from you directly", "is:pr is:open user-review-requested:@me org:eucalyptusvc"),
        ("Review requested from a team you're in", "is:pr is:open review-requested:@me -user-review-requested:@me org:eucalyptusvc"),
        ("Your open PRs", "is:pr is:open author:@me org:eucalyptusvc"),
        ("Assigned to you, not yours (Gertrude's)", "is:pr is:open assignee:@me -author:@me org:eucalyptusvc"),
        (f"Yours merged or closed since {since}", f"is:pr is:closed author:@me org:eucalyptusvc closed:>={day}"),
        (f"Mentioning you, updated since {since}", f"is:pr mentions:@me -author:@me org:eucalyptusvc updated:>={day}"),
    ]
    for title, q in sections:
        me, prs, err = search(q)
        print(f"## {title}")
        if err:
            print(f"  ERROR: {err}")
        elif not prs:
            print("  (none)")
        else:
            if "closed" in title:
                prs = [p for p in prs if (p["closedAt"] or "") >= since]
            for pr in sorted(prs, key=lambda p: p["updatedAt"], reverse=True):
                print("  " + line(pr, me, since))
        print()


if __name__ == "__main__":
    main()
