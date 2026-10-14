requires({
  skills: ["verification-before-completion", "using-git-worktrees"],
  agents: ["devils-advocate", "reviewer", "convention-reviewer"],
  references: [
    "references/test-driven-development.md",
    "references/boundaries.md",
    "references/report.md",
    "references/build.md",
    "references/seed.md",
    "references/da.md",
    "references/refine.md",
    "references/cleanup.md",
    "references/lesson.md",
    "references/exercise.md",
    "references/review.md",
    "references/audit.md",
    "references/fix.md",
    "references/handover.md",
    "references/handback.md",
  ],
})

// The script guarantees what prose couldn't: the devil's advocate's
// isolated context, a fresh builder for each rebuild, the caps, and an
// audited multi-model review. Everything else (repositories, worktrees,
// branches, commits, how to act on findings) is the builder's judgement,
// as it was when /build was a prose command.

// Past these caps another round rarely helps: a concern that keeps coming
// back, or approaches that keep failing, usually means the design doc
// needs the user.
const MAX_DA_ROUNDS = 5
const MAX_APPROACHES = 3
const MAX_REVIEW_PASSES = 3

// Mirrors the model table in ../review/COMMAND.md; change both together.
const REVIEWERS = [
  { label: "Sonnet", agent: "reviewer", model: "anthropic/claude-sonnet-5-5" },
  { label: "Opus", agent: "reviewer", model: "anthropic/claude-opus-5-5" },
  { label: "Convention", agent: "convention-reviewer", model: "anthropic/claude-opus-5-5" },
]

const Report = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["done", "blocked"] },
    question: { type: "string" },
    changed: { type: "boolean" },
  },
  required: ["status"],
}
const Finding = {
  type: "object",
  properties: {
    summary: { type: "string" },
    detail: { type: "string" },
  },
  required: ["summary"],
}
const DAVerdict = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["clean", "changes", "wrong-approach"] },
    findings: { type: "array", items: Finding },
    lesson: { type: "string" },
  },
  required: ["kind"],
}
const Lesson = {
  type: "object",
  properties: {
    approach: { type: "string" },
    lesson: { type: "string" },
    where: { type: "string" },
  },
  required: ["approach", "lesson"],
}
const Severity = { type: "string", enum: ["critical", "important", "minor"] }
const Findings = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["approve", "request-changes"] },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: Severity,
          file: { type: "string" },
          line: { type: "integer" },
          title: { type: "string" },
          detail: { type: "string" },
        },
        required: ["severity", "title"],
      },
    },
  },
  required: ["verdict", "findings"],
}
const Audit = {
  type: "object",
  properties: {
    dispositions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          verdict: { type: "string", enum: ["confirmed", "rejected", "duplicate"] },
          severity: Severity,
          reason: { type: "string" },
          duplicateOf: { type: "string" },
        },
        required: ["id", "verdict", "reason"],
      },
    },
  },
  required: ["dispositions"],
}

// Stop ends the run by handing it back to the user through the builder,
// who knows the state of the work and can carry on the conversation.
class Stop extends Error {}

function main(input) {
  const ctx = resolveInputs(input.raw.trim())
  // The DA reads a snapshot taken now, so nothing written to the design doc
  // later (by the builder or anyone else) reaches a later review round.
  ctx.daDoc = ctx.doc
  if (ctx.docPath) {
    const snapshot = workflow.tmpdir() + "/design-snapshot.md"
    bash("cp " + q(ctx.docPath) + " " + q(snapshot))
    ctx.daDoc = "the design doc at `" + snapshot + "` (read it first)"
  }
  ctx.tdd = workflow.dir() + "/references/test-driven-development.md"
  ctx.lessons = []
  let builder = session.current()
  try {
    for (let approach = 1; ; approach++) {
      // Each approach gets its own note, so a rebuilt approach's DA can
      // never be handed the rejected approach's note.
      ctx.note = workflow.tmpdir() + "/build-note-approach-" + approach + ".md"
      status("build", "approach " + approach + "/" + MAX_APPROACHES)
      work(builder, fill("references/build.md", ctx))
      ensureNote(builder, ctx)

      const verdict = challenge(builder, ctx, approach)
      if (verdict.kind === "clean") return finish(builder, ctx)

      status("rebuild", "approach " + approach + " was judged wrong")
      ctx.lessons.push(learn(builder, ctx, verdict.lesson || formatFindings(verdict.findings)))
      if (approach === MAX_APPROACHES) {
        throw new Stop("The devil's advocate judged all " + MAX_APPROACHES + " approaches wrong, so the design doc likely needs revisiting.")
      }
      // A fresh session, so the next builder isn't anchored to the
      // rejected approach; it knows only what the approach taught.
      builder = session.new({
        title: "/build approach " + (approach + 1),
        seed: fill("references/seed.md", Object.assign({}, ctx, { lessons: formatLessons(ctx.lessons) })),
      })
      workflow.focus(builder)
    }
  } catch (e) {
    if (!(e instanceof Stop)) throw e
    return handBack(builder, ctx, e.message)
  }
}

