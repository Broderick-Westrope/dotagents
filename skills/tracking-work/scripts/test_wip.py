import datetime
import json
import os
import shutil
import shlex
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wip.py")
REAL_GIT = shutil.which("git")
TODAY = datetime.date.today().isoformat()
OLD = (datetime.date.today() - datetime.timedelta(days=40)).isoformat()
FAKE_GH = """#!/bin/sh
if [ "$1" = auth ]; then
  case "$2" in
    status) [ -n "${FAKE_GH_ACCOUNTS:-}" ] || exit 1; printf '%s\\n' "$FAKE_GH_ACCOUNTS"; exit 0;;
    token) printf 'tok-%s\\n' "$4"; exit 0;;
  esac
fi
url="$3"
n="${url##*/}"
eval "need=\\${FAKE_GH_TOKEN_$n:-}"
if [ -n "$need" ] && [ "${GH_TOKEN:-}" != "$need" ]; then echo "Could not resolve to a Repository" >&2; exit 1; fi
eval "out=\\${FAKE_GH_$n:-}"
if [ -z "$out" ]; then echo "no fixture for $url" >&2; exit 1; fi
printf '%s\\n' "$out"
"""
GH = {
    "open": '{"state":"OPEN","isDraft":false}',
    "draft": '{"state":"OPEN","isDraft":true}',
    "merged": '{"state":"MERGED","isDraft":false}',
    "closed": '{"state":"CLOSED","isDraft":false}',
}
SESSION_ROWS = ["id", "parent_session_id", "title", "updated_at", "created_at", "working_dir", "pinned", "pin_note"]


def pr(n):
    return f"https://github.com/acme/app/pull/{n}"


