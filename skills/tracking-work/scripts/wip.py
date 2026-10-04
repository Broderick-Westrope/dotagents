#!/usr/bin/env python3
"""Track initiatives across worktrees, PRs, topics, docs and Anvil sessions.

Each initiative is <WIP_DIR>/<slug>.md: JSON front matter owned by this
script, then a markdown body owned by agents and the user.
"""
import argparse
import concurrent.futures
import contextlib
import datetime
import fcntl
import hashlib
import json
import os
import re
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.parse

HOME = os.path.expanduser("~")
WIP_DIR = os.path.realpath(os.path.expanduser(os.environ.get("WIP_DIR") or "~/.agents/initiatives"))
WIP_ARCHIVE_DIR = os.path.realpath(os.path.expanduser(os.environ.get("WIP_ARCHIVE_DIR") or "~/.agents/notes/archive"))
WIP_WORKTREES_ROOT = os.path.realpath(
    os.path.expanduser(os.environ.get("WIP_WORKTREES_ROOT") or "~/Library/Application Support/wtp/worktrees")
)
ANVIL_DB = os.path.realpath(os.path.expanduser(os.environ.get("ANVIL_DB") or "~/.local/share/anvil/anvil.db"))
WIP_GH = os.environ.get("WIP_GH") or "gh"

PHASES = ["idea", "spec", "planning", "implementing", "review", "done", "parked"]
ACTIVE_PHASES = {"idea", "spec", "planning", "implementing", "review"}
DOC_PHASES = {"spec", "planning"}
SOURCES = {"manual", "sync"}
PR_STATES = {"unknown", "draft", "open", "merged", "closed"}
LIVE_PR_STATES = {"unknown", "draft", "open"}
KEYS = {"v", "title", "phase", "phase_source", "since", "reason", "parked_from", "links"}
LINK_KEYS = {
    "worktree": {"kind", "ref"},
    "topic": {"kind", "ref"},
    "doc": {"kind", "ref"},
    "pr": {"kind", "ref", "state", "observed", "error"},
    "session": {"kind", "ref", "cwd"},
}
PATH_KINDS = {"worktree", "topic", "doc"}
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,48}$")
PR_URL = re.compile(r"^https://github\.com/[^/]+/[^/]+/pull/\d+$")
NEXT_SECTION = re.compile(r"^##[ \t]+Next[ \t]*\r?$(.*?)(?=^##[ \t]|\Z)", re.M | re.S)
TEMPLATE_BODY = b"\n## Why\n\n## Decisions\n\n## Next\n"
OPEN_FM = b"---\n"
CLOSE_FM = b"\n---\n"
NOTES = "NOTES.local.md"
SKIP_DIRS = {"node_modules"}
DEFAULT_PIN_REASON = "pinned in Anvil"
FALLBACK_SLUG = "pinned-session"
ROOT_SESSION_SQL = "(parent_session_id is null or parent_session_id = '')"
UPDATED_SECONDS_SQL = "(case when updated_at > 1e12 then updated_at / 1000 else updated_at end)"

LOCK_TIMEOUT = 5
WRITE_ATTEMPTS = 3
GH_TIMEOUT = 10
GIT_TIMEOUT = 3
BOARD_DEADLINE = 20
WORKERS = 8
DONE_HIDDEN_AFTER_DAYS = 14
PARKED_FLAG_DAYS = 30
STALE_COMMIT_DAYS = 14


class WipError(Exception):
    pass


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise WipError(message)


def flatten(text):
    return re.sub(r"\s*[\r\n]+\s*", " ", text or "").strip()


def slug_path(slug):
    if not SLUG.match(slug):
        raise WipError(f"invalid slug {slug!r}: use 2 to 49 of a-z, 0-9 and -, starting with a letter or digit")
    return os.path.join(WIP_DIR, slug + ".md")


