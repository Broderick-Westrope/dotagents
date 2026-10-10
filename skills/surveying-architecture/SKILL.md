---
name: surveying-architecture
description: "Surveys an existing codebase, or one area of it, for structural problems and produces a ranked, evidence-backed report of improvement candidates, then helps the user pick one to design. Run from the /survey-architecture command."
unlisted: true
---

# Surveying Architecture

A survey finds where the structure of existing code is costing the most, and ranks it. It is not a rescue. It proposes no new surfaces or interface types and changes no code. The output is a short list of candidates the user can pick from, each backed by evidence they can check.

Load the **codebase-design** skill for the checklist, and **go-style** when the code is Go.

## Steps

```
Survey progress:
- [ ] 1. Scope
- [ ] 2. Find hotspots
- [ ] 3. Explore
- [ ] 4. Verify and rank
- [ ] 5. Write the report
- [ ] 6. Pick a candidate
```

### 1. Scope

Survey one area, not the whole repo. If the user named a path, package or subsystem, use it. Otherwise propose two or three areas from step 2 and ask which.

Before exploring, read the repo's own guidance (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, design docs and ADRs, lint config). A pattern the repo documents on purpose is not a finding.

If the repo is a fork, find out which code the user owns. Restructuring upstream-owned files makes every future upstream sync harder, so survey them only if the user asks. Check with `git log --format='%an' -- <path> | sort | uniq -c | sort -rn`.

### 2. Find Hotspots

Structure costs the most where code is both large and often changed. Run these from the repo root, adjusting the file glob to the language:

```bash
# Files changed most in the last six months.
git log --since='6 months ago' --name-only --format= -- '*.go' ':!*_test.go' | sort | uniq -c | sort -rn | head -30

# Largest source files.
git ls-files '*.go' ':!*_test.go' | xargs wc -l | sort -rn | head -30

# Pairs of files that keep changing together (shotgun surgery candidates).
git log --since='6 months ago' --name-only --format='format:COMMIT' -- '*.go' ':!*_test.go' \
  | awk '$0=="COMMIT"{for(i in f)for(j in f)if(i<j)print i, j; delete f; next} NF{f[$0]=1} END{for(i in f)for(j in f)if(i<j)print i, j}' \
  | sort | uniq -c | sort -rn | head -20
```

Skip generated files (sqlc output, protobuf, mocks) and vendored code. The intersection of the first two lists is where to start.

### 3. Explore

Split the scoped area into two to four parts and dispatch one **explorer** per part, in parallel. Give each explorer:

- The paths to cover and the hotspot files inside them.
- The flag names from **codebase-design**, and the instruction to report each finding as: flag name, `file:line`, the evidence (callers, duplicates, commit counts), and the one-sentence cost.
- The import direction to check: which packages import which, and any that point the wrong way.
- An instruction to note friction as they go: places where answering "where does X come from" means opening more than three files, or holding several pieces of state at once.

Explorers return a map, not file contents. You do the judging.

### 4. Verify and Rank

Check every candidate yourself before it goes in the report. Explorer findings are leads.

1. Open the cited lines and confirm the flag holds.
2. Run the deletion test and write down what callers would lose.
3. Group findings that share a root cause into one candidate. Five pass-throughs on the same chain are one candidate, not five.
4. Rate each candidate:
   - **Strong:** clear evidence in several places, and the fix removes code or layers.
   - **Worth exploring:** real friction, but the right shape isn't obvious yet.
   - **Speculative:** a smell with little evidence of cost so far.

Drop anything you can't back with `file:line`. Keep the list short: five strong candidates beat twenty mixed ones.

### 5. Write the Report

Save it where the repo keeps design and analysis docs (check `plans/` and `docs/`), following the repo's file naming. If there's no such place, ask. Use this shape:

```markdown
# Architecture Survey: <area>

**Scope:** <paths surveyed, and what was left out and why>
**Method:** <hotspot window, number of explorers, date>

## Top Recommendation

<One candidate, why it comes first, and what it unlocks.>

## Candidates

### 1. <Short name> (Strong | Worth exploring | Speculative)

- **Flags:** <names from codebase-design>
- **Evidence:** <file:line references, counts>
- **Cost today:** <what is harder because of it>
- **Deletion test:** <what callers would lose>
- **Direction:** <the kind of change, e.g. "collapse the forwarding layer", not a new surface or interface type>

## Rules Worth Enforcing

<Flags that recur across candidates and could be a lint rule or test instead of prose, e.g. a depguard rule for an import direction.>

## Not Findings

<Things that looked wrong but are deliberate, with the doc or reason.>
```

Name the direction, not the design. Proposing surfaces or interface types before the user has picked a candidate anchors everyone to the first idea.

### 6. Pick a Candidate

Show the user the top recommendation and the list, and ask which to pursue, if any. Then:

- For a candidate that needs a design (a new shape, a moved boundary), use the **grilling** skill to write a design doc, then `/build`.
- For a contained cleanup (inline a pass-through, delete a duplicate), use the **refactoring-code** skill.
- When the survey turned up names that mean different things in different places, or a decision worth recording, use the **domain-modeling** skill.
- For each entry under "Rules Worth Enforcing", offer to add the check.

## Done When

- Every candidate in the report has a flag name, `file:line` evidence you have re-read, and a one-sentence cost.
- The report is saved and its path given to the user.
- The user has picked a candidate or parked the report.