class WipTest(unittest.TestCase):
    def setUp(self):
        self.tmp = os.path.realpath(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.dirs = {}
        for name in ("wip", "root", "work", "bin"):
            self.dirs[name] = os.path.join(self.tmp, name)
            os.mkdir(self.dirs[name])
        self.db = os.path.join(self.tmp, "anvil.db")
        gh = os.path.join(self.dirs["bin"], "gh")
        with open(gh, "w") as f:
            f.write(FAKE_GH)
        os.chmod(gh, 0o755)
        empty_config = os.path.join(self.tmp, "gitconfig")
        open(empty_config, "w").close()
        self.env = {
            k: v for k, v in os.environ.items() if not k.startswith(("WIP_", "FAKE_GH_", "GIT_", "ANVIL_"))
        }
        self.env.update(
            WIP_DIR=self.dirs["wip"],
            WIP_WORKTREES_ROOT=self.dirs["root"],
            ANVIL_DB=self.db,
            WIP_GH=gh,
            GIT_CONFIG_GLOBAL=empty_config,
            GIT_CONFIG_NOSYSTEM="1",
            GIT_AUTHOR_NAME="t",
            GIT_AUTHOR_EMAIL="t@example.com",
            GIT_COMMITTER_NAME="t",
            GIT_COMMITTER_EMAIL="t@example.com",
        )

    def wip(self, *args, ok=True, env=None, cwd=None):
        r = subprocess.run(
            [sys.executable, SCRIPT, *args],
            capture_output=True,
            text=True,
            env={**self.env, **(env or {})},
            cwd=cwd or self.tmp,
            timeout=60,
        )
        if ok is not None:
            self.assertEqual(r.returncode, 0 if ok else 1, f"wip {args}\nstdout: {r.stdout}\nstderr: {r.stderr}")
        if r.returncode:
            self.assertNotIn("Traceback", r.stderr)
            self.assertEqual(len(r.stderr.strip().splitlines()), 1, r.stderr)
        return r

    def git(self, *args, cwd=None):
        return subprocess.run(
            [REAL_GIT, *args], cwd=cwd, env=self.env, check=True, capture_output=True, text=True
        ).stdout

    def log(self):
        return self.git("log", "--format=%s", cwd=self.dirs["wip"]).splitlines()

    def repo(self, path):
        os.makedirs(path)
        self.git("init", "-q", "-b", "main", path)
        self.git("commit", "-q", "--allow-empty", "-m", "init", cwd=path)
        return path

    def worktree(self, repo, path, branch):
        self.git("worktree", "add", "-q", "-b", branch, path, cwd=repo)
        return path

    def sessions(self, *rows):
        db = sqlite3.connect(self.db)
        db.execute(
            "create table if not exists sessions (id text primary key, parent_session_id text, title text not null,"
            " message_count integer not null default 0, updated_at integer not null, created_at integer not null,"
            " working_dir text not null default '', pinned integer not null default 0, pin_note text not null default '')"
        )
        for row in rows:
            values = {"parent_session_id": None, "title": "untitled", "updated_at": 1, "created_at": 1, "working_dir": "", "pinned": 0, "pin_note": ""}
            values.update(row)
            db.execute(
                f"insert into sessions ({','.join(SESSION_ROWS)}) values ({','.join('?' * len(SESSION_ROWS))})",
                [values[k] for k in SESSION_ROWS],
            )
        db.commit()
        db.close()

    def path(self, slug):
        return os.path.join(self.dirs["wip"], slug + ".md")

    def read(self, slug):
        with open(self.path(slug), "rb") as f:
            raw = f.read()
        end = raw.index(b"\n---\n", 3)
        return json.loads(raw[4:end]), raw[end + 5:]

    def write(self, slug, body=b"\n## Next\n", **meta):
        data = {
            "v": 1,
            "title": slug.title(),
            "phase": "idea",
            "phase_source": "manual",
            "since": TODAY,
            "reason": None,
            "parked_from": None,
            "links": [],
        }
        data.update(meta)
        with open(self.path(slug), "wb") as f:
            f.write(b"---\n" + json.dumps(data, indent=2).encode() + b"\n---\n" + body)

    def pr_link(self, n, state="unknown", observed=None):
        return {"kind": "pr", "ref": pr(n), "state": state, "observed": observed, "error": None}

    def doc(self, name="doc.md"):
        p = os.path.join(self.dirs["work"], name)
        open(p, "w").close()
        return p


class TestFormat(WipTest):
    def test_new_show_round_trip(self):
        self.wip("new", "alpha", "--title", "Alpha work")
        out = self.wip("show", "alpha").stdout
        meta, body = self.read("alpha")
        self.assertEqual(meta["phase"], "idea")
        self.assertEqual(meta["phase_source"], "manual")
        self.assertEqual(meta["since"], TODAY)
        self.assertIn("alpha · Alpha work · idea for 0d", out)
        self.assertIn(body.decode(), out)
        with open(os.path.join(os.path.dirname(os.path.dirname(SCRIPT)), "references", "body-template.md"), "rb") as f:
            self.assertEqual(body, b"\n" + f.read())
        self.assertNotIn("next:", out)

    def test_new_rejects(self):
        self.wip("new", "alpha", "--title", "Alpha")
        cases = {
            "existing slug": ["new", "alpha", "--title", "Again"],
            "uppercase slug": ["new", "Alpha", "--title", "x"],
            "single char slug": ["new", "a", "--title", "x"],
            "leading dash": ["new", "-ab", "--title", "x"],
            "too long": ["new", "a" * 50, "--title", "x"],
        }
        for name, args in cases.items():
            with self.subTest(name):
                self.wip(*args, ok=False)

    def test_body_survives_byte_for_byte(self):
        self.wip("new", "alpha", "--title", "Alpha")
        meta, _ = self.read("alpha")
        body = "\r\n## Why\r\nCafé ☕ 日本語\r\n\r\n## Next\r\nship it\r\n".encode()
        with open(self.path("alpha"), "rb") as f:
            raw = f.read()
        with open(self.path("alpha"), "wb") as f:
            f.write(raw[: raw.index(b"\n---\n", 3) + 5] + body)
        self.wip("phase", "alpha", "implementing")
        self.wip("link", "alpha", "doc", self.doc())
        self.wip("link", "alpha", "pr", pr(1))
        meta, after = self.read("alpha")
        self.assertEqual(after, body)
        self.assertEqual(meta["phase"], "implementing")
        self.assertIn("next: ship it", self.wip("show", "alpha").stdout)

    def test_invalid_files_exit_1_unchanged(self):
        cases = {
            "unknown v": lambda m: {**m, "v": 2},
            "unknown key": lambda m: {**m, "colour": "red"},
            "unknown link key": lambda m: {**m, "links": [{"kind": "doc", "ref": "/x", "extra": 1}]},
            "duplicate link": lambda m: {**m, "links": [{"kind": "doc", "ref": "/x"}, {"kind": "doc", "ref": "/x"}]},
            "parked without reason": lambda m: {**m, "phase": "parked"},
            "invalid json": None,
        }
        for name, edit in cases.items():
            with self.subTest(name):
                self.write("broken")
                meta, body = self.read("broken")
                if edit:
                    raw = b"---\n" + json.dumps(edit(meta)).encode() + b"\n---\n" + body
                else:
                    raw = b"---\n{\"v\": 1,\n---\n" + body
                with open(self.path("broken"), "wb") as f:
                    f.write(raw)
                for args in (["link", "broken", "doc", self.doc()], ["phase", "broken", "implementing"], ["show", "broken"]):
                    r = self.wip(*args, ok=False)
                    self.assertIn(self.path("broken"), r.stderr)
                with open(self.path("broken"), "rb") as f:
                    self.assertEqual(f.read(), raw)


OK, DOC, REASON, DOC_REASON, REJECT, UNPARK, DONE = "ok", "doc", "reason", "doc+reason", "reject", "unpark", "done"
ACTIVE_ROW = {
    "idea": OK, "implementing": OK, "spec": DOC, "planning": DOC,
    "review": REJECT, "done": DONE, "parked": REASON, "unpark": REJECT,
}
MATRIX = {
    "idea": ACTIVE_ROW,
    "spec": ACTIVE_ROW,
    "planning": ACTIVE_ROW,
    "implementing": ACTIVE_ROW,
    "review": ACTIVE_ROW,
    "done": {
        "idea": REASON, "implementing": REASON, "spec": DOC_REASON, "planning": DOC_REASON,
        "review": REJECT, "done": REJECT, "parked": REJECT, "unpark": REJECT,
    },
    "parked": {
        "idea": OK, "implementing": OK, "spec": DOC, "planning": DOC,
        "review": REJECT, "done": REJECT, "parked": REJECT, "unpark": UNPARK,
    },
}
FROM_STATE = {
    "idea": {},
    "spec": {},
    "planning": {},
    "implementing": {},
    "review": {"phase_source": "sync"},
    "done": {"phase_source": "manual", "reason": "shipped by hand"},
    "parked": {"reason": "waiting on Sam", "parked_from": "planning"},
}


class TestTransitions(WipTest):
    def test_matrix(self):
        doc = self.doc()
        for source, row in MATRIX.items():
            for target, rule in row.items():
                with self.subTest(f"{source} -> {target}"):
                    self.write("tr", phase=source, since=OLD, **FROM_STATE[source])
                    needs = {
                        OK: [], DOC: ["--doc"], REASON: ["--reason"], DONE: ["--reason"],
                        DOC_REASON: ["--doc", "--reason"], UNPARK: [], REJECT: None,
                    }[rule]
                    flags = {"--doc": doc, "--reason": "because\nof things"}
                    if needs is None:
                        before = self.read("tr")
                        self.wip("phase", "tr", target, "--doc", doc, "--reason", "x", ok=False)
                        self.assertEqual(self.read("tr"), before)
                        continue
                    for missing in needs:
                        args = [a for flag in needs if flag != missing for a in (flag, flags[flag])]
                        self.wip("phase", "tr", target, *args, ok=False)
                        self.assertEqual(self.read("tr")[0]["phase"], source)
                    self.wip("phase", "tr", target, *[a for flag in needs for a in (flag, flags[flag])])
                    meta, _ = self.read("tr")
                    expected = "planning" if rule == UNPARK else target
                    self.assertEqual(meta["phase"], expected)
                    self.assertEqual(meta["phase_source"], "manual")
                    self.assertEqual(meta["since"], TODAY)
                    if "--doc" in needs:
                        self.assertIn({"kind": "doc", "ref": doc}, meta["links"])
                    if target == "parked":
                        self.assertEqual(meta["parked_from"], source)
                        self.assertEqual(meta["reason"], "because of things")
                    elif target == "done":
                        self.assertEqual(meta["reason"], "because of things")
                    else:
                        self.assertIsNone(meta["reason"])
                        self.assertIsNone(meta["parked_from"])

    def test_done_blocked_by_live_pr(self):
        cases = {"open": False, "draft": False, "unknown": False, "merged": True, "closed": True}
        for state, allowed in cases.items():
            with self.subTest(state):
                self.write("tr", phase="implementing", links=[self.pr_link(1, state, "2026-01-01T00:00:00Z")])
                self.wip("phase", "tr", "done", "--reason", "no PR needed", ok=allowed)

    def test_spec_doc_must_exist(self):
        self.write("tr")
        self.wip("phase", "tr", "spec", "--doc", os.path.join(self.tmp, "missing.md"), ok=False)
        self.wip("phase", "tr", "spec", "--doc", self.dirs["work"], ok=False)

    def test_park_and_unpark_round_trip(self):
        self.wip("new", "tr", "--title", "T")
        self.wip("phase", "tr", "implementing")
        self.wip("phase", "tr", "parked", "--reason", "waiting on review")
        self.assertEqual(self.read("tr")[0]["parked_from"], "implementing")
        self.wip("phase", "tr", "unpark")
        meta, _ = self.read("tr")
        self.assertEqual((meta["phase"], meta["reason"], meta["parked_from"]), ("implementing", None, None))


SYNC_CASES = {
    "rule 1 unknown blocks change": ("implementing", "manual", [("open", 1), (None, 2)], "implementing"),
    "rule 2 open goes to review": ("implementing", "manual", [("open", 1)], "review"),
    "rule 2 open reopens synced done": ("done", "sync", [("open", 1)], "review"),
    "rule 3 draft from review": ("review", "sync", [("draft", 1)], "implementing"),
    "rule 3 draft from synced done": ("done", "sync", [("draft", 1)], "implementing"),
    "rule 3 draft from idea stays": ("idea", "manual", [("draft", 1)], "idea"),
    "rule 4 all merged is done": ("implementing", "manual", [("merged", 1), ("merged", 2)], "done"),
    "rule 5 closed from review": ("review", "sync", [("closed", 1)], "implementing"),
    "rule 5 closed from planning stays": ("planning", "manual", [("closed", 1)], "planning"),
    "merged and closed is not done": ("review", "sync", [("merged", 1), ("closed", 2)], "implementing"),
    "PR reopened after done": ("done", "sync", [("open", 1)], "review"),
    "manual done gets an open PR": ("done", "manual", [("open", 1)], "review"),
    "manual done with merged PR keeps its reason": ("done", "manual", [("merged", 1)], "done"),
    "parked with open PR": ("parked", "manual", [("open", 1)], "parked"),
}


class TestSync(WipTest):
    def test_rules(self):
        for name, (phase, source, prs, expected) in SYNC_CASES.items():
            with self.subTest(name):
                needs_reason = phase == "parked" or (phase == "done" and source == "manual")
                extra = {"reason": "r", "parked_from": "implementing" if phase == "parked" else None} if needs_reason else {}
                self.write("sy", phase=phase, phase_source=source, since=OLD, links=[self.pr_link(n) for _, n in prs], **extra)
                env = {f"FAKE_GH_{n}": GH[state] for state, n in prs if state}
                self.wip("sync", "sy", env=env)
                meta, _ = self.read("sy")
                self.assertEqual(meta["phase"], expected)
                if expected != phase:
                    self.assertEqual((meta["phase_source"], meta["since"]), ("sync", TODAY))
                    if expected != "parked":
                        self.assertIsNone(meta["reason"])
                else:
                    self.assertEqual((meta["phase_source"], meta["since"]), (source, OLD))
                    self.assertEqual(meta["reason"], extra.get("reason"))
                states = {link["ref"]: link["state"] for link in meta["links"]}
                for state, n in prs:
                    self.assertEqual(states[pr(n)], state or "unknown")

    def test_closed_pr_is_flagged(self):
        self.write("sy", phase="review", phase_source="sync", links=[self.pr_link(1), self.pr_link(2)])
        self.wip("sync", env={"FAKE_GH_1": GH["merged"], "FAKE_GH_2": GH["closed"]})
        out = self.wip().stdout
        self.assertIn(f"closed PR: unlink it if it was superseded: {pr(2)}", out)

    def test_gh_failure_keeps_state_and_records_error(self):
        observed = "2026-10-01T10:00:00Z"
        self.write("sy", phase="implementing", links=[self.pr_link(1, "draft", observed)])
        self.wip("sync", "sy")
        meta, _ = self.read("sy")
        link = meta["links"][0]
        self.assertEqual((link["state"], link["observed"]), ("draft", observed))
        self.assertIn("no fixture", link["error"])
        self.assertEqual(meta["phase"], "implementing")
        self.assertIn("PR check failed", self.wip().stdout)
        self.wip("sync", "sy", env={"FAKE_GH_1": GH["draft"]})
        link = self.read("sy")[0]["links"][0]
        self.assertIsNone(link["error"])
        self.assertNotEqual(link["observed"], observed)

    def test_retries_with_other_gh_accounts(self):
        accounts = json.dumps({"hosts": {"github.com": [
            {"login": "me", "active": False, "state": "success"},
            {"login": "work", "active": True, "state": "success"},
            {"login": "stale", "active": False, "state": "error"},
        ]}})
        env = {"FAKE_GH_1": GH["open"], "FAKE_GH_2": GH["draft"], "FAKE_GH_TOKEN_1": "tok-work"}
        cases = {
            "one account": ({}, {pr(1): ("unknown", "Could not resolve to a Repository"), pr(2): ("draft", None)}),
            "work account too": ({"FAKE_GH_ACCOUNTS": accounts}, {pr(1): ("open", None), pr(2): ("draft", None)}),
        }
        for name, (extra, expected) in cases.items():
            with self.subTest(name):
                self.write("sy", phase="implementing", links=[self.pr_link(1), self.pr_link(2)])
                r = self.wip("sync", "sy", env={**env, **extra})
                links = {link["ref"]: (link["state"], link["error"]) for link in self.read("sy")[0]["links"]}
                self.assertEqual(links, expected)
                self.assertNotIn("tok-work", r.stdout + r.stderr)
                with open(self.path("sy")) as f:
                    self.assertNotIn("tok-work", f.read())

    def test_sync_all_commits_each_initiative_by_name(self):
        for slug in ("one", "two"):
            self.write(slug, phase="implementing", links=[self.pr_link(1)])
        self.wip("sync", env={"FAKE_GH_1": GH["open"]})
        self.assertEqual(self.log()[:2], ["wip sync two", "wip sync one"])

    def test_sync_all_skips_initiatives_without_prs(self):
        self.write("plain")
        before = self.read("plain")
        self.write("withpr", phase="implementing", links=[self.pr_link(1)])
        self.wip("sync", env={"FAKE_GH_1": GH["open"]})
        self.assertEqual(self.read("plain"), before)
        self.assertEqual(self.read("withpr")[0]["phase"], "review")


class TestLink(WipTest):
    def test_validation(self):
        repo = self.repo(os.path.join(self.dirs["work"], "repo"))
        spaced = self.worktree(repo, os.path.join(self.dirs["root"], "my repo", "feature x"), "feature-x")
        self.sessions(
            {"id": "root-1", "working_dir": self.dirs["work"]},
            {"id": "child-1", "parent_session_id": "root-1"},
            {"id": "root-2", "parent_session_id": ""},
        )
        cases = {
            "worktree with a space": (["worktree", spaced], True),
            "plain repo": (["worktree", repo], False),
            "not a git dir": (["worktree", self.dirs["work"]], False),
            "missing worktree": (["worktree", os.path.join(self.tmp, "nope")], False),
            "existing topic": (["topic", self.dirs["work"]], True),
            "missing topic": (["topic", os.path.join(self.tmp, "nope")], False),
            "existing doc": (["doc", self.doc()], True),
            "missing doc": (["doc", os.path.join(self.tmp, "nope.md")], False),
            "pr url": (["pr", pr(7)], True),
            "pr url with suffix": (["pr", pr(7) + "/files"], False),
            "non github pr": (["pr", "https://gitlab.com/a/b/pull/1"], False),
            "root session": (["session", "root-1"], True),
            "root session with empty parent": (["session", "root-2"], True),
            "child session": (["session", "child-1"], False),
            "session absent from db": (["session", "nope"], False),
            "unknown kind": (["ticket", "x"], False),
        }
        self.wip("new", "lk", "--title", "L")
        for name, (args, ok) in cases.items():
            with self.subTest(name):
                self.wip("link", "lk", *args, ok=ok)
        links = self.read("lk")[0]["links"]
        self.assertIn({"kind": "worktree", "ref": spaced}, links)
        self.assertIn({"kind": "pr", "ref": pr(7), "state": "unknown", "observed": None, "error": None}, links)
        self.assertIn({"kind": "session", "ref": "root-1", "cwd": self.dirs["work"]}, links)

    def test_session_without_db_uses_cwd(self):
        self.wip("new", "lk", "--title", "L")
        self.wip("link", "lk", "session", "any-id", "--cwd", self.dirs["work"])
        self.assertIn({"kind": "session", "ref": "any-id", "cwd": self.dirs["work"]}, self.read("lk")[0]["links"])

    def test_relinking_is_a_no_op(self):
        self.wip("new", "lk", "--title", "L")
        doc = self.doc()
        self.wip("link", "lk", "doc", doc)
        with open(self.path("lk"), "rb") as f:
            before = f.read()
        self.wip("link", "lk", "doc", os.path.join(self.dirs["work"], ".", "doc.md"))
        with open(self.path("lk"), "rb") as f:
            self.assertEqual(f.read(), before)

    def test_unlink(self):
        self.wip("new", "lk", "--title", "L")
        self.wip("link", "lk", "pr", pr(1))
        self.wip("unlink", "lk", "pr", pr(2), ok=False)
        self.wip("unlink", "lk", "pr", pr(1))
        self.assertEqual(self.read("lk")[0]["links"], [])
        self.wip("unlink", "lk", "pr", pr(1), ok=False)

    def test_unknown_slug(self):
        self.wip("link", "ghost", "pr", pr(1), ok=False)
        self.wip("link", "../etc", "pr", pr(1), ok=False)


class TestWhich(WipTest):
    def setUp(self):
        super().setUp()
        repo = self.repo(os.path.join(self.dirs["work"], "repo"))
        self.wt = self.worktree(repo, os.path.join(self.dirs["root"], "x", "foo"), "foo")
        self.sibling = self.worktree(repo, os.path.join(self.dirs["root"], "x", "foobar"), "foobar")
        os.makedirs(os.path.join(self.wt, "src", "deep"))
        self.docfile = os.path.join(self.wt, "plans", "design.md")
        os.makedirs(os.path.dirname(self.docfile))
        open(self.docfile, "w").close()
        for slug in ("one", "two", "docs"):
            self.wip("new", slug, "--title", slug)
        self.wip("link", "one", "worktree", self.wt)
        self.wip("link", "two", "worktree", self.wt)
        self.wip("link", "docs", "doc", self.docfile)
        self.wip("link", "docs", "session", "sess-1", "--cwd", self.tmp)
        self.topic = os.path.join(self.dirs["work"], "topic")
        self.topic_doc = os.path.join(self.topic, "AGENTS.md")
        os.makedirs(self.topic)
        open(self.topic_doc, "w").close()
        self.wip("new", "ctx", "--title", "ctx")
        self.wip("link", "ctx", "topic", self.topic)

    def test_cases(self):
        cases = {
            "worktree root": ([self.wt], "one\ntwo\n"),
            "nested path": ([os.path.join(self.wt, "src", "deep")], "one\ntwo\n"),
            "doc exact file": ([self.docfile], "docs\none\ntwo\n"),
            "doc directory": ([os.path.dirname(self.docfile)], "one\ntwo\n"),
            "shared prefix sibling": ([self.sibling], ""),
            "unrelated": ([self.tmp], ""),
            "topic root": ([self.topic], ""),
            "file inside topic": ([self.topic_doc], ""),
            "session": (["--session", "sess-1"], "docs\n"),
            "unknown session": (["--session", "nope"], ""),
        }
        for name, (args, expected) in cases.items():
            with self.subTest(name):
                self.assertEqual(self.wip("which", *args).stdout, expected)

    def test_defaults_to_cwd(self):
        self.assertEqual(self.wip("which", cwd=os.path.join(self.wt, "src")).stdout, "one\ntwo\n")


class TestBoard(WipTest):
    def setUp(self):
        super().setUp()
        self.main = self.repo(os.path.join(self.dirs["work"], "repo"))

    def test_worktree_states(self):
        root = self.dirs["root"]
        deep = self.worktree(self.main, os.path.join(root, "org", "repo", "feat", "a", "b", "c", "d"), "feat/a/b/c/d")
        dirty = self.worktree(self.main, os.path.join(root, "org", "repo", "dirty"), "dirty")
        with open(os.path.join(dirty, "x.txt"), "w") as f:
            f.write("x")
        ahead = self.worktree(self.main, os.path.join(root, "org", "repo", "ahead"), "ahead")
        self.git("branch", "-q", "--set-upstream-to=main", cwd=ahead)
        self.git("commit", "-q", "--allow-empty", "-m", "more", cwd=ahead)
        os.makedirs(os.path.join(root, "org", "repo", "node_modules", "pkg", ".git"))
        os.makedirs(os.path.join(root, ".hidden", "wt", ".git"))
        gone = self.worktree(self.main, os.path.join(root, "org", "repo", "gone"), "gone")
        self.wip("new", "linked", "--title", "Linked")
        self.wip("phase", "linked", "implementing")
        self.wip("link", "linked", "worktree", dirty)
        self.wip("link", "linked", "worktree", gone)
        shutil.rmtree(gone)

        out = self.wip().stdout
        initiatives, unclaimed = out.split("Unclaimed worktrees")
        self.assertIn("feat/a/b/c/d", unclaimed)
        self.assertIn("org/repo/feat/a/b/c/d  feat/a/b/c/d · no upstream · " + TODAY, unclaimed)
        self.assertIn("org/repo/ahead  ahead · ↑1 ↓0 · " + TODAY, unclaimed)
        self.assertNotIn("org/repo/dirty", unclaimed)
        self.assertNotIn("node_modules", out)
        self.assertNotIn(".hidden", out)
        self.assertIn("(2)", unclaimed.splitlines()[0])
        self.assertIn("dirty · dirty 1 · no upstream · " + TODAY, initiatives)
        self.assertIn("gone: MISSING", initiatives)
        self.assertIn(f"linked: worktree missing: {gone}", initiatives)
        self.assertIn("git timeouts: 0", out)

    def test_stale_and_parked_flags(self):
        wt = self.worktree(self.main, os.path.join(self.dirs["root"], "old"), "old")
        subprocess.run(
            [REAL_GIT, "commit", "-q", "--allow-empty", "-m", "old"],
            cwd=wt,
            env={**self.env, "GIT_COMMITTER_DATE": "2020-01-01T00:00:00", "GIT_AUTHOR_DATE": "2020-01-01T00:00:00"},
            check=True,
        )
        self.write("stale", phase="implementing", links=[{"kind": "worktree", "ref": wt}])
        self.write("waiting", phase="parked", since=OLD, reason="waiting on legal", parked_from="idea")
        self.write("oldone", phase="done", phase_source="sync", since=OLD)
        out = self.wip().stdout
        self.assertIn("stale: implementing with no commit in 14 days", out)
        self.assertIn("waiting: parked for 40d", out)
        self.assertIn("waiting · Waiting · parked for 40d · waiting on legal", out)
        self.assertNotIn("oldone", out)
        self.assertIn("oldone", self.wip("board", "--all").stdout)

    def test_pinned_sessions(self):
        self.sessions(
            {"id": "pin-linked", "title": "Linked pin", "pinned": 1, "pin_note": "a", "updated_at": 1_700_000_000_000},
            {"id": "pin-free", "title": "Free pin", "pinned": 1, "pin_note": "line one\nline two", "updated_at": 1_800_000_000},
            {"id": "pin-child", "parent_session_id": "pin-free", "title": "Child pin", "pinned": 1},
            {"id": "plain", "title": "Not pinned", "updated_at": 1_750_000_000},
        )
        self.wip("new", "pp", "--title", "P")
        self.wip("link", "pp", "session", "pin-linked")
        self.wip("link", "pp", "session", "plain")
        out = self.wip().stdout
        pins = out.split("Unclaimed pinned sessions")[1]
        self.assertIn("Free pin · line one line two · pin-free", pins)
        self.assertNotIn("pin-linked", pins)
        self.assertNotIn("Child pin", pins)
        self.assertIn("resume: anvil --session plain --there", out)

    def test_most_recent_session_without_db_is_last_linked(self):
        self.wip("new", "pp", "--title", "P")
        self.wip("link", "pp", "session", "first", "--cwd", self.tmp)
        self.wip("link", "pp", "session", "second", "--cwd", self.tmp)
        out = self.wip().stdout
        self.assertIn("resume: anvil --session second --there", out)
        self.assertNotIn("Unclaimed pinned sessions", out)

    def test_show_prints_resume_commands(self):
        wt = self.worktree(self.main, os.path.join(self.dirs["root"], "with space"), "spaced")
        self.wip("new", "pp", "--title", "P")
        self.wip("link", "pp", "worktree", wt)
        self.wip("link", "pp", "session", "abc", "--cwd", self.tmp)
        out = self.wip("show", "pp").stdout
        self.assertIn("anvil --session abc --there", out)
        self.assertIn(f"cd '{wt}' && anvil --session abc", out)
        self.assertIn("worktree", out)
        self.assertNotIn("Unclaimed", out)

    def test_show_resumes_latest_session_in_each_worktree(self):
        wt_a = self.worktree(self.main, os.path.join(self.dirs["root"], "wa"), "wa")
        wt_b = self.worktree(self.main, os.path.join(self.dirs["root"], "wb"), "wb")
        self.wip("new", "pp", "--title", "P")
        for wt in (wt_a, wt_b):
            self.wip("link", "pp", "worktree", wt)
        self.sessions(
            {"id": "old", "updated_at": 1_100_000_000_000, "working_dir": self.tmp},
            {"id": "new", "updated_at": 1_900_000_000, "working_dir": self.tmp},
            {"id": "mid", "updated_at": 1_500_000_000_000, "working_dir": self.tmp},
        )
        for sid in ("new", "old", "mid"):
            self.wip("link", "pp", "session", sid)
        out = self.wip("show", "pp").stdout
        resume = out[out.index("\nresume:\n") + 1:].splitlines()
        self.assertEqual(resume, [
            "resume:",
            "  anvil --session new --there",
            f"  cd '{wt_a}' && anvil --session new",
            f"  cd '{wt_b}' && anvil --session new",
            "earlier sessions:",
            "  anvil --session mid --there",
            "  anvil --session old --there",
        ])

    def test_pr_lines_and_footer(self):
        self.write("pp", phase="implementing", links=[self.pr_link(1, "draft", "2026-01-01T00:00:00Z"), self.pr_link(2)])
        out = self.wip().stdout
        self.assertIn(f"pr {pr(1)}: draft · ", out)
        self.assertIn(f"pr {pr(2)}: ? unknown", out)
        self.assertIn("PR state unknown", out)
        self.assertIn("oldest PR observation: never", out)

    def test_hanging_git_is_marked_and_board_finishes(self):
        self.worktree(self.main, os.path.join(self.dirs["root"], "hang-wt"), "hang")
        self.worktree(self.main, os.path.join(self.dirs["root"], "fine-wt"), "fine")
        fake = os.path.join(self.dirs["bin"], "git")
        with open(fake, "w") as f:
            f.write(f'#!/bin/sh\ncase "$*" in *hang-wt*) exec sleep 60;; esac\nexec "{REAL_GIT}" "$@"\n')
        os.chmod(fake, 0o755)
        start = time.monotonic()
        out = self.wip(env={"PATH": self.dirs["bin"] + os.pathsep + self.env["PATH"]}).stdout
        self.assertLess(time.monotonic() - start, 20)
        self.assertIn("hang-wt  ?", out)
        self.assertIn("fine-wt  fine · no upstream", out)
        self.assertIn("git timeouts: 1", out)

    def test_empty(self):
        os.rmdir(self.dirs["root"])
        out = self.wip().stdout
        self.assertIn("Initiatives\n  none", out)


class TestImportPins(WipTest):
    def setUp(self):
        super().setUp()
        self.sessions(
            {"id": "s1", "title": "Café Rollout ☕", "pinned": 1, "pin_note": "check\nmetrics  \n tomorrow", "created_at": 1, "working_dir": self.dirs["work"]},
            {"id": "s2", "title": "Café rollout", "pinned": 1, "pin_note": "", "created_at": 2},
            {"id": "s3", "title": "Not pinned", "created_at": 3},
        )

    def test_dry_run_writes_nothing(self):
        out = self.wip("import-pins").stdout
        self.assertIn("caf-rollout  Café Rollout ☕\n    id: s1\n    note: check metrics tomorrow", out)
        self.assertIn("caf-rollout-2  Café rollout\n    id: s2\n    note: -", out)
        self.assertNotIn("s3", out)
        self.assertEqual(os.listdir(self.dirs["wip"]), [])

    def test_apply_one_then_rerun(self):
        self.wip("import-pins", "--apply", "s1")
        self.assertEqual(sorted(n for n in os.listdir(self.dirs["wip"]) if n.endswith(".md")), ["caf-rollout.md"])
        meta, _ = self.read("caf-rollout")
        self.assertEqual((meta["phase"], meta["reason"]), ("parked", "check metrics tomorrow"))
        self.assertEqual(meta["links"], [{"kind": "session", "ref": "s1", "cwd": self.dirs["work"]}])
        out = self.wip("import-pins", "--apply", "s1").stdout
        self.assertIn("skip s1", out)
        self.assertEqual(sorted(n for n in os.listdir(self.dirs["wip"]) if n.endswith(".md")), ["caf-rollout.md"])
        out = self.wip("import-pins").stdout
        self.assertNotIn("s1", out)
        self.assertIn("id: s2", out)

    def test_empty_note_reason(self):
        self.wip("import-pins", "--apply", "s2")
        meta, _ = self.read("caf-rollout-2")
        self.assertEqual(meta["reason"], "pinned in Anvil")
        self.wip("phase", "caf-rollout-2", "unpark")

    def test_rejects_unpinned_and_missing_db(self):
        self.wip("import-pins", "--apply", "s3", ok=False)
        self.assertEqual(os.listdir(self.dirs["wip"]), [])
        os.unlink(self.db)
        self.wip("import-pins", ok=False)


class TestConcurrency(WipTest):
    def test_parallel_links_all_land(self):
        self.wip("new", "cc", "--title", "C")
        docs = [self.doc(f"d{i}.md") for i in range(8)]
        procs = [
            subprocess.Popen([sys.executable, SCRIPT, "link", "cc", "doc", d], env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            for d in docs
        ]
        for p in procs:
            _, err = p.communicate(timeout=30)
            self.assertEqual(p.returncode, 0, err)
        refs = {link["ref"] for link in self.read("cc")[0]["links"]}
        self.assertEqual(refs, set(docs))

    def hold_lock(self):
        holder = subprocess.Popen(
            [sys.executable, "-c",
             "import fcntl, os, sys, time\n"
             "fd = os.open(sys.argv[1], os.O_CREAT | os.O_RDWR)\n"
             "fcntl.flock(fd, fcntl.LOCK_EX)\n"
             "print('locked', flush=True)\n"
             "time.sleep(120)\n",
             os.path.join(self.dirs["wip"], ".lock")],
            stdout=subprocess.PIPE,
            text=True,
        )
        self.addCleanup(holder.stdout.close)
        self.addCleanup(holder.wait)
        self.addCleanup(holder.kill)
        self.assertEqual(holder.stdout.readline().strip(), "locked")
        return holder

    def test_held_lock_times_out(self):
        self.wip("new", "cc", "--title", "C")
        self.hold_lock()
        r = self.wip("link", "cc", "pr", pr(1), ok=False)
        self.assertIn("lock", r.stderr)

    def test_killed_lock_holder_does_not_block(self):
        self.wip("new", "cc", "--title", "C")
        holder = self.hold_lock()
        holder.send_signal(signal.SIGKILL)
        holder.wait()
        start = time.monotonic()
        self.wip("link", "cc", "pr", pr(1))
        self.assertLess(time.monotonic() - start, 4)

    def test_body_edit_during_write_is_preserved(self):
        repo = self.repo(os.path.join(self.dirs["work"], "repo"))
        wt = self.worktree(repo, os.path.join(self.dirs["root"], "wt"), "wt")
        self.wip("new", "cc", "--title", "C")
        marker = os.path.join(self.tmp, "edited")
        fake = os.path.join(self.dirs["bin"], "git")
        with open(fake, "w") as f:
            f.write(
                "#!/bin/sh\n"
                f"if [ ! -e '{marker}' ]; then case \"$*\" in *--git-common-dir*) touch '{marker}'; printf 'agent edit\\n' >> '{self.path('cc')}';; esac; fi\n"
                f'exec "{REAL_GIT}" "$@"\n'
            )
        os.chmod(fake, 0o755)
        self.wip("link", "cc", "worktree", wt, env={"PATH": self.dirs["bin"] + os.pathsep + self.env["PATH"]})
        self.assertTrue(os.path.exists(marker))
        meta, body = self.read("cc")
        self.assertTrue(body.endswith(b"agent edit\n"))
        self.assertEqual(meta["links"], [{"kind": "worktree", "ref": wt}])
        self.assertEqual(self.log()[:2], ["wip link cc worktree " + shlex.quote(wt), "record edits made outside wip"])
        self.assertIn("+agent edit", self.git("show", "HEAD~1", cwd=self.dirs["wip"]))
        self.assertNotIn("agent edit", self.git("show", "HEAD", cwd=self.dirs["wip"]))


class TestHistory(WipTest):
    def test_new_starts_a_repo_and_commits(self):
        self.wip("new", "alpha", "--title", "Alpha work")
        self.assertEqual(self.log(), ["wip new alpha --title 'Alpha work'", "record edits made outside wip"])
        self.assertEqual(self.git("ls-files", cwd=self.dirs["wip"]).split(), [".gitignore", "alpha.md"])
        self.assertEqual(self.git("status", "--porcelain", cwd=self.dirs["wip"]), "")

    def test_outside_edits_are_committed_before_the_change(self):
        self.wip("new", "alpha", "--title", "Alpha")
        with open(self.path("alpha"), "ab") as f:
            f.write(b"hand edit\n")
        self.write("beta")
        doc = self.doc()
        self.wip("link", "alpha", "doc", doc)
        self.assertEqual(self.log()[:2], ["wip link alpha doc " + shlex.quote(doc), "record edits made outside wip"])
        outside = self.git("show", "--stat", "--format=", "HEAD~1", cwd=self.dirs["wip"])
        self.assertIn("alpha.md", outside)
        self.assertIn("beta.md", outside)
        change = self.git("show", "--format=", "HEAD", cwd=self.dirs["wip"])
        self.assertIn(doc, change)
        self.assertNotIn("hand edit", change)

    def test_no_op_change_adds_no_commit(self):
        self.wip("new", "alpha", "--title", "Alpha")
        doc = self.doc()
        self.wip("link", "alpha", "doc", doc)
        before = self.log()
        self.wip("link", "alpha", "doc", doc)
        self.wip("which", doc)
        self.wip()
        self.assertEqual(self.log(), before)

    def test_failed_commit_is_reported_and_recovered(self):
        self.wip("new", "alpha", "--title", "Alpha")
        hook = os.path.join(self.dirs["wip"], ".git", "hooks", "pre-commit")
        with open(hook, "w") as f:
            f.write("#!/bin/sh\necho blocked by hook >&2\nexit 1\n")
        os.chmod(hook, 0o755)
        r = self.wip("phase", "alpha", "implementing", ok=False)
        self.assertIn("wrote alpha.md but could not commit", r.stderr)
        self.assertIn("blocked by hook", r.stderr)
        self.assertEqual(self.read("alpha")[0]["phase"], "implementing")
        os.remove(hook)
        self.wip("phase", "alpha", "spec", "--doc", self.doc())
        self.assertEqual(self.log()[:2][1], "record edits made outside wip")
        self.assertIn('"phase": "implementing"', self.git("show", "HEAD~1", cwd=self.dirs["wip"]))

    def test_dir_inside_another_repo_is_rejected(self):
        outer = self.repo(os.path.join(self.dirs["work"], "outer"))
        inner = os.path.join(outer, "initiatives")
        r = self.wip("new", "alpha", "--title", "Alpha", ok=False, env={"WIP_DIR": inner})
        self.assertIn("make it a repo of its own", r.stderr)
        self.assertFalse(os.path.exists(os.path.join(inner, "alpha.md")))
        self.assertEqual(self.git("log", "--format=%s", cwd=outer).split("\n")[0], "init")


if __name__ == "__main__":
    unittest.main()