def check(meta, path):
    def bad(problem):
        raise WipError(f"{path}: {problem}")

    if not isinstance(meta, dict):
        bad("front matter is not a JSON object")
    if meta.get("v") != 1:
        bad(f"unsupported version {meta.get('v')!r}")
    if set(meta) - KEYS:
        bad(f"unknown key {sorted(set(meta) - KEYS)[0]!r}")
    if KEYS - set(meta):
        bad(f"missing key {sorted(KEYS - set(meta))[0]!r}")
    if not isinstance(meta["title"], str) or not meta["title"]:
        bad("title must be a non-empty string")
    if meta["phase"] not in PHASES:
        bad(f"unknown phase {meta['phase']!r}")
    if meta["phase_source"] not in SOURCES:
        bad(f"unknown phase_source {meta['phase_source']!r}")
    if meta["parked_from"] is not None and meta["parked_from"] not in ACTIVE_PHASES:
        bad(f"invalid parked_from {meta['parked_from']!r}")
    try:
        datetime.date.fromisoformat(meta["since"])
    except (TypeError, ValueError):
        bad(f"invalid since {meta['since']!r}")
    needs_reason = meta["phase"] == "parked" or (meta["phase"] == "done" and meta["phase_source"] == "manual")
    if needs_reason and not meta["reason"]:
        bad(f"reason is required at phase {meta['phase']}")
    if not isinstance(meta["links"], list):
        bad("links must be a list")
    seen = set()
    for link in meta["links"]:
        if not isinstance(link, dict) or link.get("kind") not in LINK_KEYS or not isinstance(link.get("ref"), str):
            bad(f"invalid link {link!r}")
        if set(link) - LINK_KEYS[link["kind"]]:
            bad(f"unknown key {sorted(set(link) - LINK_KEYS[link['kind']])[0]!r} in {link['kind']} link")
        if link["kind"] == "pr" and link.get("state") not in PR_STATES:
            bad(f"invalid PR state {link.get('state')!r}")
        if (link["kind"], link["ref"]) in seen:
            bad(f"duplicate {link['kind']} link {link['ref']}")
        seen.add((link["kind"], link["ref"]))


def load(path):
    try:
        with open(path, "rb") as f:
            raw = f.read()
    except FileNotFoundError:
        raise WipError(f"no initiative at {path}") from None
    end = raw.find(CLOSE_FM, len(OPEN_FM) - 1)
    if not raw.startswith(OPEN_FM) or end < 0:
        raise WipError(f"{path}: missing --- front matter")
    try:
        meta = json.loads(raw[len(OPEN_FM):end])
    except ValueError as e:
        raise WipError(f"{path}: invalid JSON: {e}") from None
    check(meta, path)
    return raw, meta, raw[end + len(CLOSE_FM):]


def load_all():
    if not os.path.isdir(WIP_DIR):
        return []
    names = sorted(n for n in os.listdir(WIP_DIR) if n.endswith(".md") and not n.startswith("."))
    return [(n[:-3], *load(os.path.join(WIP_DIR, n))[1:]) for n in names]


def render(meta, body):
    return OPEN_FM + json.dumps(meta, indent=2, ensure_ascii=False).encode() + CLOSE_FM + body


