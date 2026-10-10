requires({
  skills: ["verification-before-completion"],
  agents: ["devils-advocate", "reviewer", "convention-reviewer"],
  references: [
    "references/test-driven-development.md",
    "references/boundaries.md",
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
  // The DA reads a snapshot taken now, so nothing written to the design doc
  // later (by the builder or anyone else) reaches a later review round.
  ctx.daDoc = ctx.doc
  if (ctx.docPath) {
    const snapshot = workflow.tmpdir() + "/design-snapshot.md"
    bash("cp " + q(ctx.docPath) + " " + q(snapshot))
    ctx.daDoc = "the design doc at `" + snapshot + "` (read it first)"
  }
  const lessons = []
  ctx.lessons = lessons
  ctx.tdd = workflow.dir() + "/references/test-driven-development.md"
  let builder = session.current()
  ctx.worktree = createWorktree(ctx)

  for (let approach = 1; approach <= MAX_APPROACHES; approach++) {
    // Each approach gets its own note, so a rebuilt approach's DA can never
    // be handed the rejected approach's note if the new builder forgets one.
    ctx.note = workflow.tmpdir() + "/build-note-approach-" + approach + ".md"
    status("build", "approach " + approach + "/" + MAX_APPROACHES)
    tell(builder, fill("references/build.md", ctx))
    ensureNote(builder, ctx)

    let verdict
    for (let round = 1; ; round++) {
      status("devils-advocate", "approach " + approach + ", round " + round + "/" + MAX_DA_ROUNDS)
      // The DA reads the committed diff, so its verdict only covers work
      // that's committed and unchanged while it looked.
      requireCommitted(builder, ctx)
      const reviewedHead = head(ctx)
      // The DA sees only the doc, the note and the base branch: no
      // earlier rounds, no conversation with the builder.
      verdict = agent("devils-advocate",
        fill("references/da.md", Object.assign({}, ctx, { note: readFile(ctx.note) })),
        { schema: DAVerdict })
      const stale = !unchangedSince(ctx, reviewedHead)
      if (!stale && verdict.kind !== "changes") break
      if (round === MAX_DA_ROUNDS) {
        const why = stale ? "The work changed while the devil's advocate was reviewing it, so its last verdict doesn't count."
          : "Latest findings:\n\n" + formatFindings(verdict.findings)
        ask("The devil's advocate is still objecting after " + MAX_DA_ROUNDS +
          " reviews of this approach. " + why +
          "\n\nThe work is on " + ctx.branch + " at " + ctx.worktree + ".", { options: ["ok"] })
        throw new Error("the devil's advocate still objected after " + MAX_DA_ROUNDS + " reviews")
      }
      if (stale) continue
      status("refine", "approach " + approach + ", round " + round)
      tell(builder, fill("references/refine.md", Object.assign({}, ctx, { findings: formatFindings(verdict.findings) })))
      ensureNote(builder, ctx)
    }
    if (verdict.kind === "clean") return finish(builder, ctx)

    // The approach is wrong: record what it taught, then rebuild from the
    // base in a fresh session so the next builder isn't anchored to it.
    status("rebuild", "approach " + approach + " was judged wrong")
    lessons.push(tell(builder, fill("references/lesson.md",
      Object.assign({}, ctx, { verdict: verdict.lesson || formatFindings(verdict.findings) })), { schema: Lesson }))
    if (approach === MAX_APPROACHES) break
    // Removal and recreation happen in one hold, so nothing the user
    // queued runs against a missing worktree. The old tip is kept under a
    // hidden ref, so committed work (the builder's or yours) is never lost.
    const keptAs = "refs/build-attempts/" + ctx.branch + "/" + approach
    rebuildWorktree(ctx, keptAs)
    builder = session.new({
      title: "/build approach " + (approach + 1),
      seed: fill("references/seed.md", Object.assign({}, ctx, { lessons: formatLessons(lessons) })),
    })
    workflow.focus(builder)
  }
  ask("Two rebuilds without a clean devil's advocate review. What each approach taught:\n\n" +
    formatLessons(lessons) + "\n\nThe design doc likely needs revisiting.", { options: ["ok"] })
  throw new Error("no approach passed the devil's advocate after two rebuilds")
}

// rebuildWorktree removes the worktree and recreates it from the base in
// one hold, so nothing the user queued runs against a missing worktree.
// Background jobs the run's sessions own could keep writing there, so it
// asks before stopping them.
function rebuildWorktree(ctx, keptAs) {
  const transition = () => {
    const dirty = bash("git status --porcelain --untracked-files=all --ignored", { cwd: ctx.worktree }).stdout.trim()
    if (dirty && ask("Rebuilding discards uncommitted and ignored files in " + ctx.worktree + ":\n" + dirty +
      "\n\nCommitted work is kept at " + keptAs + ".", { options: ["stop", "discard"] }) === "stop") {
      throw new Error("stopped before rebuild; " + ctx.worktree + " is untouched")
    }
    // The empty old value makes git refuse to overwrite an existing ref.
    bash("git update-ref " + q(keptAs) + " " + q(ctx.branch) + " ''", { cwd: ctx.root })
    bash("wtp remove --force --force-branch " + q(ctx.branch), { cwd: ctx.root })
    try {
      ctx.worktree = createWorktree(ctx)
    } catch (e) {
      throw new Error("couldn't recreate the worktree for " + ctx.branch + " (" + (e.stderr || e.message).trim() +
        "); the previous attempt is kept at " + keptAs)
    }
  }
  try {
    workflow.exclusive(transition)
  } catch (e) {
    if (!(e instanceof JobsRunning)) throw e
    const jobs = e.jobs.map(j => "- " + j.id + ": " + j.command).join("\n")
    if (ask("Rebuilding needs these background jobs stopped, since they may still write to " + ctx.worktree +
      ":\n" + jobs, { options: ["stop them and rebuild", "stop"] }) !== "stop them and rebuild") {
      throw new Error("stopped before rebuild; background jobs are still running")
    }
    workflow.exclusive(transition, { stopJobs: true })
  }
}

function finish(builder, ctx) {
  status("exercise", "verifying locally")
  tell(builder, fill("references/exercise.md", ctx), { skills: ["verification-before-completion"] })
  const failed = review(builder, ctx)
  status("hand over", ctx.branch)
  const description = tell(builder, fill("references/handover.md", ctx))
  let message = "Ready for your review.\n\n"
  if (failed.length > 0) message += "These reviews didn't complete: " + failed.join(", ") + "\n\n"
  message += "Worktree: " + ctx.worktree + "\nBranch: " + ctx.branch +
    "\nDraft PR description: " + ctx.note + "\n\n" + description
  if (ctx.lessons.length > 0) {
    message += "\n\nWhat earlier approaches taught (consider recording it in the design doc):\n\n" + formatLessons(ctx.lessons)
  }
  ask(message, { options: ["ok"] })
  return { outcome: "ready", branch: ctx.branch, worktree: ctx.worktree, note: ctx.note }
}

// review runs the reviewers in parallel, audits their findings, and has
// the builder fix only audited, confirmed ones. It returns the labels of
// reviewers that failed in the last pass, and throws if review gives up.
function review(builder, ctx) {
  for (let pass = 1; pass <= MAX_REVIEW_PASSES; pass++) {
    status("review", "pass " + pass + "/" + MAX_REVIEW_PASSES)
    // Reviewers read the committed diff, so the review only covers the work
    // if it's all committed and HEAD is where it was when they looked.
    requireCommitted(builder, ctx)
    const reviewedHead = head(ctx)
    const prompt = fill("references/review.md", ctx)
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
      ask("All reviewers failed:\n" + results.map((r, i) => REVIEWERS[i].label + ": " + r.error.message).join("\n"),
        { options: ["ok"] })
      throw new Error("all reviewers failed")
    }
    const raw = []
    results.forEach((r, i) => {
      if (!r.ok) return
      r.value.findings.forEach((f, j) =>
        // The script's id and reviewer are assigned last so model output
        // can't overwrite them and collapse two findings into one.
        raw.push(Object.assign({}, f, { id: REVIEWERS[i].label.toLowerCase() + "-" + (j + 1), reviewer: REVIEWERS[i].label })))
    })
    if (raw.length === 0) {
      if (unchangedSince(ctx, reviewedHead)) return failed
      continue
    }

    status("audit", raw.length + " findings")
    const audit = runAudit(ctx, raw)
    // Findings about a version that has since changed are stale either
    // way, so the pass is spent and the new version is reviewed.
    if (!unchangedSince(ctx, reviewedHead)) continue
    const byId = Object.fromEntries(raw.map(f => [f.id, f]))
    const blocking = audit.dispositions
      .filter(d => d.verdict === "confirmed" && d.severity !== "minor")
      .map(d => Object.assign({}, byId[d.id], { severity: d.severity, audit: d.reason }))
    if (blocking.length === 0) return failed

    status("fix", blocking.length + " confirmed findings")
    // The builder only ever sees audited findings.
    tell(builder, fill("references/fix.md", Object.assign({}, ctx, { findings: JSON.stringify(blocking, null, 2) })))
  }
  ask("Review still requests changes after " + MAX_REVIEW_PASSES + " passes. The work is on " +
    ctx.branch + " at " + ctx.worktree + ".", { options: ["ok"] })
  throw new Error("review still requested changes after " + MAX_REVIEW_PASSES + " passes")
}

// requireCommitted makes sure everything in the worktree is committed,
// asking the builder and then the user before giving up.
function requireCommitted(builder, ctx) {
  const uncommitted = () => bash("git status --porcelain --untracked-files=all", { cwd: ctx.worktree }).stdout.trim()
  let dirty = uncommitted()
  if (!dirty) return
  tell(builder, "These files in `" + ctx.worktree + "` aren't committed, so review wouldn't see them:\n" + dirty +
    "\n\nCommit the ones that are part of your change. Leave anything else untouched (the user may have made it); don't delete, revert or stash it. Then reply.")
  dirty = uncommitted()
  if (!dirty) return
  if (ask("Review only sees committed work, and " + ctx.worktree + " still has uncommitted changes:\n" + dirty,
    { options: ["I've committed them", "stop"] }) === "stop") {
    throw new Error("stopped before review: uncommitted changes in " + ctx.worktree)
  }
  if (uncommitted()) throw new Error("stopped before review: " + ctx.worktree + " still has uncommitted changes")
}

function head(ctx) {
  return bash("git rev-parse HEAD", { cwd: ctx.worktree }).stdout.trim()
}

// unchangedSince reports whether the worktree is still exactly what was
// reviewed: same HEAD, nothing uncommitted.
function unchangedSince(ctx, reviewedHead) {
  return head(ctx) === reviewedHead && bash("git status --porcelain --untracked-files=all", { cwd: ctx.worktree }).stdout.trim() === ""
}

// runAudit asks a fresh auditor to dispose of every finding, retrying once
// with the problem spelled out if the audit is malformed.
function runAudit(ctx, raw) {
  const prompt = fill("references/audit.md", Object.assign({}, ctx, { findings: JSON.stringify(raw, null, 2) }))
  let problem = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    const audit = agent("reviewer",
      problem ? prompt + "\n\nA previous audit of these findings was rejected: " + problem + ". Avoid that." : prompt,
      { schema: Audit, tools: READ_ONLY })
    try {
      requireValidAudit(raw, audit.dispositions)
      return audit
    } catch (e) {
      problem = e.message
    }
  }
  throw new Error("audit still invalid after a retry: " + problem)
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
  for (const d of dispositions) resolveDisposition(d, byId)
}

