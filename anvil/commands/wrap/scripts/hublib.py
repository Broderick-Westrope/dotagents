"""Shared helpers for /wrap, the nightly sweep and the weekly review.

The hub is the folder holding wrap.md (the procedure every wrap follows), state/
and reports/. Set WRAP_HUB to move it and WRAP_WRITABLE (colon-separated) to
change where unattended runs may edit.
"""

import json
import os
import sqlite3
import subprocess
import time
from pathlib import Path

HOME = Path.home()
SCRIPTS = Path(__file__).resolve().parent
HUB = Path(os.path.expanduser(os.environ.get("WRAP_HUB", "~/dev/topics/hub")))
WRITABLE = os.environ.get("WRAP_WRITABLE", "{0}/dev/topics:{0}/vaults/personal".format(HOME))
STATE = HUB / "state"
LOGS = STATE / "logs"
RUNS_DIR = STATE / "runs"
LEDGER = STATE / "ledger.tsv"
ANVIL_DB = HOME / ".local" / "share" / "anvil" / "anvil.db"
WRAP_PROCEDURE = HUB / "wrap.md"
REPORT_PREFIXES = ("Recorded ", "Nothing to record", "Weekly review:")

PATH_ENV = ":".join([
    str(HOME / ".local" / "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
])


def ensure_dirs():
    for directory in (STATE, LOGS, RUNS_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def connect():
    conn = sqlite3.connect("file:{}?mode=ro".format(ANVIL_DB), uri=True, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def session_row(conn, session_id):
    return conn.execute(
        "select id, title, working_dir, message_count, created_at, updated_at"
        " from sessions where id = ?",
        (session_id,),
    ).fetchone()


def parts_of(raw):
    try:
        parts = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return parts if isinstance(parts, list) else []


def finish_reason(parts):
    for part in parts:
        if isinstance(part, dict) and part.get("type") == "finish":
            return (part.get("data") or {}).get("reason")
    return None


def text_of(parts):
    chunks = []
    for part in parts:
        if isinstance(part, dict) and part.get("type") == "text":
            text = (part.get("data") or {}).get("text") or ""
            if text.strip():
                chunks.append(text)
    return "\n".join(chunks)


def turn_finished_since(conn, session_id, since):
    row = conn.execute(
        "select role, parts, created_at from messages where session_id = ?"
        " order by created_at desc, rowid desc limit 1",
        (session_id,),
    ).fetchone()
    if row is None or row["role"] != "assistant" or row["created_at"] < since:
        return False
    reason = finish_reason(parts_of(row["parts"]))
    return reason is not None and reason != "tool_use"


def read_ledger():
    latest = {}
    if not LEDGER.exists():
        return latest
    for line in LEDGER.read_text().splitlines():
        fields = line.split("\t")
        if len(fields) < 4 or fields[0] == "session_id":
            continue
        session_id, wrapped_at, mode, status = fields[:4]
        try:
            wrapped_at = int(wrapped_at)
        except ValueError:
            continue
        previous = latest.get(session_id)
        if previous is None or wrapped_at >= previous["wrapped_at"]:
            latest[session_id] = {"wrapped_at": wrapped_at, "mode": mode, "status": status}
    return latest


def append_ledger(session_id, mode, status, summary):
    ensure_dirs()
    is_new = not LEDGER.exists()
    clean_summary = " ".join(summary.split())[:300]
    with LEDGER.open("a") as handle:
        if is_new:
            handle.write("session_id\twrapped_at\tmode\tstatus\tsummary\n")
        handle.write("{}\t{}\t{}\t{}\t{}\n".format(session_id, int(time.time()), mode, status, clean_summary))


def notify(title, body):
    herdr_socket = HOME / ".config" / "herdr" / "herdr.sock"
    if herdr_socket.exists():
        subprocess.run(
            ["herdr", "notification", "show", title, "--body", body],
            env=dict(os.environ, PATH=PATH_ENV),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
            check=False,
        )
    script = "display notification {} with title {}".format(json.dumps(body), json.dumps(title))
    subprocess.run(["osascript", "-e", script], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


def repo_heads():
    roots = [HUB.parent, HOME / "vaults" / "personal"] + sorted(path for path in HUB.parent.iterdir() if (path / ".git").exists())
    heads = {}
    for root in roots:
        result = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True, check=False)
        heads[str(root)] = result.stdout.strip()
    return heads


def wrap_status(code, report, heads_before):
    """ok only when the wrap committed something or found nothing to record, so the sweep retries the rest."""
    if code != 0:
        return "failed:{}".format(code)
    if report.startswith("Nothing to record") or repo_heads() != heads_before:
        return "ok"
    return "partial"


def dismiss_recovery(session_id):
    subprocess.run(
        ["anvil", "session", "recover", "--clear", session_id],
        env=dict(os.environ, PATH=PATH_ENV),
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        timeout=30, check=False,
    )


def run_anvil(prompt, cwd, log_path, session_id=None, guard="wrap", timeout=1800):
    command = ["anvil", "run", "--quiet", "--cwd", str(cwd)]
    if session_id:
        command += ["--session", session_id]
    command.append(prompt)
    env = dict(os.environ, PATH=PATH_ENV, HUB_WRAP=guard, WRAP_HUB=str(HUB), WRAP_WRITABLE=WRITABLE)
    with open(log_path, "a") as log:
        log.write("\n=== {} anvil run (cwd {}, session {})\n".format(time.strftime("%Y-%m-%d %H:%M:%S"), cwd, session_id or "new"))
        log.flush()
        try:
            completed = subprocess.run(
                command, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                stderr=log, timeout=timeout, check=False, text=True,
            )
        except subprocess.TimeoutExpired:
            log.write("timed out after {}s\n".format(timeout))
            return 124, "timed out after {}s".format(timeout)
        log.write(completed.stdout)
    lines = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
    return completed.returncode, report_line(lines)


def report_line(lines):
    for index in range(len(lines) - 1, -1, -1):
        start = max(lines[index].rfind(prefix) for prefix in REPORT_PREFIXES)
        if start >= 0:
            return " | ".join([lines[index][start:]] + lines[index + 1:index + 2])
    return lines[-1] if lines else ""


def daemonize(log_path):
    if os.fork() > 0:
        return False
    os.setsid()
    if os.fork() > 0:
        os._exit(0)
    devnull = os.open(os.devnull, os.O_RDONLY)
    log = os.open(str(log_path), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
    os.dup2(devnull, 0)
    os.dup2(log, 1)
    os.dup2(log, 2)
    return True