def write_atomic(path, data):
    fd, tmp = tempfile.mkstemp(dir=WIP_DIR, prefix=".", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    except BaseException:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(tmp)
        raise


@contextlib.contextmanager
def locked():
    os.makedirs(WIP_DIR, exist_ok=True)
    fd = os.open(os.path.join(WIP_DIR, ".lock"), os.O_CREAT | os.O_RDWR, 0o644)
    try:
        deadline = time.monotonic() + LOCK_TIMEOUT
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() > deadline:
                    raise WipError(f"timed out after {LOCK_TIMEOUT}s waiting for {WIP_DIR}/.lock") from None
                time.sleep(0.05)
        yield
    finally:
        os.close(fd)


def mutate(slug, change):
    path = slug_path(slug)
    with locked():
        for _ in range(WRITE_ATTEMPTS):
            raw, meta, body = load(path)
            if change(meta) is False:
                return meta
            check(meta, path)
            with open(path, "rb") as f:
                if hashlib.sha256(f.read()).digest() != hashlib.sha256(raw).digest():
                    continue
            write_atomic(path, render(meta, body))
            return meta
    raise WipError(f"{path} kept changing during the write; try again")


def git(path, *args, timeout=GIT_TIMEOUT):
    p = subprocess.Popen(
        ["git", "-C", path, *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        encoding="utf-8",
        errors="replace",
        start_new_session=True,
    )
    try:
        out, _ = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(p.pid, signal.SIGKILL)
        p.communicate()
        raise
    return out if p.returncode == 0 else None


def open_db():
    if not os.path.isfile(ANVIL_DB):
        return None
    return sqlite3.connect(f"file:{urllib.parse.quote(ANVIL_DB)}?mode=ro", uri=True)


def ago(ts):
    s = max(0, int(time.time() - ts))
    if s < 3600:
        return f"{s // 60}m ago"
    if s < 86400:
        return f"{s // 3600}h ago"
    return f"{s // 86400}d ago"


def today():
    return datetime.date.today().isoformat()


def cmd_new(args):
    path = slug_path(args.slug)
    meta = {
        "v": 1,
        "title": flatten(args.title),
        "phase": "idea",
        "phase_source": "manual",
        "since": today(),
        "reason": None,
        "parked_from": None,
        "links": [],
    }
    check(meta, path)
    with locked():
        if os.path.exists(path):
            raise WipError(f"{path} already exists")
        write_atomic(path, render(meta, TEMPLATE_BODY))
    print(path)


def cmd_show(args):
    raw, meta, _ = load(slug_path(args.slug))
    sys.stdout.write(raw.decode("utf-8", "replace"))
    print()
    cmd_board(argparse.Namespace(all=True, only=args.slug))
    worktrees = [link["ref"] for link in meta["links"] if link["kind"] == "worktree"]
    sessions = [link["ref"] for link in meta["links"] if link["kind"] == "session"]
    if sessions:
        print("\nresume:")
    for sid in sessions:
        print(f"  anvil --session {sid} --there")
        for wt in worktrees:
            quoted = wt.replace("'", "'\\''")
            print(f"  cd '{quoted}' && anvil --session {sid}")


def cmd_which(args):
    path = os.path.realpath(args.path or os.getcwd()) if args.path or not args.session else None
    found = set()
    for slug, meta, _ in load_all():
        for link in meta["links"]:
            kind, ref = link["kind"], link["ref"]
            inside = path is not None and kind in ("worktree", "topic") and os.path.commonpath([path, ref]) == ref
            same_doc = path is not None and kind == "doc" and path == ref
            if inside or same_doc or (kind == "session" and ref == args.session):
                found.add(slug)
    for slug in sorted(found):
        print(slug)


def cmd_link(args):
    kind = args.kind
    ref = os.path.realpath(os.path.expanduser(args.ref)) if kind in PATH_KINDS else args.ref

    def change(meta):
        link = {"kind": kind, "ref": ref}
        if kind == "worktree":
            out = git(ref, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir") if os.path.isdir(ref) else None
            dirs = (out or "").split("\n")[:2]
            if len(dirs) < 2 or not dirs[0] or dirs[0] == dirs[1]:
                raise WipError(f"{ref} is not a linked git worktree")
        elif kind in PATH_KINDS and not os.path.exists(ref):
            raise WipError(f"{ref} does not exist")
        elif kind == "pr":
            if not PR_URL.match(ref):
                raise WipError(f"{ref} is not a GitHub PR URL like https://github.com/<owner>/<repo>/pull/<n>")
            link.update(state="unknown", observed=None, error=None)
        elif kind == "session":
            db = open_db()
            if db:
                row = db.execute(
                    f"select working_dir from sessions where id = ? and {ROOT_SESSION_SQL}",
                    (ref,),
                ).fetchone()
                db.close()
                if row is None:
                    raise WipError(f"no root session {ref} in {ANVIL_DB}")
                link["cwd"] = os.path.realpath(row[0]) if row[0] else None
            else:
                link["cwd"] = os.path.realpath(os.path.expanduser(args.cwd or os.getcwd()))
        if any(existing["kind"] == kind and existing["ref"] == ref for existing in meta["links"]):
            return False
        meta["links"].append(link)

    mutate(args.slug, change)
    print(f"{args.slug}: {kind} {ref}")


def cmd_unlink(args):
    ref = os.path.realpath(os.path.expanduser(args.ref)) if args.kind in PATH_KINDS else args.ref

    def change(meta):
        kept = [link for link in meta["links"] if (link["kind"], link["ref"]) != (args.kind, ref)]
        if len(kept) == len(meta["links"]):
            raise WipError(f"{args.slug} has no {args.kind} link {ref}")
        meta["links"] = kept

    mutate(args.slug, change)
    print(f"{args.slug}: unlinked {args.kind} {ref}")


def cmd_phase(args):
    target = args.target
    reason = flatten(args.reason) or None
    doc = os.path.realpath(os.path.expanduser(args.doc)) if args.doc else None

    def change(meta):
        current = meta["phase"]
        if target == "review":
            raise WipError("review comes from PR state: link a PR and run `wip sync`")
        if target == "unpark":
            if current != "parked":
                raise WipError(f"only a parked initiative can be unparked; {args.slug} is {current}")
            meta.update(phase=meta["parked_from"] or "idea", reason=None, parked_from=None)
        elif target in ("done", "parked"):
            if current not in ACTIVE_PHASES:
                raise WipError(f"cannot move from {current} to {target}")
            if not reason:
                raise WipError(f"{target} needs --reason")
            live = [link["ref"] for link in meta["links"] if link["kind"] == "pr" and link["state"] in LIVE_PR_STATES]
            if target == "done" and live:
                raise WipError(f"PR {live[0]} is open, draft or unobserved; run `wip sync` or unlink it")
            meta.update(phase=target, reason=reason, parked_from=current if target == "parked" else None)
        else:
            if current == "done" and not reason:
                raise WipError(f"reopening {args.slug} from done needs --reason")
            if target in DOC_PHASES and not doc:
                raise WipError(f"{target} needs --doc <existing file>")
            meta.update(phase=target, reason=None, parked_from=None)
        if doc:
            if not os.path.isfile(doc):
                raise WipError(f"{doc} is not an existing file")
            if not any(link["kind"] == "doc" and link["ref"] == doc for link in meta["links"]):
                meta["links"].append({"kind": "doc", "ref": doc})
        meta.update(since=today(), phase_source="manual")

    meta = mutate(args.slug, change)
    print(f"{args.slug}: {meta['phase']}")


def cmd_sync(args):
    targets = [(args.slug, *load(slug_path(args.slug))[1:])] if args.slug else load_all()
    urls = sorted({link["ref"] for _, meta, _ in targets for link in meta["links"] if link["kind"] == "pr"})

    def fetch(url):
        try:
            r = subprocess.run(
                [WIP_GH, "pr", "view", url, "--json", "state,isDraft"],
                capture_output=True,
                text=True,
                timeout=GH_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            return None, f"gh timed out after {GH_TIMEOUT}s"
        except OSError as e:
            return None, f"cannot run {WIP_GH}: {e.strerror}"
        if r.returncode != 0:
            return None, (r.stderr.strip().splitlines() or [f"gh exited {r.returncode}"])[-1]
        try:
            data = json.loads(r.stdout)
            state = {"MERGED": "merged", "CLOSED": "closed"}.get(data["state"])
            if data["state"] == "OPEN":
                state = "draft" if data.get("isDraft") else "open"
        except (ValueError, KeyError, TypeError):
            return None, "unexpected gh output"
        return (state, None) if state else (None, f"unexpected PR state {data['state']!r}")

    with concurrent.futures.ThreadPoolExecutor(WORKERS) as ex:
        results = dict(zip(urls, ex.map(fetch, urls)))
    observed = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for slug, meta, _ in targets:
        if not any(link["kind"] == "pr" for link in meta["links"]):
            continue
        before = meta["phase"]

        def change(meta):
            prs = [link for link in meta["links"] if link["kind"] == "pr"]
            for link in prs:
                state, error = results.get(link["ref"], (None, "not fetched"))
                if state:
                    link.update(state=state, observed=observed, error=None)
                else:
                    link["error"] = error
            phase, synced_done = meta["phase"], meta["phase"] == "done" and meta["phase_source"] == "sync"
            states = {link["state"] for link in prs}
            target = None
            if phase == "parked" or "unknown" in states or any(link["error"] for link in prs):
                target = None
            elif "open" in states:
                target = "review"
            elif "draft" in states:
                target = "implementing" if phase == "review" or synced_done else None
            elif states == {"merged"}:
                target = "done"
            elif "closed" in states:
                target = "implementing" if phase == "review" or synced_done else None
            if target and target != phase:
                meta.update(phase=target, phase_source="sync", since=today(), reason=None, parked_from=None)

        after = mutate(slug, change)
        prs = ", ".join(
            f"{link['ref']} {link['state']}" + (f" (error: {link['error']})" if link["error"] else "")
            for link in after["links"]
            if link["kind"] == "pr"
        )
        print(f"{slug}: {before} -> {after['phase']}; {prs}")


def cmd_archive_notes(args):
    wt = os.path.realpath(os.path.expanduser(args.worktree))
    notes = os.path.join(wt, NOTES)
    if not os.path.isfile(notes):
        return
    common = (git(wt, "rev-parse", "--path-format=absolute", "--git-common-dir") or "").strip()
    repo = os.path.basename(os.path.dirname(common) if common.endswith("/.git") else common).removesuffix(".git")
    branch = (git(wt, "branch", "--show-current") or "").strip() or "detached"
    stem = "-".join([today(), repo or "unknown", branch.replace("/", "-"), hashlib.sha256(wt.encode()).hexdigest()[:8]])
    with open(notes, "rb") as f:
        data = f.read()
    try:
        os.makedirs(WIP_ARCHIVE_DIR, exist_ok=True)
        n = 1
        while True:
            dest = os.path.join(WIP_ARCHIVE_DIR, stem + (f"-{n}" if n > 1 else "") + ".md")
            try:
                with open(dest, "xb") as f:
                    f.write(data)
                break
            except FileExistsError:
                n += 1
        with open(dest, "rb") as f:
            if f.read() != data:
                raise WipError(f"archived copy {dest} does not match {notes}")
    except OSError as e:
        raise WipError(f"could not archive {notes}: {e.strerror or e}") from None
    print(dest)


def cmd_import_pins(args):
    db = open_db()
    if db is None:
        raise WipError(f"no Anvil DB at {ANVIL_DB}")
    rows = db.execute(
        f"select id, title, pin_note, working_dir from sessions where pinned = 1 and {ROOT_SESSION_SQL} order by created_at, id"
    ).fetchall()
    db.close()
    initiatives = load_all()
    linked = {link["ref"]: slug for slug, meta, _ in initiatives for link in meta["links"] if link["kind"] == "session"}
    taken = {slug for slug, _, _ in initiatives}
    proposals = {}
    for sid, title, note, wd in rows:
        if sid in linked:
            continue
        base = re.sub(r"[^a-z0-9]+", "-", (title or "").encode("ascii", "ignore").decode().lower()).strip("-")
        base = base[:46].strip("-")
        base = base if len(base) >= 2 else FALLBACK_SLUG
        slug, n = base, 2
        while slug in taken:
            slug, n = f"{base}-{n}", n + 1
        taken.add(slug)
        proposals[sid] = (slug, flatten(title), flatten(note), wd)

    if not args.apply:
        for sid, (slug, title, note, _) in proposals.items():
            print(f"{slug}  {title}\n    id: {sid}\n    note: {note or '-'}")
        return
    for sid in args.apply:
        if sid not in proposals and sid not in linked:
            raise WipError(f"{sid} is not a pinned root session in {ANVIL_DB}")
    with locked():
        for sid in dict.fromkeys(args.apply):
            if sid in linked:
                print(f"skip {sid}: already linked to {linked[sid]}")
                continue
            slug, title, note, wd = proposals[sid]
            path = slug_path(slug)
            if os.path.exists(path):
                raise WipError(f"{path} already exists")
            meta = {
                "v": 1,
                "title": title or slug,
                "phase": "parked",
                "phase_source": "manual",
                "since": today(),
                "reason": note or DEFAULT_PIN_REASON,
                "parked_from": "idea",
                "links": [{"kind": "session", "ref": sid, "cwd": os.path.realpath(wd) if wd else None}],
            }
            check(meta, path)
            write_atomic(path, render(meta, TEMPLATE_BODY))
            print(f"{slug}: created from {sid}")


def cmd_board(args):
    start = time.monotonic()
    only = getattr(args, "only", None)
    initiatives = [(only, *load(slug_path(only))[1:])] if only else load_all()
    now = datetime.date.today()
    linked = {link["ref"] for _, meta, _ in initiatives for link in meta["links"] if link["kind"] == "worktree"}

    candidates = set()
    stack = [] if only or not os.path.isdir(WIP_WORKTREES_ROOT) else [WIP_WORKTREES_ROOT]
    while stack:
        d = stack.pop()
        if os.path.lexists(os.path.join(d, ".git")):
            candidates.add(os.path.realpath(d))
            continue
        try:
            with os.scandir(d) as entries:
                for e in entries:
                    if e.is_dir(follow_symlinks=False) and not e.name.startswith(".") and e.name not in SKIP_DIRS:
                        stack.append(e.path)
        except OSError:
            continue

    def git_state(path):
        out = git(path, "status", "--porcelain=v2", "--branch")
        if out is None:
            return {"text": "git error", "date": ""}
        branch, upstream, ahead, behind, dirty = "?", False, 0, 0, 0
        for line in out.splitlines():
            if line.startswith("# branch.head "):
                branch = line[len("# branch.head "):]
            elif line.startswith("# branch.upstream "):
                upstream = True
            elif line.startswith("# branch.ab "):
                a, b = line[len("# branch.ab "):].split()
                ahead, behind = int(a), -int(b)
            elif line and not line.startswith("#"):
                dirty += 1
        date = (git(path, "log", "-1", "--format=%cs") or "").strip()
        parts = [branch] + ([f"dirty {dirty}"] if dirty else [])
        if not upstream:
            parts.append("no upstream")
        elif ahead or behind:
            parts.append(f"↑{ahead} ↓{behind}")
        parts.append(date or "no commits")
        return {"text": " · ".join(parts), "date": date}

    paths = sorted(p for p in linked | candidates if os.path.isdir(p))
    ex = concurrent.futures.ThreadPoolExecutor(WORKERS)
    futures = {ex.submit(git_state, p): p for p in paths}
    done, _ = concurrent.futures.wait(futures, timeout=max(0, BOARD_DEADLINE - (time.monotonic() - start)))
    ex.shutdown(wait=False, cancel_futures=True)
    states = {p: f.result() for f, p in futures.items() if f in done and f.exception() is None}
    timeouts = len(paths) - len(states)

    db = open_db()
    session_ids = [link["ref"] for _, meta, _ in initiatives for link in meta["links"] if link["kind"] == "session"]
    recency, pins = {}, []
    if db:
        if session_ids:
            marks = ",".join("?" * len(session_ids))
            recency = dict(db.execute(f"select id, {UPDATED_SECONDS_SQL} from sessions where id in ({marks})", session_ids))
        if not only:
            pins = db.execute(
                f"select id, title, pin_note from sessions where pinned = 1 and {ROOT_SESSION_SQL}"
                f" order by {UPDATED_SECONDS_SQL} desc"
            ).fetchall()
        db.close()

    lines, flags = [], []
    for phase in PHASES:
        group = []
        for slug, meta, body in initiatives:
            days = (now - datetime.date.fromisoformat(meta["since"])).days
            if meta["phase"] == phase and (args.all or phase != "done" or days <= DONE_HIDDEN_AFTER_DAYS):
                group.append((slug, meta, body, days))
        if not group:
            continue
        if not only:
            lines.append(f"\n[{phase}]")
        for slug, meta, body, days in group:
            head = f"{slug} · {meta['title']} · {phase} for {days}d"
            if phase == "parked" or (phase == "done" and meta["phase_source"] == "manual"):
                head += f" · {meta['reason']}"
            lines.append(head)
            section = NEXT_SECTION.search(body.decode("utf-8", "replace"))
            nxt = next((ln.strip() for ln in section.group(1).splitlines() if ln.strip()), None) if section else None
            if nxt:
                lines.append(f"  next: {nxt}")
            dates = []
            for link in meta["links"]:
                ref = link["ref"]
                if link["kind"] == "worktree":
                    shown = "~" + ref[len(HOME):] if ref.startswith(HOME + os.sep) else ref
                    if not os.path.isdir(ref):
                        lines.append(f"  worktree {shown}: MISSING")
                        flags.append(f"{slug}: worktree missing: {ref}")
                    elif ref in states:
                        lines.append(f"  worktree {shown}: {states[ref]['text']}")
                        dates.append(states[ref]["date"])
                    else:
                        lines.append(f"  worktree {shown}: ?")
                elif link["kind"] == "pr":
                    if link["error"]:
                        lines.append(f"  pr {ref}: ? {link['state']} (error: {link['error']})")
                        flags.append(f"{slug}: PR check failed: {ref}: {link['error']}")
                    elif link["state"] == "unknown":
                        lines.append(f"  pr {ref}: ? unknown")
                        flags.append(f"{slug}: PR state unknown, run `wip sync`: {ref}")
                    else:
                        observed = datetime.datetime.fromisoformat(link["observed"]).timestamp() if link["observed"] else 0
                        lines.append(f"  pr {ref}: {link['state']} · {ago(observed)}")
            prs = [link for link in meta["links"] if link["kind"] == "pr"]
            pr_states = {link["state"] for link in prs}
            settled = not any(link["error"] for link in prs) and not pr_states & LIVE_PR_STATES
            if settled and "closed" in pr_states:
                for link in prs:
                    if link["state"] == "closed":
                        flags.append(f"{slug}: closed PR: unlink it if it was superseded: {link['ref']}")
            sessions = [link["ref"] for link in meta["links"] if link["kind"] == "session"]
            if sessions:
                latest = max(reversed(sessions), key=lambda sid: recency.get(sid, 0))
                active = f" (active {ago(recency[latest])})" if latest in recency else ""
                lines.append(f"  resume: anvil --session {latest} --there{active}")
            if phase == "parked" and days > PARKED_FLAG_DAYS:
                flags.append(f"{slug}: parked for {days}d")
            cutoff = (now - datetime.timedelta(days=STALE_COMMIT_DAYS)).isoformat()
            known = [d for d in dates if d]
            if phase == "implementing" and known and max(known) < cutoff:
                flags.append(f"{slug}: implementing with no commit in {STALE_COMMIT_DAYS} days")

    if only:
        print("\n".join(lines + [f"flag: {f}" for f in flags]))
        return
    print("Initiatives" + ("" if lines else "\n  none"))
    print("\n".join(lines))
    if flags:
        print("\nFlags")
        print("\n".join(f"  {f}" for f in flags))
    unclaimed = sorted(
        (p for p in candidates if p not in linked),
        key=lambda p: (states[p]["date"] if p in states else "", p),
        reverse=True,
    )
    if unclaimed:
        print(f"\nUnclaimed worktrees ({len(unclaimed)})")
        for p in unclaimed:
            print(f"  {os.path.relpath(p, WIP_WORKTREES_ROOT)}  {states[p]['text'] if p in states else '?'}")
    unlinked_pins = [r for r in pins if r[0] not in session_ids]
    if unlinked_pins:
        print(f"\nUnclaimed pinned sessions ({len(unlinked_pins)})")
        for sid, title, note in unlinked_pins:
            print(f"  {flatten(title)} · {flatten(note) or '-'} · {sid}")
    observations = [link["observed"] for _, meta, _ in initiatives for link in meta["links"] if link["kind"] == "pr"]
    if not observations:
        oldest = "none"
    elif None in observations:
        oldest = "never (some PRs not synced yet)"
    else:
        first = min(observations)
        oldest = f"{first} ({ago(datetime.datetime.fromisoformat(first).timestamp())})"
    print(f"\noldest PR observation: {oldest} · git timeouts: {timeouts}")


def main():
    parser = Parser(prog="wip", description="Track initiatives across worktrees, PRs and sessions.")
    parser.set_defaults(func=cmd_board, all=False)
    sub = parser.add_subparsers(dest="cmd")

    p = sub.add_parser("board", help="show the board")
    p.add_argument("--all", action="store_true", help="include initiatives done more than 14 days ago")
    p.set_defaults(func=cmd_board)

    p = sub.add_parser("new", help="create an initiative")
    p.add_argument("slug")
    p.add_argument("--title", required=True)
    p.set_defaults(func=cmd_new)

    p = sub.add_parser("show", help="show one initiative")
    p.add_argument("slug")
    p.set_defaults(func=cmd_show)

    p = sub.add_parser("which", help="find initiatives linking a path or session")
    p.add_argument("path", nargs="?")
    p.add_argument("--session")
    p.set_defaults(func=cmd_which)

    p = sub.add_parser("link", help="link a worktree, PR, topic, doc or session")
    p.add_argument("slug")
    p.add_argument("kind", choices=sorted(LINK_KEYS))
    p.add_argument("ref")
    p.add_argument("--cwd", help="session cwd when the Anvil DB is absent")
    p.set_defaults(func=cmd_link)

    p = sub.add_parser("unlink", help="remove a link")
    p.add_argument("slug")
    p.add_argument("kind", choices=sorted(LINK_KEYS))
    p.add_argument("ref")
    p.set_defaults(func=cmd_unlink)

    p = sub.add_parser("phase", help="change phase")
    p.add_argument("slug")
    p.add_argument("target", choices=PHASES + ["unpark"])
    p.add_argument("--doc")
    p.add_argument("--reason")
    p.set_defaults(func=cmd_phase)

    p = sub.add_parser("sync", help="observe PR state with gh and derive phases")
    p.add_argument("slug", nargs="?")
    p.set_defaults(func=cmd_sync)

    p = sub.add_parser("archive-notes", help=f"archive a worktree's {NOTES}")
    p.add_argument("worktree")
    p.set_defaults(func=cmd_archive_notes)

    p = sub.add_parser("import-pins", help="turn pinned Anvil sessions into parked initiatives")
    p.add_argument("--apply", nargs="+", metavar="SESSION_ID")
    p.set_defaults(func=cmd_import_pins)

    try:
        args = parser.parse_args()
        args.func(args)
    except KeyboardInterrupt:
        sys.exit(130)
    except BrokenPipeError:
        sys.exit(0)
    except Exception as e:
        print(f"wip: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
