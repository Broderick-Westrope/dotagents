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
