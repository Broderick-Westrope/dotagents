#!/usr/bin/env python3
"""Extract candidate user corrections from the Anvil session database.

Writes chunked markdown files that classifier subagents read, one entry per
user turn that follows an assistant reply and matches correction phrasing.
"""
import argparse
import datetime
import json
import os
import re
import sqlite3

DEFAULT_DB = os.path.expanduser("~/.local/share/anvil/anvil.db")

CORRECTION = re.compile(
    r"\b(don'?t|do not|never|always|instead|rather than|we (usually|normally|typically|prefer|avoid|use)|"
    r"convention|pattern|style|naming|rename|shouldn'?t|should not|why did you|why are you|why does|"
    r"not how we|prefer|remove (the|this|these)|no need|unnecessary|over.?engineer|verbose|concise|"
    r"too (complex|verbose|much|long)|simplif|inline|comment|consistent|match (the|existing)|"
    r"prior art|like (the )?other|follow|wrong|incorrect|stop|revert|undo|again|yagni|"
    r"on my behalf|for me|validate|evidence|are you sure)\b",
    re.I,
)
SKIP = re.compile(r"^(<|\[|/)|system_reminder", re.I)


def parse_since(value):
    if not value:
        return 0
    return int(datetime.datetime.fromisoformat(value).timestamp())


def text_of(parts):
    return " ".join(p["data"].get("text", "") for p in parts if p.get("type") == "text").strip()


def tool_markers(parts):
    markers = []
    for p in parts:
        if p.get("type") != "tool_call":
            continue
        data = p["data"]
        name = data.get("name", "")
        try:
            args = json.loads(data.get("input") or "{}")
        except json.JSONDecodeError:
            args = {}
        if name == "task" and args.get("subagent_type"):
            markers.append("task:" + args["subagent_type"])
        elif name == "view" and args.get("skill_name"):
            markers.append("skill:" + args["skill_name"])
    return markers


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--since", help="ISO date, e.g. 2026-09-01")
    ap.add_argument("--session", help="only this root session id")
    ap.add_argument("--current", action="store_true", help="only the session this command runs in ($ANVIL_ROOT_SESSION_ID)")
    ap.add_argument("--out", default="/tmp/corrections")
    ap.add_argument("--chunks", type=int, default=0, help="0 = auto, ~150KB per chunk")
    ap.add_argument("--all-turns", action="store_true", help="skip the keyword filter")
    ap.add_argument(
        "--mined",
        action="append",
        default=[],
        metavar="SESSION=ISO",
        help="skip this session's turns up to the time it was last mined; repeatable",
    )
    args = ap.parse_args()
    mined = {}
    for item in args.mined:
        sid, sep, when = item.partition("=")
        try:
            stamp = datetime.datetime.fromisoformat(when) if sep else None
        except ValueError:
            stamp = None
        if stamp is None or stamp.tzinfo is None:
            ap.error(f"--mined needs SESSION=ISO with a UTC offset, e.g. abc=2026-10-04T18:02:11+01:00; got {item!r}")
        mined[sid] = int(stamp.timestamp())
    if args.current:
        args.session = os.environ.get("ANVIL_ROOT_SESSION_ID")
        if not args.session:
            ap.error("--current needs ANVIL_ROOT_SESSION_ID; run from Anvil's bash tool or pass --session")

    db = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    query = "select id, title, working_dir from sessions where parent_session_id is null"
    params = []
    if args.session:
        query += " and id = ?"
        params.append(args.session)
    sessions = db.execute(query, params).fetchall()
    since = parse_since(args.since)
    home = os.path.expanduser("~")

    entries = []
    for sid, title, wd in sessions:
        rows = db.execute(
            "select role, parts, created_at from messages where session_id = ? and created_at >= ? order by created_at",
            (sid, max(since, mined.get(sid, 0))),
        ).fetchall()
        last_reply, markers = "", []
        for role, raw, created in rows:
            try:
                parts = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if role == "assistant":
                markers += tool_markers(parts)
                reply = text_of(parts)
                if reply:
                    last_reply = reply
                continue
            if role != "user":
                continue
            msg = text_of(parts)
            if len(msg) < 15 or not last_reply or SKIP.match(msg):
                markers = []
                continue
            if args.all_turns or CORRECTION.search(msg):
                entries.append({
                    "sid": sid,
                    "date": datetime.datetime.fromtimestamp(created).strftime("%Y-%m-%d"),
                    "repo": (wd or "").replace(home, "~"),
                    "title": title,
                    "markers": markers[-15:],
                    "reply": last_reply[-400:],
                    "user": msg[:1500],
                })
            markers = []

    os.makedirs(args.out, exist_ok=True)
    rendered = [
        f"### {{id}} | {e['date']} | {e['repo']} | {e['title']}\n"
        f"SESSION: {e['sid']}\n"
        f"AGENTS/SKILLS USED BEFORE: {', '.join(e['markers']) or '-'}\n"
        f"ASSISTANT (tail): {e['reply']}\n"
        f"USER: {e['user']}\n\n"
        for e in entries
    ]
    total = sum(len(r) for r in rendered)
    n = args.chunks or max(1, -(-total // 150_000))
    size = -(-len(rendered) // n) if rendered else 0
    for i in range(n):
        with open(os.path.join(args.out, f"chunk{i}.md"), "w") as f:
            for j, r in enumerate(rendered[i * size:(i + 1) * size]):
                f.write(r.replace("{id}", f"{i}-{j}", 1))
    print(json.dumps({"sessions": len(sessions), "candidates": len(entries), "chunks": n, "out": args.out}))


if __name__ == "__main__":
    main()
