// A fake of Anvil's workflow runtime for testing workflow.js under plain
// Node. The script runs in a fresh vm context behind a prelude shaped like
// the real one: every primitive crosses the boundary as JSON, and errors
// come back as the context's own error classes so `instanceof` works.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

export const BUILD_DIR = path.dirname(fileURLToPath(import.meta.url))

const PRELUDE = `"use strict";
(function (global) {
  class BashError extends Error { constructor(m) { super(m); this.name = "BashError"; } }
  class SchemaError extends Error { constructor(m) { super(m); this.name = "SchemaError"; } }
  class Cancelled extends Error { constructor(m) { super(m); this.name = "Cancelled"; } }
  class Interrupted extends Error { constructor(m) { super(m); this.name = "Interrupted"; } }
  class JobsRunning extends Error { constructor(m) { super(m); this.name = "JobsRunning"; } }
  const errorTypes = { BashError, SchemaError, Cancelled, Interrupted, JobsRunning };
  const native = global.__native;
  delete global.__native;

  function invoke(name, args) {
    const env = JSON.parse(native(name, JSON.stringify(args === undefined ? {} : args)));
    if (env.ok) return env.value;
    const Type = errorTypes[env.error.name] || Error;
    const err = new Type(env.error.message);
    if (env.error.fields) Object.assign(err, env.error.fields);
    throw err;
  }

  function handle(id) {
    return Object.freeze({
      id,
      turn(prompt, opts) { return invoke("turn", Object.assign({}, opts, { session: id, prompt })); },
    });
  }

  Object.assign(global, {
    BashError, SchemaError, Cancelled, Interrupted, JobsRunning,
    requires: (r) => { invoke("requires", r); },
    bash: (cmd, opts) => invoke("bash", Object.assign({}, opts, { cmd })),
    agent: (name, prompt, opts) => invoke("agent", Object.assign({}, opts, { agent: name, prompt })),
    parallel: (calls) => invoke("parallel", { calls }),
    reference: (path) => invoke("reference", { path }),
    readFile: (path) => invoke("readFile", { path }),
    ask: (question, opts) => invoke("ask", Object.assign({}, opts, { question })),
    status: (step, detail) => { invoke("status", { step: String(step), detail: detail === undefined ? "" : String(detail) }); },
    session: Object.freeze({
      current: () => handle(invoke("session.current")),
      new: (opts) => handle(invoke("session.new", opts || {})),
    }),
    workflow: Object.freeze({
      tmpdir: () => invoke("workflow.tmpdir"),
      dir: () => invoke("workflow.dir"),
      focus: (s) => { invoke("workflow.focus", { session: s.id }); },
      exclusive: (fn, opts) => {
        invoke("workflow.hold", { stopJobs: !!(opts && opts.stopJobs) });
        try {
          return fn();
        } finally {
          invoke("workflow.release");
        }
      },
    }),
  });
})(globalThis);
`

class Fail {
  constructor(name, message, fields) {
    this.name = name
    this.message = message
    this.fields = fields
  }
}

