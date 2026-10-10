import { test } from "node:test"
import assert from "node:assert/strict"

import { runBuild } from "./fake-runtime.mjs"

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

test("stops after three DA rounds with the latest findings, and the DA never sees earlier ones", () => {
  const sim = { da: ["changes", "changes", "changes"] }
  mustSucceed(runBuild(sim))
  assert.equal(sim.daPrompts.length, 3)
  assert.equal(sim.asks.length, 1)
  assert.match(sim.asks[0], /after 3 reviews/)
  assert.match(sim.asks[0], /f-changes-3/)
  assert.doesNotMatch(sim.asks[0], /f-changes-[12]/)
  for (const p of sim.daPrompts) {
    assert.match(p, /NOTE/)
    assert.doesNotMatch(p, /f-changes/, "DA must not see earlier findings")
  }
})

test("stops after two rebuilds, removing the worktree under exclusive and focusing each new session", () => {
  const sim = { da: ["wrong-approach", "wrong-approach", "wrong-approach"] }
  mustSucceed(runBuild(sim))
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
  mustSucceed(runBuild(sim))
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
  assert.equal(ran(sim, "git update-ref")[0].cmd, "git update-ref 'refs/build-attempts/feat/x/1' 'feat/x'")
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
  assert.equal(checks[0].cmd, "git status --porcelain --ignored")
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
  mustSucceed(runBuild(sim))
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
    bashFn: (cmd, n) => (cmd === "git status --porcelain" && n === 0 ? { stdout: " M a.go\n" } : undefined),
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
    bashFn: cmd => (cmd === "git status --porcelain" ? { stdout: " M a.go\n" } : undefined),
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
      if (cmd === "git status --porcelain" && n === 0) return { stdout: " M wip.go\n" }
      if (cmd === "git rev-parse HEAD") return { stdout: (sim.heads++ === 0 ? "abc" : "def") + "\n" }
      return undefined
    },
  }
  mustSucceed(runBuild(sim))
  const commitIdx = sim.turns.findIndex(t => t.prompt.includes("wip.go"))
  assert.ok(commitIdx >= 0, "builder must commit before the DA")
  assert.equal(sim.daPrompts.length, 2, "a HEAD change during the DA review means another DA round")
})
