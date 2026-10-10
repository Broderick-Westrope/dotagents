import { test } from "node:test"
import assert from "node:assert/strict"

import fs from "node:fs"
import path from "node:path"

import { BUILD_DIR, runBuild } from "./fake-runtime.mjs"

const SONNET = "reviewer anthropic/claude-sonnet-5-5"
const OPUS = "reviewer anthropic/claude-opus-5-5"
const CONVENTION = "convention-reviewer anthropic/claude-opus-5-5"

const cmds = sim => sim.bashes.map(b => b.cmd)
const ran = (sim, prefix) => sim.bashes.filter(b => b.cmd.startsWith(prefix))
const lastAsk = sim => sim.asks[sim.asks.length - 1]

function mustSucceed(out) {
  if (out.error) throw out.error
  return out.result
}

test("stops after five DA rounds with the latest findings, and the DA never sees earlier ones", () => {
  const sim = { da: ["changes", "changes", "changes", "changes", "changes"] }
  const { error } = runBuild(sim)
  assert.equal(error?.message, "the devil's advocate still objected after 5 reviews")
  assert.equal(sim.daPrompts.length, 5)
  assert.equal(sim.asks.length, 1)
  assert.match(sim.asks[0], /after 5 reviews/)
  assert.match(sim.asks[0], /f-changes-5/)
  assert.doesNotMatch(sim.asks[0], /f-changes-[1-4]/)
  for (const p of sim.daPrompts) {
    assert.match(p, /NOTE/)
    assert.doesNotMatch(p, /f-changes/, "DA must not see earlier findings")
  }
})

test("stops after two rebuilds, removing the worktree under exclusive and focusing each new session", () => {
  const sim = { da: ["wrong-approach", "wrong-approach", "wrong-approach"] }
  const { error } = runBuild(sim)
  assert.equal(error?.message, "no approach passed the devil's advocate after two rebuilds")
  assert.equal(sim.asks.length, 1)
  assert.match(sim.asks[0], /Two rebuilds/)
  assert.equal(sim.newSessions.length, 2)
  const removes = ran(sim, "wtp remove")
  assert.equal(removes.length, 2)
  assert.ok(removes.every(b => b.inHold), "wtp remove must run inside workflow.exclusive")
  assert.ok(ran(sim, "wtp add").slice(1).every(b => b.inHold), "recreation must run inside workflow.exclusive")
  assert.equal(sim.holds.length, 2)
  assert.equal(sim.released, 2)
  assert.deepEqual(sim.focused, ["new-1", "new-2"])
})

test("only audited, confirmed findings reach the builder's fix prompt", () => {
  const sim = {
    da: ["clean"],
    reviews: {
      [SONNET]: {
        verdict: "request-changes",
        findings: [
          { severity: "important", title: "real bug", file: "a.go", line: 1 },
          { severity: "important", title: "bogus" },
        ],
      },
    },
    audit: {
      dispositions: [
        { id: "sonnet-1", verdict: "confirmed", severity: "important", reason: "yes" },
        { id: "sonnet-2", verdict: "rejected", reason: "no" },
      ],
    },
  }
  const { error } = runBuild(sim)
  assert.equal(error?.message, "review still requested changes after 3 passes")
  const fixes = sim.turns.filter(t => t.prompt.includes("have been audited"))
  assert.equal(fixes.length, 3)
  for (const f of fixes) {
    assert.match(f.prompt, /real bug/)
    assert.doesNotMatch(f.prompt, /bogus/)
  }
  for (const t of sim.turns) assert.doesNotMatch(t.prompt, /bogus/)
  assert.match(lastAsk(sim), /after 3 passes/)
})

