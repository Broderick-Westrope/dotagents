import { test } from "node:test"
import assert from "node:assert/strict"

import fs from "node:fs"
import path from "node:path"

import { BUILD_DIR, runBuild } from "./fake-runtime.mjs"

const SONNET = "reviewer anthropic/claude-sonnet-5-5"
const OPUS = "reviewer anthropic/claude-opus-5-5"
const CONVENTION = "convention-reviewer anthropic/claude-opus-5-5"

const ran = (sim, prefix) => sim.bashes.filter(b => b.cmd.startsWith(prefix))
const lastTurn = sim => sim.turns[sim.turns.length - 1]
const turnsWith = (sim, text) => sim.turns.filter(t => t.prompt.includes(text))
const handBack = sim => turnsWith(sim, "The build workflow stopped here")
const cleanupTurns = sim => sim.turns.filter(t => t.prompt.startsWith("Re-read the whole change"))
const steps = sim => sim.statuses.map(([step]) => step)

function mustSucceed(out) {
  if (out.error) throw out.error
  return out.result
}

// q mirrors workflow.js's shell quoting, so tests can assert exact commands.
const q = s => "'" + String(s).replace(/'/g, "'\\''") + "'"

test("a clean run builds, challenges, exercises, reviews and hands over without asking anything", () => {
  const sim = { da: ["clean"] }
  const result = mustSucceed(runBuild(sim))
  assert.deepEqual(result, { outcome: "ready", note: sim.tmp + "/build-note-approach-1.md", failedReviewers: [] })
  assert.deepEqual(steps(sim), ["build", "devils-advocate", "cleanup", "exercise", "review", "hand over"])
  assert.equal(sim.asks.length, 0)
  assert.match(lastTurn(sim).prompt, /passed review/)
  assert.equal(lastTurn(sim).session, "invoker")
})

test("the script leaves repositories, worktrees and branches to the builder", () => {
  const sim = { da: ["changes", "wrong-approach", "clean"] }
  mustSucceed(runBuild(sim))
  for (const b of sim.bashes) {
    assert.ok(["pwd", "test -f ", "cp "].some(p => b.cmd.startsWith(p)), "unexpected command: " + b.cmd)
  }
  assert.equal(sim.holds.length, 0)
  const build = sim.turns[0].prompt
  assert.match(build, /started in `\/repo`, which may not be one of them/)
  assert.match(build, /using-git-worktrees/)
  assert.match(build, /\*\*Where:\*\*/)
})

test("runs from a directory that isn't a git repository", () => {
  const sim = {
    da: ["clean"],
    raw: "track HIP downloads",
    bashFn: cmd => {
      if (cmd === "pwd") return { stdout: "/notes\n" }
      if (cmd.startsWith("test -f")) return { exitCode: 1 }
      return undefined
    },
  }
  mustSucceed(runBuild(sim))
  assert.match(sim.turns[0].prompt, /started in `\/notes`/)
  assert.ok(sim.turns[0].prompt.includes("this request:\n\ntrack HIP downloads"))
})

test("the DA sees only the doc snapshot and the current note, never earlier findings", () => {
  const sim = { da: ["changes", "changes", "clean"] }
  mustSucceed(runBuild(sim))
  assert.ok(ran(sim, "cp ").some(b => b.cmd.startsWith("cp '/repo/plans/design-2026-10-10-x.md' ") && b.cmd.endsWith("/design-snapshot.md'")))
  assert.equal(sim.daPrompts.length, 3)
  for (const p of sim.daPrompts) {
    assert.match(p, /design-snapshot\.md/)
    assert.doesNotMatch(p, /\/repo\/plans\/design-2026-10-10-x\.md/)
    assert.doesNotMatch(p, /f-changes/, "the DA must not see earlier findings")
    assert.match(p, /NOTE from turn \d+/)
    assert.match(p, /Where section/)
  }
})

test("a DA finding goes to the builder, who may record disagreement instead of acting on it", () => {
  const sim = { da: ["changes", "clean"] }
  mustSucceed(runBuild(sim))
  const refine = turnsWith(sim, "f-changes-1")
  assert.equal(refine.length, 1)
  assert.match(refine[0].prompt, /If you disagree with a finding, don't act on it/)
  assert.match(refine[0].prompt, /red flags in \*\*codebase-design\*\*/)
})

test("after five DA reviews with findings, the builder hands back with the latest ones", () => {
  const sim = { da: ["changes", "changes", "changes", "changes", "changes"] }
  const result = mustSucceed(runBuild(sim))
  assert.equal(result.outcome, "stopped")
  assert.match(result.reason, /still had findings after 5 reviews/)
  assert.equal(sim.daPrompts.length, 5)
  assert.equal(turnsWith(sim, "f-changes-5").filter(t => t.prompt.includes("Fix each finding")).length, 0,
    "the last findings go to the user, not into an unreviewed fix")
  const back = handBack(sim)
  assert.equal(back.length, 1)
  assert.match(back[0].prompt, /f-changes-5/)
  assert.doesNotMatch(back[0].prompt, /f-changes-[1-4]/)
  assert.equal(sim.asks.length, 0)
  assert.equal(sim.reviewPasses ?? 0, 0)
})

test("a clean DA verdict gets one cleanup pass, and a cleanup that changes the work gets another review", () => {
  const sim = {
    da: ["clean", "clean"],
    report: (n, prompt) => (prompt.startsWith("Re-read the whole change") && !sim.cleaned
      ? ((sim.cleaned = true), { status: "done", changed: true })
      : undefined),
  }
  mustSucceed(runBuild(sim))
  assert.equal(sim.daPrompts.length, 2)
  assert.equal(cleanupTurns(sim).length, 2)
})

test("cleanups that keep changing the work count toward the DA cap", () => {
  const sim = {
    da: ["clean", "clean", "clean", "clean", "clean"],
    report: (n, prompt) => (prompt.startsWith("Re-read the whole change") ? { status: "done", changed: true } : undefined),
  }
  const result = mustSucceed(runBuild(sim))
  assert.match(result.reason, /cleanup pass after its last of 5 reviews changed the work/)
  assert.equal(sim.daPrompts.length, 5)
  assert.equal(handBack(sim).length, 1)
})

test("a wrong approach is rebuilt in a fresh, focused session that knows only the lessons", () => {
  const sim = { da: ["changes", "wrong-approach", "clean"] }
  mustSucceed(runBuild(sim))
  assert.equal(sim.newSessions.length, 1)
  assert.deepEqual(sim.focused, ["new-1"])
  const seed = sim.newSessions[0].seed
  assert.match(seed, /Lesson: l\d+/)
  assert.match(seed, /Start in a new worktree on a new branch/)
  assert.doesNotMatch(seed, /f-changes/)
  const rebuilt = sim.turns.filter(t => t.session === "new-1")
  assert.match(rebuilt[0].prompt, /Build an early version/)
  assert.match(rebuilt[0].prompt, /build-note-approach-2\.md/)
  assert.equal(lastTurn(sim).session, "new-1")
})

test("a rebuilt approach's DA never gets the rejected approach's note", () => {
  const sim = {
    da: ["wrong-approach", "clean"],
    // The first build turn after the rebuild forgets its note, then writes it when reminded.
    skipNote: n => sim.turns[n - 1].session !== "invoker" && !sim.skippedOnce && (sim.skippedOnce = true),
  }
  mustSucceed(runBuild(sim))
  const first = sim.daPrompts[0].match(/NOTE from turn \d+/)[0]
  assert.ok(!sim.daPrompts[1].includes(first))
  assert.match(sim.daPrompts[1], /NOTE from turn \d+/)
})

test("three wrong approaches hand back with what each taught and where its work is", () => {
  const sim = { da: ["wrong-approach", "wrong-approach", "wrong-approach"] }
  const result = mustSucceed(runBuild(sim))
  assert.match(result.reason, /judged all 3 approaches wrong/)
  assert.equal(sim.newSessions.length, 2)
  const back = handBack(sim)
  assert.equal(back.length, 1)
  assert.equal(back[0].session, "new-2")
  assert.equal((back[0].prompt.match(/Lesson: /g) || []).length, 3)
})

test("a blocked builder's question goes to the user as free text, and the answer comes back", () => {
  const sim = {
    da: ["clean"],
    report: n => (n === 1 ? { status: "blocked", question: "Which repo owns the HIP button?" } : undefined),
    answer: (q, options) => (options ? options[0] : "customer-frontend"),
  }
  mustSucceed(runBuild(sim))
  assert.deepEqual(sim.asks, ["Which repo owns the HIP button?"])
  assert.match(sim.turns[1].prompt, /The user answered:\n\n<answer>\ncustomer-frontend\n<\/answer>/)
  assert.equal(sim.daPrompts.length, 1)
})

test("a malformed report counts as done and changed rather than ending the run", () => {
  const sim = {
    da: ["clean", "clean"],
    report: (n, prompt) => (prompt.startsWith("Re-read the whole change") && !sim.bad
      ? ((sim.bad = true), { schemaError: "no json block" })
      : undefined),
  }
  mustSucceed(runBuild(sim))
  assert.equal(sim.daPrompts.length, 2, "an unknown cleanup result gets another review")
})

test("a builder that never writes the build note is reminded once, then hands back", () => {
  const sim = { da: ["clean"], skipNote: () => true }
  const result = mustSucceed(runBuild(sim))
  assert.match(result.reason, /never wrote the build note/)
  assert.equal(turnsWith(sim, "You didn't write the build note").length, 1)
  assert.equal(sim.daPrompts.length, 0)
})

test("a DA call that fails is retried once with the same prompt", () => {
  for (const name of ["SchemaError", "Error"]) {
    const sim = { da: ["clean"], daErrors: [{ name, message: "bad output" }] }
    mustSucceed(runBuild(sim))
    assert.equal(sim.daPrompts.length, 2, name)
    assert.equal(sim.daPrompts[1], sim.daPrompts[0], name)
  }
})

test("a DA call that fails twice hands back", () => {
  const sim = { da: ["clean"], daErrors: [{ name: "SchemaError", message: "one" }, { name: "SchemaError", message: "two" }] }
  const result = mustSucceed(runBuild(sim))
  assert.equal(result.reason, "The devil's advocate failed twice: two")
  assert.equal(handBack(sim).length, 1)
})

test("a cancelled DA call is neither retried nor handed back", () => {
  const sim = { da: ["clean"], daErrors: [{ name: "Cancelled", message: "cancelled" }] }
  const { error } = runBuild(sim)
  assert.equal(error?.name, "Cancelled")
  assert.equal(sim.daPrompts.length, 1)
  assert.equal(handBack(sim).length, 0)
})

test("reviewers run in parallel on the note's Where section and keep their own tools", () => {
  const sim = { da: ["clean"] }
  mustSucceed(runBuild(sim))
  assert.equal(sim.reviewCalls.length, 1)
  assert.deepEqual(sim.reviewCalls[0].map(c => c.agent + " " + c.model), [SONNET, OPUS, CONVENTION])
  for (const c of sim.reviewCalls[0]) {
    assert.match(c.prompt, /NOTE from turn \d+/)
    assert.equal(Object.hasOwn(c, "tools"), false)
  }
  assert.deepEqual(sim.daTools, [undefined])
})

test("only audited, confirmed findings reach the builder, and the review cap hands back", () => {
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
  const result = mustSucceed(runBuild(sim))
  assert.match(result.reason, /still had confirmed findings after 3 passes/)
  const fixes = turnsWith(sim, "have been audited")
  assert.equal(fixes.length, 3)
  for (const t of sim.turns) assert.doesNotMatch(t.prompt, /bogus/)
  assert.match(handBack(sim)[0].prompt, /\[important\] real bug \(a\.go:1\)/)
})

test("a confirmed minor finding goes to the builder, and a pass it leaves unchanged hands over", () => {
  const sim = {
    da: ["clean"],
    reviews: { [SONNET]: { verdict: "request-changes", findings: [{ severity: "important", title: "nit" }] } },
    audit: { dispositions: [{ id: "sonnet-1", verdict: "confirmed", severity: "minor", reason: "style only" }] },
  }
  mustSucceed(runBuild(sim))
  const fixes = turnsWith(sim, "have been audited")
  assert.equal(fixes.length, 1)
  assert.match(fixes[0].prompt, /"severity": "minor"/)
  assert.match(fixes[0].prompt, /a minor finding gets fixed like any other/)
  assert.match(fixes[0].prompt, /\*\*Decisions\*\*/)
  assert.equal(sim.reviewPasses, 1)
  assert.match(lastTurn(sim).prompt, /passed review/)
})

test("a pass whose findings are all rejected moves on to hand over without a fix turn", () => {
  const sim = {
    da: ["clean"],
    reviews: { [SONNET]: { verdict: "request-changes", findings: [{ severity: "important", title: "bogus" }] } },
    audit: { dispositions: [{ id: "sonnet-1", verdict: "rejected", reason: "no" }] },
  }
  mustSucceed(runBuild(sim))
  assert.equal(turnsWith(sim, "have been audited").length, 0)
  assert.equal(sim.reviewPasses, 1)
})

test("fixing minor findings gets another review, and minor findings alone never stop the run at the cap", () => {
  const sim = {
    da: ["clean"],
    reviews: { [SONNET]: { verdict: "approve", findings: [{ severity: "minor", title: "copy" }] } },
    audit: { dispositions: [{ id: "sonnet-1", verdict: "confirmed", severity: "minor", reason: "yes" }] },
    report: (n, prompt) => (prompt.includes("have been audited") ? { status: "done", changed: true } : undefined),
  }
  const result = mustSucceed(runBuild(sim))
  assert.equal(result.outcome, "ready")
  assert.equal(sim.reviewPasses, 3)
  assert.equal(turnsWith(sim, "have been audited").length, 3)
  assert.match(lastTurn(sim).prompt, /passed review/)
})

test("an audit that is valid on its retry is used", () => {
  const sim = {
    da: ["clean"],
    reviews: { [SONNET]: { verdict: "request-changes", findings: [{ severity: "important", title: "real bug" }] } },
    audit: n => (n === 1 ? { dispositions: [] } : { dispositions: [{ id: "sonnet-1", verdict: "rejected", reason: "not a bug" }] }),
  }
  mustSucceed(runBuild(sim))
  assert.equal(sim.auditPrompts.length, 2)
  assert.match(sim.auditPrompts[1], /previous audit of these findings was rejected: audit skipped findings: sonnet-1/)
  assert.match(lastTurn(sim).prompt, /passed review/)
})

test("an audit that stays invalid hands back without acting on any finding", () => {
  for (const audit of [
    { dispositions: [{ id: "sonnet-1", verdict: "duplicate", duplicateOf: "sonnet-1", reason: "x" }] },
    { dispositions: [{ id: "sonnet-1", verdict: "confirmed", reason: "yes" }] },
  ]) {
    const sim = {
      da: ["clean"],
      reviews: { [SONNET]: { verdict: "request-changes", findings: [{ severity: "critical", title: "real bug" }] } },
      audit,
    }
    const result = mustSucceed(runBuild(sim))
    assert.match(result.reason, /audit of the reviewers' findings was still invalid after a retry/)
    assert.equal(turnsWith(sim, "have been audited").length, 0)
  }
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
  mustSucceed(runBuild(sim))
  assert.match(sim.auditPrompts[0], /"id": "sonnet-1"/)
  assert.match(sim.auditPrompts[0], /"id": "sonnet-2"/)
})

test("a request-changes review without a blocking finding counts as failed and is mentioned at hand-over", () => {
  const sim = { da: ["clean"], reviews: { [SONNET]: { verdict: "request-changes", findings: [] } } }
  const result = mustSucceed(runBuild(sim))
  assert.deepEqual(result.failedReviewers, ["Sonnet"])
  assert.match(lastTurn(sim).prompt, /These reviewers didn't complete, so say so: Sonnet\./)
})

test("all reviewers failing hands back before any audit", () => {
  const sim = {
    da: ["clean"],
    reviews: { [SONNET]: { fail: "s down" }, [OPUS]: { fail: "o down" }, [CONVENTION]: { fail: "c down" } },
  }
  const result = mustSucceed(runBuild(sim))
  assert.equal(result.reason, "Every reviewer failed:\nSonnet: s down\nOpus: o down\nConvention: c down")
  assert.equal(sim.auditPrompts.length, 0)
})

test("every builder turn carries the publication and deployment boundaries", () => {
  const sim = {
    da: ["changes", "wrong-approach", "clean"],
    reviews: { [SONNET]: { verdict: "request-changes", findings: [{ severity: "important", title: "bug" }] } },
    audit: { dispositions: [{ id: "sonnet-1", verdict: "confirmed", severity: "important", reason: "yes" }] },
  }
  mustSucceed(runBuild(sim))
  assert.ok(sim.turns.length > 6)
  for (const t of sim.turns) {
    assert.match(t.prompt, /Don't push, merge or open a pull request/, "turn without boundaries: " + t.prompt.slice(0, 80))
    assert.match(t.prompt, /shared environment/)
  }
})

test("an unclear request lets the builder ask or suggest grilling", () => {
  const sim = { da: ["clean"] }
  mustSucceed(runBuild(sim))
  assert.match(sim.turns[0].prompt, /report `blocked` with your question/)
  assert.match(sim.turns[0].prompt, /\*\*grilling\*\*/)
})

test("with no argument it offers the newest design doc", () => {
  const sim = {
    raw: "",
    da: ["clean"],
    bashFn: cmd => (cmd.startsWith("ls -t plans/design-") ? { stdout: "plans/design-2026-10-12-y.md\n" } : undefined),
  }
  mustSucceed(runBuild(sim))
  assert.deepEqual(sim.asks, ["Build plans/design-2026-10-12-y.md?"])
  assert.match(sim.turns[0].prompt, /design doc at `\/repo\/plans\/design-2026-10-12-y\.md`/)
})

test("anything that isn't an existing file is a request for the builder to interpret", () => {
  for (const raw of ["add retries to internal/net/retry.go", "refactor", "auth/login", "plans/design-typo.md"]) {
    const sim = { raw, da: ["clean"], bashFn: cmd => (cmd.startsWith("test -f") ? { exitCode: 1 } : undefined) }
    mustSucceed(runBuild(sim))
    assert.ok(sim.turns[0].prompt.includes("this request:\n\n" + raw), raw)
  }
})

test("input with shell metacharacters is quoted when probed and snapshotted", () => {
  const raw = "-it's $(touch pwned)\nand `more`"
  const free = { raw, da: ["clean"], bashFn: cmd => (cmd.startsWith("test -f") ? { exitCode: 1 } : undefined) }
  mustSucceed(runBuild(free))
  assert.equal(ran(free, "test -f")[0].cmd, "test -f " + q(raw))

  const docRaw = "-it's$(touch-pwned).md"
  const doc = { raw: docRaw, da: ["clean"] }
  mustSucceed(runBuild(doc))
  assert.ok(ran(doc, "cp ")[0].cmd.startsWith("cp " + q("/repo/" + docRaw) + " "))
})

test("every enum in the output schemas is typed as a string", () => {
  const sim = {
    da: ["changes", "clean"],
    reviews: { [SONNET]: { verdict: "request-changes", findings: [{ severity: "important", title: "bug" }] } },
    audit: { dispositions: [{ id: "sonnet-1", verdict: "rejected", reason: "no" }] },
  }
  mustSucceed(runBuild(sim))
  const schemas = sim.schemas.concat(sim.turns.map(t => t.schema).filter(Boolean))
  const enums = []
  const walk = node => {
    if (!node || typeof node !== "object") return
    if (node.enum) enums.push(node)
    Object.values(node).forEach(walk)
  }
  schemas.forEach(walk)
  assert.ok(enums.length >= 6, "found " + enums.length + " enums")
  for (const e of enums) assert.equal(e.type, "string", JSON.stringify(e))
})

test("fill only substitutes the variables it was given", () => {
  const src = fs.readFileSync(path.join(BUILD_DIR, "workflow.js"), "utf8")
  const sim = {
    source: src + '\nfunction main() { return fill("t.md", { a: 1 }) }',
    references: { "t.md": "{{a}} {{constructor}} {{toString}} {{b}}" },
  }
  assert.equal(mustSucceed(runBuild(sim)), "1 {{constructor}} {{toString}} {{b}}")
})

test("no prompt is left with an unfilled placeholder", () => {
  const sim = {
    da: ["changes", "wrong-approach", "clean"],
    reviews: { [SONNET]: { verdict: "request-changes", findings: [{ severity: "important", title: "bug" }] } },
    audit: { dispositions: [{ id: "sonnet-1", verdict: "confirmed", severity: "important", reason: "yes" }] },
  }
  mustSucceed(runBuild(sim))
  const prompts = sim.turns.map(t => t.prompt).concat(sim.daPrompts, sim.auditPrompts, sim.reviewCalls.flat().map(c => c.prompt),
    sim.newSessions.map(s => s.seed))
  for (const p of prompts) assert.doesNotMatch(p, /\{\{\w+\}\}/, p.slice(0, 120))
})

test("a malformed lesson falls back to the DA's verdict instead of ending the run", () => {
  const sim = { da: ["wrong-approach", "clean"], lessonError: "no json block" }
  mustSucceed(runBuild(sim))
  assert.match(sim.newSessions[0].seed, /Lesson: L/)
})

test("a builder working slice by slice gets each slice challenged before building on it", () => {
  const sim = {
    da: ["clean", "changes", "clean", "clean"],
    report: (n, prompt) => {
      if (prompt.startsWith("Build an early version")) return { status: "slice", changed: true }
      if (prompt.startsWith("The devil's advocate is satisfied") && !sim.second) return (sim.second = true), { status: "slice", changed: true }
      if (prompt.startsWith("The devil's advocate is satisfied")) return { status: "done", changed: true }
      return undefined
    },
  }
  mustSucceed(runBuild(sim))
  const continues = turnsWith(sim, "Build the next slice")
  assert.equal(continues.length, 2)
  assert.equal(sim.daPrompts.length, 4)
  assert.deepEqual(steps(sim).filter(x => x === "build"), ["build", "build", "build"])
  assert.match(lastTurn(sim).prompt, /passed review/)
})

test("a wrong verdict on a slice rebuilds the approach", () => {
  const sim = {
    da: ["wrong-approach", "clean"],
    report: (n, prompt, session) => (prompt.startsWith("Build an early version") && session === "invoker" ? { status: "slice", changed: true } : undefined),
  }
  mustSucceed(runBuild(sim))
  assert.equal(sim.newSessions.length, 1)
  assert.equal(turnsWith(sim, "Build the next slice").length, 0)
})

test("a cleanup that changed the work before asking the user still gets another review", () => {
  const sim = {
    da: ["clean", "clean"],
    report: (n, prompt) => {
      if (prompt.startsWith("Re-read the whole change") && !sim.asked) return (sim.asked = true), { status: "blocked", question: "keep the old name?", changed: true }
      if (prompt.startsWith("The user answered")) return { status: "done", changed: false }
      return undefined
    },
  }
  mustSucceed(runBuild(sim))
  assert.equal(sim.daPrompts.length, 2)
})

test("a cleanup report without changed counts as changed", () => {
  const sim = {
    da: ["clean", "clean"],
    report: (n, prompt) => (prompt.startsWith("Re-read the whole change") && !sim.once ? ((sim.once = true), { status: "done" }) : undefined),
  }
  mustSucceed(runBuild(sim))
  assert.equal(sim.daPrompts.length, 2)
})

test("the user's answer to a blocked question is recorded where reviewers see it", () => {
  const sim = {
    da: ["clean"],
    report: n => (n === 1 ? { status: "blocked", question: "Which event name?" } : undefined),
    answer: () => "hip_download_clicked",
  }
  mustSucceed(runBuild(sim))
  assert.match(sim.turns[1].prompt, /under \*\*Decisions\*\* in the build note at `[^`]*build-note-approach-1\.md`/)
})

test("a rejected approach records its lesson in the design doc and removes its own worktrees, keeping the doc's", () => {
  const sim = { da: ["wrong-approach", "clean"] }
  mustSucceed(runBuild(sim))
  const lesson = turnsWith(sim, "judged this approach wrong")[0].prompt
  assert.match(lesson, /record what this approach taught in it/)
  assert.match(lesson, /Remove the other worktrees this approach created/)
  assert.match(lesson, /reset that branch/)
  assert.match(lesson, /Leave anything you didn't create/)
})

test("an error from a builder turn hands back, and an error handing back ends the run with the original", () => {
  const failing = { da: ["clean"], turnError: n => (n === 2 ? "provider overloaded" : null) }
  const result = mustSucceed(runBuild(failing))
  assert.equal(result.outcome, "stopped")
  assert.match(result.reason, /couldn't recover from: provider overloaded/)
  assert.equal(handBack(failing).length, 1)

  const worse = { da: ["clean"], turnError: n => (n >= 2 ? "provider overloaded " + n : null) }
  const { error } = runBuild(worse)
  assert.equal(error?.message, "provider overloaded 2")
})

test("a cancelled builder turn ends the run without handing back", () => {
  const sim = { da: ["clean"], turnError: n => (n === 2 ? { name: "Cancelled", message: "cancelled" } : null) }
  const { error } = runBuild(sim)
  assert.equal(error?.name, "Cancelled")
  assert.equal(handBack(sim).length, 0)
})