// runBuild runs workflow.js against sim and records every primitive call
// on it. sim may set:
//   da:        DA verdict kinds to return, in order
//   reviews:   reviewer output keyed by "agent model"; {fail: msg} fails it
//   audit:     the audit agent's output
//   status:    stdout of `git status --porcelain --ignored`
//   bashFn:    (cmd, n) => {stdout, stderr, exitCode} | undefined, where n
//              counts earlier commands with the same first two words
//   answer:    (question, options) => reply (default: the first option)
//   holdErr:   {message, jobs}, returned once by the next hold as JobsRunning
//   skipNote:  (turnNumber, notePath) => true to have that turn not write
//              the build note it was asked for
//   raw:       the /build argument
// It returns {result, error}.
export function runBuild(sim) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "build-test-"))
  const note = path.join(tmp, "build-note.md")
  Object.assign(sim, {
    tmp,
    note,
    daPrompts: [],
    auditPrompts: [],
    asks: [],
    bashes: [],
    turns: [],
    statuses: [],
    newSessions: [],
    focused: [],
    holds: [],
    released: 0,
    inHold: false,
  })
  const prefixCounts = {}

  const handlers = {
    requires(r) {
      sim.requires = r
    },
    bash({ cmd, cwd, check }) {
      const prefix = cmd.split(" ").slice(0, 2).join(" ")
      const n = prefixCounts[prefix] || 0
      prefixCounts[prefix] = n + 1
      sim.bashes.push({ cmd, cwd, inHold: sim.inHold })
      const res = Object.assign({ stdout: "", stderr: "", exitCode: 0 }, defaultBash(sim, cmd), sim.bashFn && sim.bashFn(cmd, n))
      if (res.exitCode !== 0 && check !== false) {
        throw new Fail("BashError", "command failed with exit code " + res.exitCode + ": " + cmd, res)
      }
      return res
    },
    turn({ session, prompt, schema, skills }) {
      sim.turns.push({ session, prompt, schema, skills })
      if (schema) return { approach: "a", lesson: "l" }
      // A builder told to write a note writes it, unless the test says
      // this turn forgets to.
      const notePath = (prompt.match(/`([^`]*build-note[^`]*\.md)`/) || [])[1]
      if (notePath && !(sim.skipNote && sim.skipNote(sim.turns.length, notePath))) {
        fs.writeFileSync(notePath, "NOTE from turn " + sim.turns.length)
      }
      return "ok"
    },
    agent({ agent, prompt, schema, tools, model }) {
      if (agent === "devils-advocate") {
        sim.daPrompts.push(prompt)
        if (sim.da.length === 0) throw new Error("unexpected DA call")
        const kind = sim.da.shift()
        return { kind, findings: [{ summary: "f-" + kind + "-" + sim.daPrompts.length }], lesson: "L" }
      }
      if (tools) {
        sim.auditPrompts.push(prompt)
        return sim.audit
      }
      throw new Error("unexpected agent call: " + agent + " " + model)
    },
    parallel({ calls }) {
      return calls.map(c => {
        const out = (sim.reviews || {})[c.agent + " " + c.model] || { verdict: "approve", findings: [] }
        if (out.fail) return { ok: false, error: { message: out.fail } }
        return { ok: true, value: out }
      })
    },
    reference({ path: p }) {
      return fs.readFileSync(path.join(BUILD_DIR, p), "utf8")
    },
    readFile({ path: p }) {
      return fs.readFileSync(p, "utf8")
    },
    ask({ question, options }) {
      sim.asks.push(question)
      if (sim.answer) return sim.answer(question, options)
      return options && options.length > 0 ? options[0] : "ok"
    },
    status({ step, detail }) {
      sim.statuses.push([step, detail])
    },
    "session.current"() {
      return "invoker"
    },
    "session.new"(opts) {
      sim.newSessions.push(opts)
      return "new-" + sim.newSessions.length
    },
    "workflow.tmpdir"() {
      return tmp
    },
    "workflow.dir"() {
      return BUILD_DIR
    },
    "workflow.focus"({ session }) {
      sim.focused.push(session)
    },
    "workflow.hold"({ stopJobs }) {
      if (sim.holdErr) {
        const e = sim.holdErr
        sim.holdErr = null
        throw new Fail("JobsRunning", e.message, { jobs: e.jobs })
      }
      sim.holds.push({ stopJobs })
      sim.inHold = true
    },
    "workflow.release"() {
      sim.released++
      sim.inHold = false
    },
  }

  const native = (name, argsJSON) => {
    const h = handlers[name]
    if (!h) throw new Error("unknown primitive " + name)
    try {
      const value = h(JSON.parse(argsJSON))
      return JSON.stringify({ ok: true, value: value === undefined ? null : value })
    } catch (e) {
      if (!(e instanceof Fail)) throw e
      return JSON.stringify({ ok: false, error: { name: e.name, message: e.message, fields: e.fields } })
    }
  }

  const context = vm.createContext({ __native: native })
  vm.runInContext(PRELUDE, context)
  const src = fs.readFileSync(path.join(BUILD_DIR, "workflow.js"), "utf8")
  vm.runInContext(src, context, { filename: "workflow.js" })
  context.__input = JSON.stringify({ raw: sim.raw === undefined ? "plans/design-2026-10-10-x.md" : sim.raw })
  try {
    const out = vm.runInContext("main(JSON.parse(__input))", context, { timeout: 5000 })
    return { result: out === undefined ? undefined : JSON.parse(JSON.stringify(out)) }
  } catch (error) {
    return { error }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

function defaultBash(sim, cmd) {
  const starts = p => cmd.startsWith(p)
  if (starts("git rev-parse --show-toplevel")) return { stdout: "/repo\n" }
  if (starts("git rev-parse --abbrev-ref")) return { stdout: "main\n" }
  if (starts("git show-ref")) return { exitCode: 1 }
  if (starts("wtp cd")) return { stdout: "/wt/feat-x\n" }
  if (starts("test -s")) {
    const file = cmd.slice("test -s ".length).replace(/^'|'$/g, "")
    return { exitCode: fs.existsSync(file) && fs.statSync(file).size > 0 ? 0 : 1 }
  }
  if (starts("git status --porcelain")) return { stdout: sim.status || "" }
  return {}
}
