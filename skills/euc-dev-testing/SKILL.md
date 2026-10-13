---
name: euc-dev-testing
description: What is possible, impossible, cheap and expensive when testing a change in Eucalyptus's shared dev environment, what the agent may change there, and how to report what was tested. Use when choosing between local and shared-dev verification for a Eucalyptus change, verifying a change in dev, planning dev smoke tests, building dev test fixtures (test patients, orders, prescriptions), triggering jobs or calling services in dev, or deciding whether a dev test is worth its cost.
---

# Eucalyptus Dev Testing

Dev testing means exercising a deployed change in the shared dev environment (GKE `euc-clusters-dev`, project `euc-services-dev`, LaunchDarkly env `test`) rather than in local tests. It catches wiring, config, infra and vendor-contract failures that local tests miss, and in past sessions it found real bugs. It is also slow, shared with every other engineer, and full of setup traps.

Do the cheap checks freely. Spend on expensive checks only where they buy real confidence: a popular path (checkout, prescribing, orders for big brands), a path likely to break (new wiring, new infra, new vendor contract, a schema or proto change, timezone and date logic), or a path where a bug would hurt patients or other brands. Anything else gets unit or integration tests plus an explicit "not dev tested" line.

## Permissions

An **own fixture** is a synthetic record created for this task, or one the user has confirmed is theirs. A test account you merely found is not yours, and neither is a brand: every brand is shared.

| Action | Rule |
|---|---|
| Read-only calls (gRPC reads, `dryRun` RPCs, SQL in a read-only transaction, logs, flags, configmaps) | Go ahead. Check the method is actually read-only in code; a `Get` name proves nothing |
| Reversible writes to own fixtures (DB update in a transaction with a row-count check, RPC update, LD individual targeting for that customer) | Go ahead, and restore afterwards when practical |
| Triggering a job or publishing a message | Go ahead only after confirming in code that every consumer limits its work to own fixtures. A `brand` attribute is not proof of isolation |
| Brand-wide jobs, sweeps, redrives, fan-out, or unknown consumer scope | Discuss first, and draft a Slack heads-up for the user to send |
| Anything touching a colleague's test account or fixture | Discuss first |
| Shared config: LD variations (not individual targets), the SMS allowlist, configmaps, subscriptions | Discuss first |
| Anything that sends a message or moves money, beyond Stripe test mode | Discuss first unless the recipient is controlled (see Notifications) |
| Third-party sandboxes (IMA, Delonia, Shipmate and others) | Probes are fine. Create as few vendor users and orders as possible, and list what you created |
| Prod, in any form | Never without discussing first. Default: write the exact command or SQL (read-only where possible, with a PAM justification) for the user to run |

## Notifications

Dev can message real people, so every test identity must be one we control.

| Channel | Dev behaviour |
|---|---|
| Email (SendGrid) | Not gated. Dev sends to any address, using the real brand sender addresses. Use only `first.last+<tag>@eucalyptus.vc` |
| SMS (Twilio) | Dropped unless the number is on the LD allowlist `cfg_non_production_sms_allowed_recipients`. Dev shares Twilio accounts with prod, so the allowlist is the only barrier. Never add a number you don't control |
| Push (Expo) | Only reaches devices that registered a token against dev |
| Customer.io | The engine sends events through Segment with Customer.io enabled and no environment check. Whether dev routes to a workspace that sends is unknown, so assume it does |

Never invent random phone numbers or emails: a random value can belong to a real person.

## Cost Guide

These were observed in past sessions. Re-check anything that matters (access, flags, vendor capabilities) rather than trusting it.

### Cheap: do these by default

- Confirm what is deployed before testing anything: compare the image tag on the deployment with the merge. Merged is not deployed.
- Call a service's gRPC with `grpcurl` through `eucli proxy svc` or `kubectl port-forward`. Most services expose reflection, so `list` and `describe` show the deployed contract.
- `dryRun: true` write RPCs (for example `PrescribeSequence`), after checking in code that the dry run stops before side effects. Run across brands and regions if the change is brand- or timezone-sensitive.
- Find fixtures through the service's own read RPCs or read-only SQL instead of asking the user.
- Read LD flags with the LaunchDarkly MCP (project `default`, env `test` for dev).
- Datadog before/after: errors by `version`, handler completion messages, trace metrics for counts.

### Expensive: only when the path is popular or risky

- New test patients. eng-bot `/test-user` runs only from Slack, so the user has to run it. Ask for the fewest fixtures that cover the scenarios.
- Flows that need a human login: doctors-ui (needs a prescriber test login), admins-ui (Google SSO in a headed browser the user logs into), patient frontend purchases.
- Forcing state: backdating date columns, stalling a flow with LD individual targeting, Stripe decline cards, `eucli set-consignment-status` for vendors it supports.
- Vendor-driven states, where only the vendor can advance them (IMA). Prepare a ranked list with a pass criterion per step, and cap setup time.
- Waiting on schedulers or a backlogged subscription. Trigger by hand when the permissions table allows it.
- Cross-brand regression sweeps across every dev cluster. Only worth it when there's a plausible way the change reaches other brands.
- Proving that something did not happen. Spans are sampled, failed consumers often ack silently, and the data lake lags, so absence of evidence is weak.
- Fault injection (lost responses, publish failures, races). Do it locally or on a throwaway DB, never on the shared dev service.

### Not possible for the agent

- Re-authenticating `gcloud`, `bq`, `kubectl` or an MCP. Ask the user to run `gcloud auth login` (or renew the MCP) and wait.
- Anything that needs SSO, an emailed code, Slack (eng-bot), or an interactive prompt.
- Testing branch code before it is deployed to dev.
- Test users or orders in prod with vendors that forbid them (IMA, Delonia).

Access limits seen so far (dev RBAC denied `kubectl exec`, secrets and `helm list`; the LD MCP can't edit variation values) may change. Try once, and stop if denied.

## Procedure

1. **Plan within a budget.** For each material risk, including "could this break other brands?", name the cheapest check that would tell pass from fail, its pass criterion, and a rough setup budget. Mark the rest unit-test-only up front. When a budget runs out, stop and discuss rather than grinding on.
2. **Preflight.** Is gcloud auth live? Is the change deployed? Which flags gate the path in dev, and do they match prod? Dev often has flags on that prod doesn't.
3. **Prove the new code ran.** Show the operation executed on the deployed version (logs or spans tagged with the version, a timestamp after the rollout). Use a fresh fixture when the behaviour under test happens at creation time; existing fixtures are fine for paths that act on existing records.
4. **Predict, then trigger.** For jobs and sweeps, run the selection query read-only first, write down the expected outcome per row, then trigger once and compare.
5. **Restore** anything you changed on a fixture, and stop background port-forwards and proxies.
6. **Report** as below.

## Reporting

State exactly what ran, against what, and what it proves:

- Environment, fixture IDs, deployed version, and whether each step hit the real service, a vendor sandbox, a vendor bypass (direct DB or `eucli` writes), or a mock.
- Per scenario: `PASS`, `FAIL`, `BLOCKED` or `NOT RUN`. An HTTP 200, an idempotent repeat of an existing call, or a skipped live subtest is not a pass.
- A "Not dev tested" list with the reason (unreachable, too costly for the risk, needs the vendor or a human login) and what covers it instead.
- An honest confidence statement. Don't round partial coverage up to "tested".

## References

- [references/techniques.md](references/techniques.md): commands for proxies, gRPC, DB, Pub/Sub, fixtures, vendors, Datadog, LD, logs and UI driving.
- [references/gotchas.md](references/gotchas.md): environment traps that cost past sessions time.
