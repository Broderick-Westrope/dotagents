import { test } from "node:test"
import assert from "node:assert/strict"

import { runBuild } from "./fake-runtime.mjs"

test("requires() is a no-op at top level", () => {
  const sim = { source: 'requires({skills: ["x"]}); function main() { return 1 }' }
  assert.deepEqual(runBuild(sim), { result: 1 })
})

test("primitives called at top level throw", () => {
  const sim = { source: 'const root = bash("pwd"); function main() { return root }' }
  assert.throws(() => runBuild(sim), /primitives can't be called at top level/)
  assert.equal(sim.bashes.length, 0)
})

test("Date() and new Date() without arguments throw", () => {
  for (const expr of ["Date()", "new Date()"]) {
    const { error } = runBuild({ source: "function main() { return " + expr + " }" })
    assert.match(error?.message ?? "", /isn't replay-safe/, expr)
  }
})

test("Date.now, new Date(now()) and Math.random go through recorded primitives", () => {
  const sim = {
    now: 1700000000000,
    random: 0.25,
    source: "function main() { return [Date.now(), new Date(now()).getTime(), Math.random(), random()] }",
  }
  assert.deepEqual(runBuild(sim).result, [1700000000000, 1700000000000, 0.25, 0.25])
  assert.deepEqual(sim.primitives.filter(p => p === "now" || p === "random"), ["now", "now", "random", "random"])
})

test("skill and workflow.dir are available, and Interrupted is not", () => {
  const sim = { source: 'function main() { return [skill("go-style"), typeof workflow.dir(), typeof Interrupted] }' }
  assert.deepEqual(runBuild(sim).result, ["SKILL go-style", "string", "undefined"])
})

test("turn() inside workflow.exclusive throws without running the turn", () => {
  const sim = {
    source: `function main() {
      const s = session.current()
      return workflow.exclusive(() => {
        try { s.turn("x"); return "ran" } catch (e) { return e.message }
      })
    }`,
  }
  assert.equal(runBuild(sim).result, "turn() can't run inside workflow.exclusive")
  assert.equal(sim.turns.length, 0)
  assert.equal(sim.released, 1)
})

test("turn() only runs in the invoking session and sessions the run created", () => {
  const sim = {
    // Captures the native bridge before the prelude hides it, to reach a
    // session no handle can name.
    beforePrelude: 'const n = __native; globalThis.rawTurn = s => JSON.parse(n("turn", JSON.stringify({ session: s, prompt: "x" })))',
    source: `function main() {
      session.current().turn("a")
      session.new({ title: "t" }).turn("b")
      return rawTurn("stranger")
    }`,
  }
  const out = runBuild(sim).result
  assert.equal(out.ok, false)
  assert.equal(out.error.message, `session "stranger" doesn't belong to this run`)
  assert.deepEqual(sim.turns.map(t => t.session), ["invoker", "new-1"])
})