// learn asks the rejected approach's builder what it taught. If its answer
// is malformed, the DA's verdict stands in for the lesson, so a rebuild
// never fails over a summary.
function learn(builder, ctx, verdict) {
  try {
    return tell(builder, fill("references/lesson.md", Object.assign({}, ctx, { verdict })), { schema: Lesson })
  } catch (e) {
    if (!(e instanceof SchemaError)) throw e
    return { approach: "(the builder didn't summarise it)", lesson: verdict }
  }
}

// challenge runs DA rounds on the current approach until the DA finds
// nothing worth changing and a cleanup pass leaves the work as it was, or
// judges the approach wrong. It returns that last verdict.
function challenge(builder, ctx, approach) {
  for (let round = 1; ; round++) {
    status("devils-advocate", "approach " + approach + ", round " + round + "/" + MAX_DA_ROUNDS)
    const verdict = runDA(ctx)
    if (verdict.kind === "wrong-approach") return verdict
    if (verdict.kind === "clean") {
      status("cleanup", "approach " + approach + ", round " + round)
      if (!work(builder, fill("references/cleanup.md", ctx)).changed) return verdict
      if (round === MAX_DA_ROUNDS) {
        throw new Stop("The devil's advocate found nothing to change, but the cleanup pass after its last of " +
          MAX_DA_ROUNDS + " reviews changed the work, so that version wasn't reviewed.")
      }
      continue
    }
    if (round === MAX_DA_ROUNDS) {
      throw new Stop("The devil's advocate still had findings after " + MAX_DA_ROUNDS +
        " reviews of this approach. Its latest:\n\n" + formatFindings(verdict.findings))
    }
    status("refine", "approach " + approach + ", round " + round)
    work(builder, fill("references/refine.md", Object.assign({}, ctx, { findings: formatFindings(verdict.findings) })) +
      "\n\n" + fill("references/cleanup.md", ctx))
    ensureNote(builder, ctx)
  }
}

// runDA asks a fresh devil's advocate for a verdict. It sees only the doc
// snapshot and the current note (whose Where section says where the diffs
// are): no earlier rounds and no conversation with the builder. A failed
// call is retried once, since one malformed answer shouldn't end the run.
function runDA(ctx) {
  const prompt = fill("references/da.md", Object.assign({}, ctx, { note: readFile(ctx.note) }))
  for (let attempt = 1; ; attempt++) {
    try {
      return agent("devils-advocate", prompt, { schema: DAVerdict })
    } catch (e) {
      if (e instanceof Cancelled) throw e
      if (attempt === 2) throw new Stop("The devil's advocate failed twice: " + e.message)
    }
  }
}

function finish(builder, ctx) {
  status("exercise", "verifying locally")
  work(builder, fill("references/exercise.md", ctx), { skills: ["verification-before-completion"] })
  const failed = review(builder, ctx)
  status("hand over")
  tell(builder, fill("references/handover.md", Object.assign({}, ctx, {
    failed: failed.length > 0 ? "These reviewers didn't complete, so say so: " + failed.join(", ") + "." : "",
    lessons: ctx.lessons.length > 0 ? earlierApproaches(ctx) : "",
  })))
  return { outcome: "ready", note: ctx.note, failedReviewers: failed }
}

