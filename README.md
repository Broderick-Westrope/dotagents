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
| [/commit](anvil/commands/commit/COMMAND.md)                 | Create a well-formatted git commit                                 |
| [/deps](anvil/commands/deps/COMMAND.md)                     | Audit and upgrade dependencies                                     |
| [/fix-issue](anvil/commands/fix-issue/COMMAND.md)           | Fix a GitHub issue by number                                       |
| [/pr](anvil/commands/pr/COMMAND.md)                         | Create a pull request with auto-generated description              |
| [/document](anvil/commands/document/COMMAND.md)             | Create or improve documentation                                    |
| [/draft-tsd](anvil/commands/draft-tsd/COMMAND.md)           | Draft a technical specification from rough ideas or topics         |
| [/grill](anvil/commands/grill/COMMAND.md)                   | Think through a feature before planning                            |
| [/plan](anvil/commands/plan/COMMAND.md)                     | Create a detailed implementation plan                              |
| [/scaffold-tests](anvil/commands/scaffold-tests/COMMAND.md) | Generate failing tests from an implementation plan                 |
| [/execute](anvil/commands/execute/COMMAND.md)               | Execute an implementation plan from the plans folder               |
| [/init](anvil/commands/init/COMMAND.md)                     | Initialize or audit a repository's agent configuration             |
| [/audit-context](anvil/commands/audit-context/COMMAND.md)   | Identify knowledge gaps in project context and collect human input |
| [/post-mortem](anvil/commands/post-mortem/COMMAND.md)       | Review a session to assess execution and extract improvements      |
| [/wtp-pruning](anvil/commands/wtp-pruning/COMMAND.md)       | Classify wtp worktrees and flag the stale ones                     |

### Skills

Reusable development patterns:

**Testing & Quality:**

| Skill                                                                                | Description                                              |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| [writing-tests](skills/writing-tests/SKILL.md)                                       | Testing Trophy methodology, behavior-focused tests       |
| [test-driven-development](skills/test-driven-development/SKILL.md)                   | RED-GREEN-REFACTOR workflow discipline                   |
| [verification-before-completion](skills/verification-before-completion/SKILL.md)     | Verify before claiming success                           |
| [preflight-checks](skills/preflight-checks/SKILL.md)                                 | Auto-detect and run project linters/formatters/checkers  |

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
| [optimizing-performance](skills/optimizing-performance/SKILL.md)     | Measurement-driven optimization                             |
| [handling-errors](skills/handling-errors/SKILL.md)                   | Error handling best practices                               |
| [migrating-code](skills/migrating-code/SKILL.md)                     | Safe migration patterns for databases, APIs, and frameworks |

**Planning & Execution:**

| Skill                                                                | Description                                                      |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [grilling](skills/grilling/SKILL.md)                                 | Interview and design exploration, adapts to the user's clarity   |
| [planning-products](skills/planning-products/SKILL.md)               | Product feature definition from a PM perspective                 |
| [writing-plans](skills/writing-plans/SKILL.md)                       | Create implementation plans with devils-advocate review          |
| [executing-plans](skills/executing-plans/SKILL.md)                   | Execute plans with mandatory code review                         |
| [scaffolding-plan-tests](skills/scaffolding-plan-tests/SKILL.md)     | Translate plans into failing test files before coding            |
| [architecting-systems](skills/architecting-systems/SKILL.md)         | Clean, scalable system architecture for the build phase          |
| [design](skills/design/SKILL.md)                                     | Frontend design skill                                            |
| [onboarding-systems](skills/onboarding-systems/SKILL.md)             | Guided onboarding into complex microservices                     |

**Documentation & Writing:**

| Skill                                                    | Description                                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [writer](skills/writer/SKILL.md)                         | Writing style guide with 7 personas (Architect, Engineer, PM, Marketer, Educator, Contributor, UX Writer) |
| [strategy-writer](skills/strategy-writer/SKILL.md)       | Executive-quality strategic documents in Economist/HBR style                                              |
| [documentation](skills/documentation/SKILL.md)           | Route to the right documentation approach (code comments, system docs, templates)                         |
| [drafting-tsds](skills/drafting-tsds/SKILL.md)           | Structured TSDs that evaluate architectural options                                                       |

**Data & Infrastructure:**

| Skill                                                    | Description                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| [managing-databases](skills/managing-databases/SKILL.md) | PostgreSQL, DuckDB, Parquet, and PGVector architecture              |
| [managing-pipelines](skills/managing-pipelines/SKILL.md) | GitHub Actions CI/CD security, performance, and deployment patterns |
| [writing-sql](skills/writing-sql/SKILL.md)               | SQL best practices and query optimization                           |

**Git & Code Review Workflow:**

| Skill                                                                              | Description                                                  |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [using-git-worktrees](skills/using-git-worktrees/SKILL.md)                         | Isolated git worktrees for feature development               |
| [finishing-a-development-branch](skills/finishing-a-development-branch/SKILL.md)   | Structured merge, PR, or cleanup when implementation is done |
| [receiving-code-review](skills/receiving-code-review/SKILL.md)                     | Evaluate and respond to code review feedback                 |

**Meta Skills:**

| Skill                                                              | Description                                          |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| [visualizing-with-mermaid](skills/visualizing-with-mermaid/SKILL.md) | Create professional technical diagrams             |
| [visualizing-topics](skills/visualizing-topics/SKILL.md)           | Build interactive HTML visualizations with animation |
| [post-mortem](skills/post-mortem/SKILL.md)                         | Review sessions to extract actionable improvements   |
| [mining-corrections](skills/mining-corrections/SKILL.md)           | Mine past sessions for repeated corrections into a ledger |

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

The root `anvil-plugin.json` points Anvil at `skills/`, `anvil/commands/`, and `anvil/agents/`. Names are bare by default (e.g. `/commit`, `@oracle`); the `ce:` prefix is only added if there's a naming collision with a higher-priority source.

See [ANVIL.md](ANVIL.md) for the full plugin format reference.

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
# Fix issues, then:
/commit
```

**Plan and build a feature:**

```bash
/grill
/plan
/execute
```

**Clean up legacy code:**

```bash
/explain src/legacy/payment-processor.js
/refactor src/legacy/payment-processor.js
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
├── plans/              # Implementation plans
└── assets/
```

## Resources

- [Anvil](https://github.com/Broderick-Westrope/anvil)
- [Claude API Docs](https://docs.anthropic.com/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## License

MIT - Use it, share it, make it better.
