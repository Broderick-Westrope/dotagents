requires({
  skills: ["verification-before-completion"],
  agents: ["devils-advocate", "reviewer", "convention-reviewer"],
  references: [
    "references/test-driven-development.md",
    "references/build.md",
    "references/da.md",
    "references/refine.md",
    "references/lesson.md",
    "references/seed.md",
    "references/exercise.md",
    "references/review.md",
    "references/audit.md",
    "references/fix.md",
    "references/handover.md",
  ],
})

// Caps from the /build process: three DA reviews per approach, two
// rebuilds, and (illustratively) three review passes.
const MAX_DA_ROUNDS = 3
const MAX_APPROACHES = 3
const MAX_REVIEW_PASSES = 3

const REVIEWERS = [
  { label: "Sonnet", agent: "reviewer", model: "anthropic/claude-sonnet-5-5" },
  { label: "Opus", agent: "reviewer", model: "anthropic/claude-opus-5-5" },
  { label: "Convention", agent: "convention-reviewer", model: "anthropic/claude-opus-5-5" },
]
const READ_ONLY = ["glob", "grep", "ls", "view", "bash"]

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
    kind: { enum: ["clean", "changes", "wrong-approach"] },
    findings: { type: "array", items: Finding },
    lesson: { type: "string" },
  },
  required: ["kind"],
}
const Lesson = {
  type: "object",
  properties: { approach: { type: "string" }, lesson: { type: "string" } },
  required: ["approach", "lesson"],
}
const Severity = { enum: ["critical", "important", "minor"] }
const Findings = {
  type: "object",
  properties: {
    verdict: { enum: ["approve", "request-changes"] },
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
          verdict: { enum: ["confirmed", "rejected", "duplicate"] },
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

function main(input) {
  const ctx = resolveInputs(input.raw.trim())
  ctx.note = workflow.tmpdir() + "/build-note.md"
  ctx.tdd = workflow.dir() + "/references/test-driven-development.md"
  const lessons = []
  let builder = session.current()
  ctx.worktree = createWorktree(ctx)

  for (let approach = 1; approach <= MAX_APPROACHES; approach++) {
    status("build", "approach " + approach + "/" + MAX_APPROACHES)
    builder.turn(fill("references/build.md", ctx))
    ensureNote(builder, ctx)

    let verdict
    for (let round = 1; ; round++) {
      status("devils-advocate", "approach " + approach + ", round " + round + "/" + MAX_DA_ROUNDS)
      // The DA sees only the doc, the note and the base branch: no
      // earlier rounds, no conversation with the builder.
      verdict = agent("devils-advocate",
        fill("references/da.md", Object.assign({}, ctx, { note: readFile(ctx.note) })),
        { schema: DAVerdict })
      if (verdict.kind !== "changes") break
      if (round === MAX_DA_ROUNDS) {
        return ask("The devil's advocate is still objecting after " + MAX_DA_ROUNDS +
          " reviews of this approach. Latest findings:\n\n" + formatFindings(verdict.findings) +
          "\n\nThe work is on " + ctx.branch + " at " + ctx.worktree + ".", { options: ["ok"] })
      }
      status("refine", "approach " + approach + ", round " + round)
      builder.turn(fill("references/refine.md", Object.assign({}, ctx, { findings: formatFindings(verdict.findings) })))
      ensureNote(builder, ctx)
    }
    if (verdict.kind === "clean") return finish(builder, ctx)

    // The approach is wrong: record what it taught, then rebuild from the
    // base in a fresh session so the next builder isn't anchored to it.
    status("rebuild", "approach " + approach + " was judged wrong")
    lessons.push(builder.turn(fill("references/lesson.md",
      Object.assign({}, ctx, { verdict: verdict.lesson || formatFindings(verdict.findings) })), { schema: Lesson }))
    if (approach === MAX_APPROACHES) break
    workflow.exclusive(() => {
      const dirty = bash("git status --porcelain", { cwd: ctx.worktree }).stdout.trim()
      if (dirty && ask("Discard " + ctx.worktree + "? It has uncommitted changes:\n" + dirty,
        { options: ["discard", "stop"] }) === "stop") {
        throw new Error("stopped before rebuild; " + ctx.worktree + " is untouched")
      }
      bash("wtp remove --force --force-branch " + q(ctx.branch), { cwd: ctx.root })
    })
    ctx.worktree = createWorktree(ctx)
    builder = session.new({
      title: "/build approach " + (approach + 1),
      seed: fill("references/seed.md", Object.assign({}, ctx, { lessons: formatLessons(lessons) })),
    })
    workflow.focus(builder)
  }
  return ask("Two rebuilds without a clean devil's advocate review. What each approach taught:\n\n" +
    formatLessons(lessons) + "\n\nThe design doc likely needs revisiting.", { options: ["ok"] })
}

function finish(builder, ctx) {
  status("exercise", "verifying locally")
  builder.turn(fill("references/exercise.md", ctx), { skills: ["verification-before-completion"] })
  const failed = review(builder, ctx)
  if (failed === null) return
  status("hand over", ctx.branch)
  const description = builder.turn(fill("references/handover.md", ctx))
  let message = "Ready for your review.\n\nWorktree: " + ctx.worktree + "\nBranch: " + ctx.branch +
    "\nDraft PR description: " + ctx.note + "\n\n" + description
  if (failed.length > 0) message += "\n\nThese reviews didn't complete: " + failed.join(", ")
  return ask(message, { options: ["ok"] })
}

// review runs the reviewers in parallel, audits their findings, and has
// the builder fix only audited, confirmed ones. It returns the labels of
// reviewers that failed in the last pass, or null if it stopped early.
function review(builder, ctx) {
  for (let pass = 1; pass <= MAX_REVIEW_PASSES; pass++) {
    status("review", "pass " + pass + "/" + MAX_REVIEW_PASSES)
    const prompt = fill("references/review.md", ctx)
    const results = parallel(REVIEWERS.map(r =>
      ({ agent: r.agent, model: r.model, prompt, schema: Findings })))
    const failed = REVIEWERS.filter((_, i) => !results[i].ok).map(r => r.label)
    if (failed.length === REVIEWERS.length) {
      ask("All reviewers failed:\n" + results.map((r, i) => REVIEWERS[i].label + ": " + r.error.message).join("\n"),
        { options: ["ok"] })
      return null
    }
    const raw = []
    results.forEach((r, i) => {
      if (!r.ok) return
      r.value.findings.forEach((f, j) =>
        raw.push(Object.assign({ id: REVIEWERS[i].label.toLowerCase() + "-" + (j + 1), reviewer: REVIEWERS[i].label }, f)))
    })
    if (raw.length === 0) return failed

    status("audit", raw.length + " findings")
    const audit = agent("reviewer",
      fill("references/audit.md", Object.assign({}, ctx, { findings: JSON.stringify(raw, null, 2) })),
      { schema: Audit, tools: READ_ONLY })
    requireOneDispositionEach(raw, audit.dispositions)
    const byId = Object.fromEntries(raw.map(f => [f.id, f]))
    const blocking = audit.dispositions
      .filter(d => d.verdict === "confirmed" && d.severity !== "minor")
      .map(d => Object.assign({}, byId[d.id], { severity: d.severity || byId[d.id].severity, audit: d.reason }))
    if (blocking.length === 0) return failed

    status("fix", blocking.length + " confirmed findings")
    // The builder only ever sees audited findings.
    builder.turn(fill("references/fix.md", Object.assign({}, ctx, { findings: JSON.stringify(blocking, null, 2) })))
  }
  ask("Review still requests changes after " + MAX_REVIEW_PASSES + " passes. The work is on " +
    ctx.branch + " at " + ctx.worktree + ".", { options: ["ok"] })
  return null
}

// Schemas can't say "one disposition per input", so the script checks it.
function requireOneDispositionEach(raw, dispositions) {
  const seen = {}
  for (const d of dispositions) seen[d.id] = (seen[d.id] || 0) + 1
  const missing = raw.filter(f => seen[f.id] !== 1).map(f => f.id)
  if (missing.length > 0) throw new Error("audit must dispose of every finding exactly once; check: " + missing.join(", "))
}

function resolveInputs(raw) {
  const root = bash("git rev-parse --show-toplevel").stdout.trim()
  let docPath = null
  if (raw === "") {
    const newest = bash("ls -t plans/design-*.md 2>/dev/null | head -n 1", { cwd: root, check: false }).stdout.trim()
    if (newest === "") throw new Error("no design doc given and none found in plans/; run /build <design doc or request>")
    if (ask("Build " + newest + "?", { options: ["build it", "stop"] }) !== "build it") throw new Error("stopped")
    docPath = root + "/" + newest
  } else if (bash("test -f " + q(raw), { cwd: root, check: false }).exitCode === 0) {
    docPath = raw.startsWith("/") ? raw : root + "/" + raw
  }
  const base = bash("git rev-parse --abbrev-ref HEAD", { cwd: root }).stdout.trim()
  const slug = slugFor(docPath || raw)
  let branch = "feat/" + slug
  for (let n = 2; bash("git show-ref --verify --quiet refs/heads/" + q(branch), { cwd: root, check: false }).exitCode === 0; n++) {
    branch = "feat/" + slug + "-" + n
  }
  return {
    root,
    base,
    branch,
    doc: docPath ? "the design doc at `" + docPath + "` (read it first)" : "this request:\n\n" + raw,
  }
}

function slugFor(text) {
  const name = text.split("/").pop().replace(/\.md$/, "").replace(/^design-\d{4}-\d{2}-\d{2}-/, "")
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)
  return slug || "build"
}

function createWorktree(ctx) {
  bash("wtp add -b " + q(ctx.branch) + " --stay " + q(ctx.base), { cwd: ctx.root })
  return bash("wtp cd " + q(ctx.branch), { cwd: ctx.root }).stdout.trim()
}

function ensureNote(builder, ctx) {
  if (bash("test -s " + q(ctx.note), { check: false }).exitCode === 0) return
  builder.turn("You didn't write the build note. Write it now to `" + ctx.note + "`, covering assumptions, decisions, rejected options, unsure and verified.")
  readFile(ctx.note)
}

// fill reads a reference and replaces {{name}} placeholders from vars.
function fill(path, vars) {
  return reference(path).replace(/\{\{(\w+)\}\}/g, (m, name) => (name in vars ? String(vars[name]) : m))
}

function formatFindings(findings) {
  if (!findings || findings.length === 0) return "(none listed)"
  return findings.map((f, i) => (i + 1) + ". " + f.summary + (f.detail ? "\n   " + f.detail : "")).join("\n")
}

function formatLessons(lessons) {
  return lessons.map((l, i) => "Approach " + (i + 1) + ": " + l.approach + "\nLesson: " + l.lesson).join("\n\n")
}

// q single-quotes a value for the shell.
function q(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'"
}