// review runs the reviewers in parallel, audits their findings, and has
// the builder fix only audited, confirmed ones. It returns the labels of
// reviewers that failed in the last pass.
function review(builder, ctx) {
  let blocking = []
  for (let pass = 1; pass <= MAX_REVIEW_PASSES; pass++) {
    status("review", "pass " + pass + "/" + MAX_REVIEW_PASSES)
    const prompt = fill("references/review.md", Object.assign({}, ctx, { note: readFile(ctx.note) }))
    const results = parallel(REVIEWERS.map(r =>
      ({ agent: r.agent, model: r.model, prompt, schema: Findings })))
    // A reviewer that requests changes without a blocking finding gave
    // no usable review, so it counts as failed rather than as approval.
    results.forEach((r, i) => {
      if (r.ok && r.value.verdict === "request-changes" &&
        !r.value.findings.some(f => f.severity !== "minor")) {
        results[i] = { ok: false, error: { message: "requested changes but listed no critical or important finding" } }
      }
    })
    const failed = REVIEWERS.filter((_, i) => !results[i].ok).map(r => r.label)
    if (failed.length === REVIEWERS.length) {
      throw new Stop("Every reviewer failed:\n" + results.map((r, i) => REVIEWERS[i].label + ": " + r.error.message).join("\n"))
    }
    const raw = []
    results.forEach((r, i) => {
      if (!r.ok) return
      r.value.findings.forEach((f, j) =>
        // The script's id and reviewer are assigned last so model output
        // can't overwrite them and collapse two findings into one.
        raw.push(Object.assign({}, f, { id: REVIEWERS[i].label.toLowerCase() + "-" + (j + 1), reviewer: REVIEWERS[i].label })))
    })
    if (raw.length === 0) return failed

    status("audit", raw.length + " findings")
    const audit = runAudit(ctx, raw)
    const byId = Object.fromEntries(raw.map(f => [f.id, f]))
    blocking = audit.dispositions
      .filter(d => d.verdict === "confirmed" && d.severity !== "minor")
      .map(d => Object.assign({}, byId[d.id], { severity: d.severity, audit: d.reason }))
    if (blocking.length === 0) return failed

    status("fix", blocking.length + " confirmed findings")
    // The builder only ever sees audited findings.
    work(builder, fill("references/fix.md", Object.assign({}, ctx, { findings: JSON.stringify(blocking, null, 2) })))
  }
  throw new Stop("Review still had confirmed findings after " + MAX_REVIEW_PASSES +
    " passes. The last pass's, which you fixed but nobody has reviewed since:\n\n" +
    blocking.map(f => "- [" + f.severity + "] " + f.title + (f.file ? " (" + f.file + (f.line ? ":" + f.line : "") + ")" : "")).join("\n"))
}

// runAudit asks a fresh auditor to dispose of every finding, retrying once
// with the problem spelled out if the audit is malformed.
function runAudit(ctx, raw) {
  const prompt = fill("references/audit.md", Object.assign({}, ctx, {
    note: readFile(ctx.note),
    findings: JSON.stringify(raw, null, 2),
  }))
  let problem = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const audit = agent("reviewer",
        problem ? prompt + "\n\nA previous audit of these findings was rejected: " + problem + ". Avoid that." : prompt,
        { schema: Audit })
      requireValidAudit(raw, audit.dispositions)
      return audit
    } catch (e) {
      if (e instanceof Cancelled) throw e
      problem = e.message
    }
  }
  throw new Stop("The audit of the reviewers' findings was still invalid after a retry: " + problem)
}

// Schemas can't say "one disposition per input" or that a duplicate must
// point at a real, resolved finding, so the script checks both. It throws
// rather than let a malformed audit drop a finding.
function requireValidAudit(raw, dispositions) {
  const ids = new Set(raw.map(f => f.id))
  if (ids.size !== raw.length) throw new Error("findings must have unique ids")
  const byId = {}
  for (const d of dispositions) {
    if (!ids.has(d.id)) throw new Error("audit disposed of unknown finding " + d.id)
    if (d.verdict === "confirmed" && !d.severity) throw new Error("audit confirmed " + d.id + " without a severity")
    if (byId[d.id]) throw new Error("audit disposed of " + d.id + " more than once")
    byId[d.id] = d
  }
  const missing = raw.filter(f => !byId[f.id]).map(f => f.id)
  if (missing.length > 0) throw new Error("audit skipped findings: " + missing.join(", "))
  for (const d of dispositions) checkDuplicateChain(d, byId)
}

// checkDuplicateChain follows duplicateOf links from d and throws unless
// they end at a confirmed or rejected finding.
function checkDuplicateChain(d, byId) {
  const seen = new Set()
  while (d.verdict === "duplicate") {
    if (seen.has(d.id)) throw new Error("audit has a duplicate cycle through " + d.id)
    seen.add(d.id)
    const target = byId[d.duplicateOf]
    if (!target) throw new Error("audit marks " + d.id + " a duplicate of unknown finding " + d.duplicateOf)
    d = target
  }
}