// resolveDisposition follows duplicateOf links to the confirmed or
// rejected finding they end at.
function resolveDisposition(d, byId) {
  const seen = new Set()
  while (d.verdict === "duplicate") {
    if (seen.has(d.id)) throw new Error("audit has a duplicate cycle through " + d.id)
    seen.add(d.id)
    const target = byId[d.duplicateOf]
    if (!target) throw new Error("audit marks " + d.id + " a duplicate of unknown finding " + d.duplicateOf)
    d = target
  }
  return d
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
    docPath = isAbsolute(raw) ? raw : root + "/" + raw
  }
  const base = bash("git rev-parse --abbrev-ref HEAD", { cwd: root }).stdout.trim()
  const slug = slugFor(docPath || raw)
  let branch = "feat/" + slug
  for (let n = 2; branchTaken(root, branch); n++) {
    branch = "feat/" + slug + "-" + n
  }
  return {
    root,
    base,
    branch,
    docPath,
    doc: docPath ? "the design doc at `" + docPath + "` (read it first)" : "this request:\n\n" + raw,
  }
}

// branchTaken reports whether branch exists or still has attempts kept
// from an earlier /build, which a new run must not mix with its own.
function branchTaken(root, branch) {
  return bash("git show-ref --verify --quiet refs/heads/" + q(branch), { cwd: root, check: false }).exitCode === 0 ||
    bash("git for-each-ref --count=1 " + q("refs/build-attempts/" + branch + "/"), { cwd: root }).stdout.trim() !== ""
}

// isAbsolute recognises POSIX, drive-letter and UNC paths.
function isAbsolute(path) {
  return /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(path)
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
  tell(builder, "You didn't write the build note. Write it now to `" + ctx.note + "`, covering assumptions, decisions, rejected options, unsure and verified.")
  readFile(ctx.note)
}

// tell sends the builder a turn with the build's boundaries attached, so
// they survive compaction and reach every session, including rebuilds.
function tell(builder, prompt, opts) {
  return builder.turn(prompt + "\n\n" + reference("references/boundaries.md"), opts)
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