test("a self-referencing duplicate audit fails after one retry", () => {
  const sim = {
    da: ["clean"],
    reviews: { [SONNET]: { verdict: "request-changes", findings: [{ severity: "critical", title: "real bug" }] } },
    audit: { dispositions: [{ id: "sonnet-1", verdict: "duplicate", duplicateOf: "sonnet-1", reason: "x" }] },
  }
  const { error } = runBuild(sim)
  assert.match(error?.message ?? "", /audit still invalid after a retry/)
  assert.equal(sim.auditPrompts.length, 2)
  assert.match(sim.auditPrompts[1], /previous audit of these findings was rejected: audit has a duplicate cycle/)
  assert.equal(sim.turns.filter(t => t.prompt.includes("have been audited")).length, 0)
})

test("saves the old tip with git update-ref before wtp remove", () => {
  const sim = { da: ["wrong-approach", "clean"] }
  mustSucceed(runBuild(sim))
  const order = cmds(sim)
    .map(c => ["git update-ref", "wtp remove", "wtp add"].find(p => c.startsWith(p)))
    .filter(Boolean)
  assert.deepEqual(order, ["wtp add", "git update-ref", "wtp remove", "wtp add"])
  assert.equal(ran(sim, "git update-ref")[0].cmd, "git update-ref 'refs/build-attempts/feat/x/1' 'feat/x' ''")
})

test("model-supplied finding ids can't merge findings", () => {
  const sim = {
    da: ["clean"],
    reviews: {
      [SONNET]: {
        verdict: "request-changes",
        findings: [
          { id: "x", severity: "critical", title: "one" },
          { id: "x", severity: "critical", title: "two" },
        ],
      },
    },
    audit: { dispositions: [{ id: "x", verdict: "rejected", reason: "no" }] },
  }
  const { error } = runBuild(sim)
  assert.match(error?.message ?? "", /audit still invalid/)
  assert.match(sim.auditPrompts[0], /"id": "sonnet-1"/)
  assert.match(sim.auditPrompts[0], /"id": "sonnet-2"/)
})

test("JobsRunning on rebuild asks, then retries with stopJobs", () => {
  const sim = {
    da: ["wrong-approach", "clean"],
    holdErr: { message: "jobs running", jobs: [{ id: "J7", command: "npm run dev", sessionId: "invoker" }] },
  }
  mustSucceed(runBuild(sim))
  assert.match(sim.asks[0], /J7: npm run dev/)
  assert.deepEqual(sim.holds, [{ stopJobs: true }])
  assert.equal(ran(sim, "wtp remove").length, 1)
})

