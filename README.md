# dotagents

Personal commands, skills, and specialist agents for AI coding harnesses, like dotfiles for agents. The prompts are meant to outlast any particular harness; harness-specific wiring lives in its own folder (currently `anvil/` for [Anvil](https://github.com/Broderick-Westrope/anvil)).

NOTE: This is a fork, to customise my workflow. All credit for the original files goes to https://github.com/rileyhilliard

<img src="/assets/hackerman.gif" width="100%" alt="hackerman">

## What's Included

### Commands

Quick workflows for everyday development tasks:

| Command                                                     | Description                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| [/test](anvil/commands/test/COMMAND.md)                     | Run tests and analyze failures                                     |
| [/explain](anvil/commands/explain/COMMAND.md)               | Break down code or concepts                                        |
| [/debug](anvil/commands/debug/COMMAND.md)                   | Start a systematic debugging session                               |
| [/optimize](anvil/commands/optimize/COMMAND.md)             | Find and fix performance issues                                    |
| [/refactor](anvil/commands/refactor/COMMAND.md)             | Refactor code following best practices                             |
| [/review](anvil/commands/review/COMMAND.md)                 | Multi-model code review with deduplicated findings                 |
| [/review-with-me](anvil/commands/review-with-me/COMMAND.md) | Interactive review where the human drives and AI provides context  |
| [/review-guide](anvil/commands/review-guide/COMMAND.md)     | Write a REVIEW_GUIDE.md that explains a change and orders its files |
| [/fix-issue](anvil/commands/fix-issue/COMMAND.md)           | Fix a GitHub issue by number                                       |
| [/document](anvil/commands/document/COMMAND.md)             | Create or improve documentation                                    |
| [/grill](anvil/commands/grill/COMMAND.md)                   | Think through a feature and write a design doc                     |
| [/build](anvil/commands/build/COMMAND.md)                   | Build an early version, then challenge and review the diff         |
| [/build-prose](anvil/commands/build-prose/COMMAND.md)       | Agent-led /build without the workflow script, as a fallback        |
| [/audit-context](anvil/commands/audit-context/COMMAND.md)   | Identify knowledge gaps in project context and collect human input |
| [/post-mortem](anvil/commands/post-mortem/COMMAND.md)       | Review a session to assess execution and extract improvements      |
| [/wtp-pruning](anvil/commands/wtp-pruning/COMMAND.md)       | Classify wtp worktrees and flag the stale ones                     |
| [/survey-architecture](anvil/commands/survey-architecture/COMMAND.md) | Rank structural problems in existing code with evidence  |

### Skills

Reusable development patterns:

**Testing & Quality:**

| Skill                                                                                | Description                                              |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| [writing-tests](skills/writing-tests/SKILL.md)                                       | Testing Trophy methodology, behavior-focused tests       |
| [verification-before-completion](skills/verification-before-completion/SKILL.md)     | Verify before claiming success                           |
| [euc-dev-testing](skills/euc-dev-testing/SKILL.md)                                   | What's possible, cheap and worth it in Eucalyptus dev    |

**Debugging & Problem Solving:**

| Skill                                                                  | Description                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------- |
| [systematic-debugging](skills/systematic-debugging/SKILL.md)           | Four-phase debugging framework                       |
| [debugging-report](skills/debugging-report/SKILL.md)                   | Structured write-up of a debugging investigation     |
| [fixing-flaky-tests](skills/fixing-flaky-tests/SKILL.md)               | Diagnose and fix tests that fail concurrently        |
| [condition-based-waiting](skills/condition-based-waiting/SKILL.md)     | Replace race conditions with polling                 |
| [reading-logs](skills/reading-logs/SKILL.md)                           | Efficient log analysis using targeted search         |

**Code Quality:**

| Skill                                                                | Description                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| [refactoring-code](skills/refactoring-code/SKILL.md)                 | Behavior-preserving code improvements                       |
| [go-style](skills/go-style/SKILL.md)                                 | Go package depth, extraction, interface types, errors, tests |
| [codebase-design](skills/codebase-design/SKILL.md)                   | Unlisted. Red flags, review severity and design comparison (Ousterhout, Fowler, Feathers) |
| [surveying-architecture](skills/surveying-architecture/SKILL.md)     | Unlisted. Procedure behind `/survey-architecture`            |
| [optimizing-performance](skills/optimizing-performance/SKILL.md)     | Measurement-driven optimization                             |
| [handling-errors](skills/handling-errors/SKILL.md)                   | Error handling best practices                               |
| [migrating-code](skills/migrating-code/SKILL.md)                     | Safe migration patterns for databases, APIs, and frameworks |

**Design & Building:**

| Skill                                                                | Description                                                      |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [grilling](skills/grilling/SKILL.md)                                 | Interview and design exploration, adapts to the user's clarity   |
| [planning-products](skills/planning-products/SKILL.md)               | Product feature definition from a PM perspective                 |
| [architecting-systems](skills/architecting-systems/SKILL.md)         | Clean, scalable system architecture for the build phase          |
| [domain-modeling](skills/domain-modeling/SKILL.md)                   | Keep a GLOSSARY.md and ADRs so names and decisions stay consistent |
| [design](skills/design/SKILL.md)                                     | Frontend design skill                                            |
| [onboarding-systems](skills/onboarding-systems/SKILL.md)             | Guided onboarding into complex microservices                     |

**Documentation & Writing:**

| Skill                                                    | Description                                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [writer](skills/writer/SKILL.md)                         | Writing style guide with 7 personas (Architect, Engineer, PM, Marketer, Educator, Contributor, UX Writer) |
| [strategy-writer](skills/strategy-writer/SKILL.md)       | Executive-quality strategic documents in Economist/HBR style                                              |
| [documentation](skills/documentation/SKILL.md)           | Route to the right documentation approach (code comments, system docs, templates)                         |

**Data & Infrastructure:**

| Skill                                                    | Description                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| [managing-databases](skills/managing-databases/SKILL.md) | PostgreSQL, DuckDB, Parquet, and PGVector architecture              |
| [managing-pipelines](skills/managing-pipelines/SKILL.md) | GitHub Actions CI/CD security, performance, and deployment patterns |
| [writing-sql](skills/writing-sql/SKILL.md)               | SQL best practices and query optimization                           |

**Git & Code Review Workflow:**

These are intended to be complementary to the Anvil builtin skills.

| Skill                                                                              | Description                                                  |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [receiving-code-review](skills/receiving-code-review/SKILL.md)                     | Evaluate and respond to code review feedback                 |

**Meta Skills:**

| Skill                                                              | Description                                          |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| [visualizing-with-mermaid](skills/visualizing-with-mermaid/SKILL.md) | Create professional technical diagrams             |
| [visualizing-topics](skills/visualizing-topics/SKILL.md)           | Build interactive HTML visualizations with animation |
| [post-mortem](skills/post-mortem/SKILL.md)                         | Review sessions to extract actionable improvements   |
| [mining-corrections](skills/mining-corrections/SKILL.md)           | Mine past sessions for repeated corrections into a ledger |
| [writing-for-agents](skills/writing-for-agents/SKILL.md)           | Write skills, commands, agents and memory files (adapted from [mattpocock/skills](https://github.com/mattpocock/skills), MIT) |

### Agents

Specialists the Anvil orchestrator delegates to:

| Agent                                                        | Description                                              |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| [@oracle](anvil/agents/oracle.md)                            | Strategic advisor for high-stakes decisions and hard bugs |
| [@explorer](anvil/agents/explorer.md)                        | Fast codebase search and pattern matching                |
| [@librarian](anvil/agents/librarian.md)                      | External documentation and library research              |
| [@designer](anvil/agents/designer.md)                        | UI/UX specialist for polished user experiences           |
| [@fixer](anvil/agents/fixer.md)                              | Fast, bounded implementation                             |
| [@planner](anvil/agents/planner.md)                          | Feature planning and spec writing                        |
| [@tester](anvil/agents/tester.md)                            | Test strategy, analysis, and planning                    |
| [@reviewer](anvil/agents/reviewer.md)                        | Comprehensive code and PR review                         |
| [@convention-reviewer](anvil/agents/convention-reviewer.md)  | Convention compliance review                             |
| [@devils-advocate](anvil/agents/devils-advocate.md)          | Rigorous critique of specs, plans, and designs           |

---

## Installation

Add the plugin to your `anvil.json`:

```jsonc
{
  "plugins": [
    {"path": "~/path/to/dotagents"}
  ]
}
```

The root `anvil-plugin.json` points Anvil at `skills/`, `anvil/commands/`, and `anvil/agents/`. Names are bare by default (e.g. `/review`, `@oracle`); the `ce:` prefix is only added if there's a naming collision with a higher-priority source.

### Verify Installation

```bash
/explain README.md
@reviewer
```

---

## Usage Examples

**Fix failing tests:**

```bash
/test
# If complex, escalate:
/debug
```

**Review before merge:**

```bash
/review
```

**Design and build a feature:**

```bash
/grill     # design doc; build now or park it
/build     # early version, build note, devils-advocate, cleanup, review
```

**Clean up legacy code:**

```bash
/survey-architecture internal/agent   # ranked candidates with evidence
/refactor internal/agent/agent.go     # act on one candidate
```

### Commands vs Skills vs Agents

- **Commands** (`/test`, `/review`) are quick shortcuts for routine tasks
- **Skills** (`writing-tests`) are reusable workflows that guide specific development patterns
- **Agents** (`@oracle`, `@fixer`) are specialists the orchestrator delegates to

## Project Structure

```
dotagents/
├── anvil-plugin.json   # Anvil plugin manifest
├── anvil/
│   ├── commands/       # Slash commands (<name>/COMMAND.md)
│   └── agents/         # Specialist agents
├── skills/             # Skills (<name>/SKILL.md)
├── plans/              # Design docs
└── assets/
```

A command is usually just a `COMMAND.md` prompt. A command that runs as an Anvil workflow, like `/build`, adds a `workflow.js` script (named in its `COMMAND.md` front matter), with a `README.md` describing what it enforces and Node tests alongside. Run `/build`'s tests with `cd anvil/commands/build && node --test`.

## Resources

- [Anvil](https://github.com/Broderick-Westrope/anvil)
- [Claude API Docs](https://docs.anthropic.com/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## License

MIT - Use it, share it, make it better.