// handBack ends the run by having the builder tell the user where things
// stand, so the user picks up in the session as if the builder had stopped
// on its own.
function handBack(builder, ctx, why) {
  status("stopped")
  tell(builder, fill("references/handback.md", Object.assign({}, ctx, {
    why,
    lessons: ctx.lessons.length > 0 ? earlierApproaches(ctx) : "",
  })))
  return { outcome: "stopped", reason: why, note: ctx.note }
}

// resolveInputs finds the design doc or request. It doesn't need a git
// repository: the builder decides which repositories the change belongs
// in, so /build can start from a notes or topic directory.
function resolveInputs(raw) {
  const top = bash("git rev-parse --show-toplevel", { check: false })
  const root = top.exitCode === 0 ? top.stdout.trim() : bash("pwd").stdout.trim()
  let docPath = null
  if (raw === "") {
    const newest = bash("ls -t plans/design-*.md 2>/dev/null | head -n 1", { cwd: root, check: false }).stdout.trim()
    if (newest === "") throw new Error("no design doc given and none found in plans/; run /build <design doc or request>")
    if (ask("Build " + newest + "?", { options: ["build it", "stop"] }) !== "build it") throw new Error("stopped")
    docPath = root + "/" + newest
  } else if (bash("test -f " + q(raw), { cwd: root, check: false }).exitCode === 0) {
    docPath = isAbsolute(raw) ? raw : root + "/" + raw
  } else if (!/\s/.test(raw) && (raw.endsWith(".md") || raw.includes("/"))) {
    throw new Error("design doc " + raw + " not found")
  }
  return {
    root,
    docPath,
    doc: docPath ? "the design doc at `" + docPath + "` (read it first)" : "this request:\n\n" + raw,
  }
}

// isAbsolute recognises POSIX, drive-letter and UNC paths.
function isAbsolute(path) {
  return /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(path)
}

function ensureNote(builder, ctx) {
  if (noteWritten(ctx)) return
  tell(builder, "You didn't write the build note. Write it now to `" + ctx.note + "`, starting with its Where section.")
  if (!noteWritten(ctx)) throw new Stop("The builder never wrote the build note at " + ctx.note + ", so there was nothing to review.")
}

function noteWritten(ctx) {
  try {
    return readFile(ctx.note).trim() !== ""
  } catch (e) {
    if (e instanceof Cancelled) throw e
    return false
  }
}

// work sends the builder a turn that ends with a short report. A builder
// that needs the user says so, as it would have by stopping to ask when
// /build was a prose command: the question goes to the user and the
// answer comes back. A malformed report isn't worth ending the run over,
// so it counts as done and changed.
function work(builder, prompt, opts) {
  let text = prompt
  for (;;) {
    let report
    try {
      report = tell(builder, text + "\n\n" + reference("references/report.md"), Object.assign({}, opts, { schema: Report }))
    } catch (e) {
      if (!(e instanceof SchemaError)) throw e
      return { status: "done", changed: true }
    }
    if (report.status !== "blocked") return report
    const answer = ask((report.question || "").trim() || "The builder needs your input to carry on.")
    text = "The user answered:\n\n<answer>\n" + answer + "\n</answer>\n\nCarry on with what you were doing."
  }
}

// tell sends the builder a turn with the build's boundaries attached, so
// they survive compaction and reach every session, including rebuilds.
function tell(builder, prompt, opts) {
  return builder.turn(prompt + "\n\n" + reference("references/boundaries.md"), opts)
}

// fill reads a reference and replaces {{name}} placeholders from vars.
function fill(path, vars) {
  return reference(path).replace(/\{\{(\w+)\}\}/g, (m, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : m))
}

function formatFindings(findings) {
  if (!findings || findings.length === 0) return "(none listed)"
  return findings.map((f, i) => (i + 1) + ". " + f.summary + (f.detail ? "\n   " + f.detail : "")).join("\n")
}

function formatLessons(lessons) {
  return lessons.map((l, i) => "Approach " + (i + 1) + ": " + l.approach + "\nLesson: " + l.lesson).join("\n\n")
}

// earlierApproaches tells the user what rejected approaches taught and
// where their work was left.
function earlierApproaches(ctx) {
  return "Earlier approaches were judged wrong. Tell the user what each taught (suggest recording it in the design doc) and where its work was left, so they can remove it:\n\n" +
    ctx.lessons.map((l, i) => "Approach " + (i + 1) + ": " + l.approach + "\nLesson: " + l.lesson +
      (l.where ? "\nWhere: " + l.where : "")).join("\n\n")
}

// q single-quotes a value for the shell.
function q(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'"
}