test("a request-changes review without a blocking finding counts as failed", () => {
  const sim = {
    da: ["clean"],
    reviews: { [SONNET]: { verdict: "request-changes", findings: [] } },
  }
  mustSucceed(runBuild(sim))
  assert.match(lastAsk(sim), /Ready for your review/)
  assert.match(lastAsk(sim), /didn't complete: Sonnet\n/)
})

test("an audit that confirms a finding without a severity fails", () => {
  const sim = {
    da: ["clean"],
    reviews: { [SONNET]: { verdict: "request-changes", findings: [{ severity: "important", title: "bug" }] } },
    audit: { dispositions: [{ id: "sonnet-1", verdict: "confirmed", reason: "yes" }] },
  }
  const { error } = runBuild(sim)
  assert.match(error?.message ?? "", /audit still invalid after a retry: .*without a severity/)
})

test("the DA reads a design-doc snapshot, not the original, and lessons stay out of the doc", () => {
  const sim = { da: ["wrong-approach", "clean"] }
  mustSucceed(runBuild(sim))
  assert.ok(
    cmds(sim).some(c => c.startsWith("cp '/repo/plans/design-2026-10-10-x.md' ") && c.endsWith("/design-snapshot.md'")),
    "design doc must be snapshotted",
  )
  assert.equal(sim.daPrompts.length, 2)
  for (const p of sim.daPrompts) {
    assert.match(p, /design-snapshot\.md/)
    assert.doesNotMatch(p, /\/repo\/plans\/design-2026-10-10-x\.md/)
  }
  for (const t of sim.turns) assert.doesNotMatch(t.prompt, /Append what this approach taught to the design doc/)
  assert.match(lastAsk(sim), /What earlier approaches taught/)
})

test("the rebuild status check counts ignored files", () => {
  const sim = { da: ["wrong-approach", "clean"] }
  mustSucceed(runBuild(sim))
  const checks = ran(sim, "git status --porcelain").filter(b => b.inHold)
  assert.equal(checks.length, 1)
  assert.equal(checks[0].cmd, "git status --porcelain --untracked-files=all --ignored")
})

test("answering stop to the discard question throws without touching the worktree", () => {
  const sim = {
    da: ["wrong-approach", "clean"],
    status: "?? scratch.txt\n!! node_modules/",
    answer: (q, options) => (q.startsWith("Rebuilding discards") ? "stop" : options[0]),
  }
  const { error } = runBuild(sim)
  assert.match(error?.message ?? "", /stopped before rebuild/)
  assert.match(sim.asks[0], /node_modules/)
  assert.equal(ran(sim, "wtp remove").length, 0)
  assert.equal(ran(sim, "git update-ref").length, 0)
  assert.equal(sim.newSessions.length, 0)
})

test("a failed worktree recreation fails the run instead of building on", () => {
  const sim = {
    da: ["wrong-approach", "clean"],
    bashFn: (cmd, n) => (cmd.startsWith("wtp add") && n === 1 ? { exitCode: 1, stderr: "boom" } : undefined),
  }
  const { error } = runBuild(sim)
  assert.match(error?.message ?? "", /refs\/build-attempts\/feat\/[^ ]+\/1/, "the error must say where the old work is kept")
  assert.match(error.message, /boom/)
  assert.equal(sim.newSessions.length, 0)
  assert.equal(sim.daPrompts.length, 1)
  assert.equal(sim.da.length, 1, "no further DA round")
  assert.equal(sim.released, 1)
  const afterFailure = sim.turns.filter(t => t.session !== "invoker")
  assert.equal(afterFailure.length, 0)
})

test("all reviewers failing asks and stops before the audit and handover", () => {
  const sim = {
    da: ["clean"],
    reviews: { [SONNET]: { fail: "s down" }, [OPUS]: { fail: "o down" }, [CONVENTION]: { fail: "c down" } },
  }
  const { error } = runBuild(sim)
  assert.equal(error?.message, "all reviewers failed")
  assert.equal(sim.asks.length, 1)
  assert.equal(sim.asks[0], "All reviewers failed:\nSonnet: s down\nOpus: o down\nConvention: c down")
  assert.equal(sim.auditPrompts.length, 0)
  assert.equal(sim.turns.filter(t => t.prompt.includes("have been audited")).length, 0)
})

test("a rebuilt approach's DA never gets the rejected approach's note", () => {
  const sim = {
    da: ["wrong-approach", "clean"],
    // The first build turn after the rebuild forgets its note.
    skipNote: n => sim.turns[n - 1].session !== "invoker" && !sim.skippedOnce && (sim.skippedOnce = true),
  }
  mustSucceed(runBuild(sim))
  assert.equal(sim.daPrompts.length, 2)
  const first = sim.daPrompts[0].match(/NOTE from turn \d+/)[0]
  assert.ok(!sim.daPrompts[1].includes(first), "the second DA saw the first approach's note")
  assert.match(sim.daPrompts[1], /NOTE from turn \d+/)
})

test("uncommitted work is committed by the builder before review", () => {
  const sim = {
    da: ["clean"],
    bashFn: (cmd, n) => (cmd === "git status --porcelain --untracked-files=all" && n === 0 ? { stdout: " M a.go\n" } : undefined),
  }
  mustSucceed(runBuild(sim))
  const commitTurn = sim.turns.find(t => /commit/i.test(t.prompt) && t.prompt.includes("a.go"))
  assert.ok(commitTurn, "the builder must be asked to commit the uncommitted files")
  assert.equal(sim.reviewPasses, 1)
  assert.match(lastAsk(sim), /Ready for your review/)
})

test("work that stays uncommitted stops before review when the user says stop", () => {
  const sim = {
    da: ["clean"],
    bashFn: cmd => (cmd === "git status --porcelain --untracked-files=all" ? { stdout: " M a.go\n" } : undefined),
    answer: (q, options) => (options.includes("stop") ? "stop" : options[0]),
  }
  const { error } = runBuild(sim)
  assert.match(error?.message ?? "", /uncommitted/)
  assert.equal(sim.reviewPasses ?? 0, 0)
})

test("a change to HEAD during review is reviewed again before hand-over", () => {
  const sim = {
    da: ["clean"],
    // HEAD moves once the first code review pass has started.
    bashFn: cmd => (cmd === "git rev-parse HEAD" ? { stdout: (sim.reviewPasses ? "def" : "abc") + "\n" } : undefined),
  }
  mustSucceed(runBuild(sim))
  assert.equal(sim.reviewPasses, 2)
  assert.match(lastAsk(sim), /Ready for your review/)
})

test("every builder turn carries the publication and deployment boundaries", () => {
  const sim = {
    da: ["changes", "wrong-approach", "clean"],
    reviews: { [SONNET]: { verdict: "request-changes", findings: [{ severity: "important", title: "bug" }] } },
    audit: { dispositions: [{ id: "sonnet-1", verdict: "confirmed", severity: "important", reason: "yes" }] },
  }
  runBuild(sim)
  assert.ok(sim.turns.length > 4)
  for (const t of sim.turns) {
    assert.match(t.prompt, /Don't push, merge or open a pull request/, "turn without boundaries: " + t.prompt.slice(0, 80))
    assert.match(t.prompt, /shared environment/)
  }
})

test("the DA only reviews committed work and re-reviews if HEAD moves", () => {
  const sim = {
    da: ["clean", "clean"],
    heads: 0,
    bashFn: (cmd, n) => {
      if (cmd === "git status --porcelain --untracked-files=all" && n === 0) return { stdout: " M wip.go\n" }
      if (cmd === "git rev-parse HEAD") return { stdout: (sim.heads++ === 0 ? "abc" : "def") + "\n" }
      return undefined
    },
  }
  mustSucceed(runBuild(sim))
  const commitIdx = sim.turns.findIndex(t => t.prompt.includes("wip.go"))
  assert.ok(commitIdx >= 0, "builder must commit before the DA")
  assert.equal(sim.daPrompts.length, 2, "a HEAD change during the DA review means another DA round")
})

test("the commit request never tells the builder to remove files", () => {
  const sim = {
    da: ["clean"],
    bashFn: (cmd, n) => (cmd === "git status --porcelain --untracked-files=all" && n === 0 ? { stdout: "?? user-notes.txt\n" } : undefined),
  }
  mustSucceed(runBuild(sim))
  const commitTurn = sim.turns.find(t => t.prompt.includes("user-notes.txt"))
  assert.ok(commitTurn)
  assert.doesNotMatch(commitTurn.prompt, /remove the rest/i)
  assert.match(commitTurn.prompt, /leave anything else untouched/i)
  assert.match(commitTurn.prompt, /don't delete, revert or stash/i)
})

test("blocking findings from a review of a version that has since changed are discarded", () => {
  const sim = {
    da: ["clean"],
    reviews: { [SONNET]: { verdict: "request-changes", findings: [{ severity: "important", title: "stale bug" }] } },
    audit: { dispositions: [{ id: "sonnet-1", verdict: "confirmed", severity: "important", reason: "yes" }] },
    bashFn: cmd => (cmd === "git rev-parse HEAD" ? { stdout: (sim.reviewPasses === 1 && !sim.checked ? (sim.checked = "abc") : "def") + "\n" } : undefined),
  }
  runBuild(sim)
  const fixTurns = sim.turns.filter(t => t.prompt.includes("have been audited"))
  assert.ok(sim.reviewPasses >= 2, "a stale pass must be reviewed again")
  assert.ok(fixTurns.length < sim.reviewPasses, "the stale pass's findings must not reach the builder")
})

test("every worktree status check lists untracked files whatever git's config says", () => {
  const sim = { da: ["changes", "wrong-approach", "clean"] }
  mustSucceed(runBuild(sim))
  const checks = ran(sim, "git status")
  assert.ok(checks.length > 2)
  for (const c of checks) assert.match(c.cmd, /--untracked-files=all/, c.cmd)
})

// q mirrors workflow.js's shell quoting, so tests can assert exact commands.
const q = s => "'" + String(s).replace(/'/g, "'\\''") + "'"

test("a free-text request with shell metacharacters is quoted when probed as a file", () => {
  const raw = "-it's $(touch pwned)\nand `more`"
  const sim = { raw, da: ["clean"] }
  mustSucceed(runBuild(sim))
  assert.equal(ran(sim, "test -f")[0].cmd, "test -f " + q(raw))
  assert.ok(sim.turns[0].prompt.includes(raw), "the request reaches the builder verbatim")
})

test("a design doc path with shell metacharacters is quoted when snapshotted", () => {
  const raw = "-it's$(touch-pwned).md"
  const sim = {
    raw,
    da: ["clean"],
    bashFn: cmd => (cmd === "test -f " + q(raw) ? { exitCode: 0 } : undefined),
  }
  mustSucceed(runBuild(sim))
  const cp = ran(sim, "cp ")[0].cmd
  assert.ok(cp.startsWith("cp " + q("/repo/" + raw) + " "), cp)
})

test("a base branch with shell metacharacters is quoted when creating the worktree", () => {
  const base = "it's$(touch-pwned)"
  const sim = {
    da: ["clean"],
    bashFn: cmd => (cmd.startsWith("git rev-parse --abbrev-ref") ? { stdout: base + "\n" } : undefined),
  }
  mustSucceed(runBuild(sim))
  assert.equal(ran(sim, "wtp add")[0].cmd, "wtp add -b " + q("feat/x") + " --stay " + q(base))
})

test("a DA verdict on work that changed during its review is discarded without refining", () => {
  const sim = {
    da: ["changes", "clean"],
    // HEAD moves while the first DA round is reviewing, then holds still.
    bashFn: cmd => (cmd === "git rev-parse HEAD" ? { stdout: (sim.daPrompts.length >= 1 ? "h1" : "h0") + "\n" } : undefined),
  }
  mustSucceed(runBuild(sim))
  assert.equal(sim.daPrompts.length, 2)
  assert.equal(sim.turns.filter(t => t.prompt.includes("f-changes-1")).length, 0, "a stale verdict must not reach the builder")
  assert.equal(sim.statuses.filter(([step]) => step === "refine").length, 0)
  assert.match(lastAsk(sim), /Ready for your review/)
})

test("an audit that is valid on its retry is used", () => {
  const sim = {
    da: ["clean"],
    reviews: { [SONNET]: { verdict: "request-changes", findings: [{ severity: "important", title: "real bug" }] } },
    audit: n => (n === 1
      ? { dispositions: [] }
      : { dispositions: [{ id: "sonnet-1", verdict: "rejected", reason: "not a bug" }] }),
  }
  mustSucceed(runBuild(sim))
  assert.equal(sim.auditPrompts.length, 2)
  assert.match(sim.auditPrompts[1], /previous audit of these findings was rejected: audit skipped findings: sonnet-1/)
  assert.equal(sim.turns.filter(t => t.prompt.includes("have been audited")).length, 0)
  assert.equal(sim.reviewPasses, 1)
  assert.match(lastAsk(sim), /Ready for your review/)
})

test("a clean DA, a verified build and an approving review hand over with a structured result", () => {
  const sim = { da: ["clean"] }
  const result = mustSucceed(runBuild(sim))
  assert.deepEqual(result, {
    outcome: "ready",
    branch: "feat/x",
    worktree: "/wt/feat-x",
    note: sim.tmp + "/build-note-approach-1.md",
  })
  assert.deepEqual(sim.statuses.map(([step]) => step), ["build", "devils-advocate", "cleanup", "exercise", "review", "hand over"])
  assert.equal(sim.daPrompts.length, 1)
  assert.equal(sim.reviewPasses, 1)
  assert.equal(sim.auditPrompts.length, 0)
  assert.equal(sim.asks.length, 1)
  assert.match(sim.asks[0], /^Ready for your review\./)
  assert.match(sim.asks[0], /Branch: feat\/x/)
  assert.doesNotMatch(sim.asks[0], /didn't complete/)
})

test("an existing kept attempt is never overwritten", () => {
  const sim = {
    da: ["wrong-approach", "clean"],
    bashFn: cmd => (cmd.startsWith("git update-ref") ? { exitCode: 128, stderr: "reference already exists" } : undefined),
  }
  const { error } = runBuild(sim)
  assert.match(error?.message ?? "", /git update-ref/)
  assert.equal(ran(sim, "wtp remove").length, 0)
  assert.equal(sim.newSessions.length, 0)
})

test("a branch name whose earlier attempts are still kept is skipped", () => {
  const sim = {
    da: ["clean"],
    bashFn: cmd => (cmd === "git for-each-ref --count=1 " + q("refs/build-attempts/feat/x/")
      ? { stdout: "abc commit\trefs/build-attempts/feat/x/1\n" }
      : undefined),
  }
  mustSucceed(runBuild(sim))
  assert.equal(ran(sim, "wtp add")[0].cmd, "wtp add -b 'feat/x-2' --stay 'main'")
})

test("a detached HEAD fails before anything is created", () => {
  const sim = {
    da: ["clean"],
    bashFn: cmd => (cmd.startsWith("git rev-parse --abbrev-ref") ? { stdout: "HEAD\n" } : undefined),
  }
  const { error } = runBuild(sim)
  assert.equal(error?.message, "HEAD is detached; check out the base branch first")
  assert.equal(ran(sim, "wtp add").length, 0)
  assert.equal(sim.turns.length, 0)
})

test("a design doc path that doesn't exist fails instead of becoming a request", () => {
  for (const raw of ["plans/design-typo.md", "design-typo.md", "plans/design-typo"]) {
    const sim = {
      raw,
      da: ["clean"],
      bashFn: cmd => (cmd.startsWith("test -f") ? { exitCode: 1 } : undefined),
    }
    const { error } = runBuild(sim)
    assert.equal(error?.message, "design doc " + raw + " not found", raw)
    assert.equal(ran(sim, "wtp add").length, 0, raw)
  }
})

test("a request that merely mentions a path is still built as a request", () => {
  for (const raw of ["add retries to internal/net/retry.go", "refactor"]) {
    const sim = {
      raw,
      da: ["clean"],
      bashFn: cmd => (cmd.startsWith("test -f") ? { exitCode: 1 } : undefined),
    }
    mustSucceed(runBuild(sim))
    assert.ok(sim.turns[0].prompt.includes("this request:\n\n" + raw), raw)
  }
})

test("the discard question lists at most 40 files and counts the rest", () => {
  const lines = n => Array.from({ length: n }, (_, i) => "!! ignored-" + (i + 1) + ".log").join("\n")
  const answer = (q, options) => (q.startsWith("Rebuilding discards") ? "discard" : options[0])
  const long = { da: ["wrong-approach", "clean"], status: lines(45), answer }
  mustSucceed(runBuild(long))
  const ask = long.asks.find(a => a.startsWith("Rebuilding discards"))
  assert.match(ask, /ignored-40\.log\n…and 5 more\n/)
  assert.doesNotMatch(ask, /ignored-41\.log/)

  const exact = { da: ["wrong-approach", "clean"], status: lines(40), answer }
  mustSucceed(runBuild(exact))
  const exactAsk = exact.asks.find(a => a.startsWith("Rebuilding discards"))
  assert.match(exactAsk, /ignored-40\.log\n\n/)
  assert.doesNotMatch(exactAsk, /more/)
})

test("the DA, the reviewers and the auditor keep the tools their agent definitions give them", () => {
  const sim = {
    da: ["changes", "clean"],
    reviews: { [SONNET]: { verdict: "request-changes", findings: [{ severity: "important", title: "bug" }] } },
    audit: { dispositions: [{ id: "sonnet-1", verdict: "rejected", reason: "no" }] },
  }
  mustSucceed(runBuild(sim))
  assert.deepEqual(sim.daTools, [undefined, undefined])
  assert.equal(sim.reviewCalls.length, 1)
  assert.deepEqual(sim.reviewCalls[0].map(c => Object.hasOwn(c, "tools")), [false, false, false])
  assert.deepEqual(sim.auditTools, [undefined])
})

test("fill only substitutes the variables it was given", () => {
  const src = fs.readFileSync(path.join(BUILD_DIR, "workflow.js"), "utf8")
  const sim = {
    source: src + '\nfunction main() { return fill("t.md", { a: 1 }) }',
    references: { "t.md": "{{a}} {{constructor}} {{toString}} {{b}}" },
  }
  assert.equal(mustSucceed(runBuild(sim)), "1 {{constructor}} {{toString}} {{b}}")
})

test("a builder that never writes the build note fails the run with a clear error", () => {
  const sim = { da: ["clean"], skipNote: () => true }
  const { error } = runBuild(sim)
  assert.equal(error?.message, "builder never wrote the build note at " + sim.tmp + "/build-note-approach-1.md")
  assert.equal(sim.turns.length, 2, "the builder is reminded once")
  assert.equal(sim.daPrompts.length, 0)
})

test("running out of review passes on a stale pass says the work changed, not that changes were requested", () => {
  for (const findings of [[], [{ severity: "important", title: "bug" }]]) {
    const sim = {
      da: ["clean"],
      heads: 0,
      reviews: { [SONNET]: { verdict: findings.length ? "request-changes" : "approve", findings } },
      audit: { dispositions: [{ id: "sonnet-1", verdict: "confirmed", severity: "important", reason: "yes" }] },
      // HEAD moves during every review pass, but not during the DA round.
      bashFn: cmd => (cmd === "git rev-parse HEAD" ? { stdout: "h" + (sim.reviewPasses ? ++sim.heads : 0) + "\n" } : undefined),
    }
    const { error } = runBuild(sim)
    assert.equal(sim.reviewPasses, 3)
    assert.equal(error?.message, "the work changed during the last of 3 review passes")
    assert.match(lastAsk(sim), /changed during review/)
    assert.doesNotMatch(lastAsk(sim), /still requests changes/)
  }
})

test("every enum in the output schemas is typed as a string", () => {
  const sim = {
    da: ["clean"],
    reviews: { [SONNET]: { verdict: "request-changes", findings: [{ severity: "important", title: "bug" }] } },
    audit: { dispositions: [{ id: "sonnet-1", verdict: "rejected", reason: "no" }] },
  }
  mustSucceed(runBuild(sim))
  const enums = []
  const walk = node => {
    if (!node || typeof node !== "object") return
    if (node.enum) enums.push(node)
    Object.values(node).forEach(walk)
  }
  sim.schemas.forEach(walk)
  assert.ok(enums.length >= 5, "found " + enums.length + " enums")
  for (const e of enums) assert.equal(e.type, "string", JSON.stringify(e))
})

test("refining checks the whole diff against the red flags in codebase-design", () => {
  const sim = { da: ["changes", "clean"] }
  mustSucceed(runBuild(sim))
  const refine = sim.turns.find(t => t.prompt.includes("f-changes-1"))
  assert.ok(refine, "the builder must get the DA's findings")
  assert.match(refine.prompt, /red flags in \*\*codebase-design\*\*/)
})

const cleanupTurns = sim => sim.turns.filter(t => t.prompt.startsWith("Re-read the whole diff"))

test("a clean DA verdict gets one cleanup pass, and an unchanged diff moves on", () => {
  const sim = { da: ["clean"] }
  mustSucceed(runBuild(sim))
  const cleanups = cleanupTurns(sim)
  assert.equal(cleanups.length, 1)
  assert.match(cleanups[0].prompt, /red flags in \*\*codebase-design\*\*/)
  assert.equal(sim.daPrompts.length, 1)
  assert.match(lastAsk(sim), /Ready for your review/)
})

test("a cleanup that moves HEAD is committed and reviewed by another DA round", () => {
  const sim = {
    da: ["clean", "clean"],
    // The first cleanup commits and leaves a file uncommitted; later ones change nothing.
    bashFn: (cmd, n) => {
      if (cmd === "git rev-parse HEAD") return { stdout: (cleanupTurns(sim).length >= 1 ? "h1" : "h0") + "\n" }
      if (cmd === "git status --porcelain --untracked-files=all" && cleanupTurns(sim).length === 1 && !sim.dirtied) {
        sim.dirtied = true
        return { stdout: " M tidy.go\n" }
      }
      return undefined
    },
  }
  mustSucceed(runBuild(sim))
  assert.equal(sim.daPrompts.length, 2)
  assert.equal(cleanupTurns(sim).length, 2)
  assert.ok(sim.turns.some(t => t.prompt.includes("tidy.go")), "the builder must commit the cleanup before the next DA round")
  assert.match(lastAsk(sim), /Ready for your review/)
})

test("a cleanup that leaves uncommitted changes on the same HEAD gets another DA round", () => {
  const sim = {
    da: ["clean", "clean"],
    bashFn: cmd => {
      if (cmd === "git status --porcelain --untracked-files=all" && cleanupTurns(sim).length === 1 && !sim.dirtied) {
        sim.dirtied = true
        return { stdout: " M tidy.go\n" }
      }
      return undefined
    },
  }
  mustSucceed(runBuild(sim))
  assert.equal(sim.daPrompts.length, 2)
})

test("cleanups that keep changing the work count toward the DA cap", () => {
  const sim = {
    da: ["clean", "clean", "clean", "clean", "clean"],
    bashFn: cmd => (cmd === "git rev-parse HEAD" ? { stdout: "h" + cleanupTurns(sim).length + "\n" } : undefined),
  }
  const { error } = runBuild(sim)
  assert.equal(error?.message, "the cleanup pass still changed the work after the last of 5 devil's advocate reviews")
  assert.equal(sim.daPrompts.length, 5)
  assert.equal(sim.reviewPasses ?? 0, 0)
  assert.match(lastAsk(sim), /cleanup pass after its last of 5 reviews changed the work/)
})

test("a DA call that fails is retried once", () => {
  for (const name of ["SchemaError", "Error"]) {
    const sim = { da: ["clean"], daErrors: [{ name, message: "bad output" }] }
    mustSucceed(runBuild(sim))
    assert.equal(sim.daPrompts.length, 2, name)
    assert.equal(sim.daPrompts[1], sim.daPrompts[0], name)
  }
})

test("a DA call that fails twice fails the run", () => {
  const sim = { da: ["clean"], daErrors: [{ name: "SchemaError", message: "one" }, { name: "SchemaError", message: "two" }] }
  const { error } = runBuild(sim)
  assert.equal(error?.message, "the devil's advocate failed twice: two")
  assert.equal(sim.daPrompts.length, 2)
  assert.equal(sim.reviewPasses ?? 0, 0)
})

test("a cancelled DA call is not retried", () => {
  const sim = { da: ["clean"], daErrors: [{ name: "Cancelled", message: "cancelled" }] }
  const { error } = runBuild(sim)
  assert.equal(error?.name, "Cancelled")
  assert.equal(sim.daPrompts.length, 1)
})
