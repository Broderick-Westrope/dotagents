---
name: euc-dev-testing
description: What is possible, impossible, cheap and expensive when testing a change in Eucalyptus's shared dev environment, what the agent may change there, and how to report what was tested. Use when verifying a Eucalyptus change in dev, planning dev smoke tests, building dev test fixtures (test patients, orders, prescriptions), triggering jobs or calling services in dev, or deciding whether a dev test is worth its cost.
---

# Eucalyptus Dev Testing

Dev testing means exercising a deployed change in the shared dev environment (GKE `euc-clusters-dev`, project `euc-services-dev`, LaunchDarkly env `test`) rather than in local tests. It is the only way to catch wiring, config, infra and vendor-contract bugs, and in past sessions it found real ones. It is also slow, shared with every other engineer, and full of setup traps.

Do the cheap checks freely. Do expensive checks only where they buy real confidence: a popular path (checkout, prescribing, orders for big brands), a path likely to break (new wiring, new infra, new vendor contract, a schema or proto change, timezone and date logic), or a path where a bug would hurt patients or other brands. Anything else gets unit or integration tests plus an explicit "not dev tested" line.

## Permissions

| Target | Rule |
|---|---|
| Read-only calls anywhere in dev (gRPC reads, `dryRun` RPCs, SQL in a read-only transaction, logs, flags, configmaps) | Go ahead |
| Reversible writes to fixtures the user or agent created (DB tweak in a transaction with a row-count check, RPC update, LD individual targeting for that customer) | Go ahead, restore afterwards when practical |
| Triggering a job scoped to our own fixture or brand | Go ahead |
| Anything that touches a colleague's test account or fixture, or a job/sweep that acts on everyone's data | Discuss first, and draft a Slack heads-up for the user to send |
| Shared config: LD variations (not individual targets), configmaps, catalogue flags, subscriptions | Discuss first |
| Prod, in any form | Never without discussing first. Default: write the exact command or SQL (read-only where possible, with a PAM justification) and let the user run it |
| Third-party sandboxes (IMA, Delonia, Stripe test mode) | Fine for probes; create as few vendor users and orders as possible, and say what you created |

Never print credentials. `eucli proxy db` puts a connection string with the password on the clipboard; use `psql "$(pbpaste)"` and never echo it.

## Cost Guide

### Cheap: do these by default

- Confirm what is actually deployed before testing anything: the image tag on the deployment, compared to the merge. Merged is not deployed, and dev only runs `main`.
- Call a service's gRPC with `grpcurl` through `eucli proxy svc` or `kubectl port-forward`. Reflection is on, so `list` and `describe` show the deployed contract.
- `dryRun: true` write RPCs (for example `PrescribeSequence`), across brands and regions if the change is brand- or timezone-sensitive.
- Find fixtures through the service's own read RPCs or read-only SQL instead of asking the user.
- Read-only SQL through `eucli proxy db` in `begin read only; ... rollback;`.
- Read LD flags with the LaunchDarkly MCP, project `default`, env `test` for dev.
- Trigger a scheduled job by publishing to its topic instead of waiting for cron.
- Datadog before/after: errors by `version`, handler completion messages, trace metrics for counts.
- Cross-brand regression sweep: deployments ready and not restarting across dev clusters, no new DLQ messages, error delta flat.

### Expensive: only when the path is popular or risky

- New test patients. eng-bot `/test-user <brand> <stage> [PICKUP|HOME_DELIVERY]` runs only from Slack, so the user has to run it. Ask for the fewest fixtures that cover the scenarios.
- Flows that need a human login: doctors-ui (needs a prescriber test login), admins-ui (Google SSO in a headed `agent-browser` window the user logs into), patient frontend purchases.
- Forcing state: backdating date columns, stalling a flow with LD individual targeting, Stripe decline cards.
- Vendor-driven states (IMA order progression, shipping, delivery). These need the vendor live. Prepare a ranked list with a pass criterion per step, and cap setup time.
- Waiting on schedulers (30-minute release ticks, 5-minute sweeps, "Refill now" adds 30 minutes) or a backlogged subscription.
- Proving that something did not happen. Spans are sampled, failed consumers often ack silently, and the data lake lags 30 to 90 minutes, so absence of evidence is weak.
- Fault injection (lost responses, publish failures, races). Do it locally or on a throwaway DB, never on the shared dev service.

### Impossible or blocked: don't try

- Re-authenticating `gcloud`, `bq`, `kubectl` or an MCP. Ask the user to run `gcloud auth login` (or renew the MCP) and wait.
- `kubectl exec`, reading secrets, `helm list`. Read configmaps and deployment specs instead.
- Testing branch code in dev before it is merged and deployed.
- Running eng-bot, interactive `eucli` prompts (`eucli pubsub provision`, `eucli proxy` without `-i`/`-r`), or anything needing SSO or an emailed code.
- Editing an LD variation's value through the MCP; that needs the LD UI.
- Moving vendor-side state ourselves; the vendor has to do it.
- Test users or orders in prod with vendors that forbid them (IMA, Delonia).

## Procedure

1. **Decide scope.** List the risky and popular paths the change touches, plus "could this break other brands?". Pick the cheapest check that proves each. Mark the rest unit-test-only up front instead of discovering it at the end.
2. **Preflight.** Is gcloud auth live? Is the change deployed (image tag)? Which flags gate the path in dev, and do they match prod? Dev often has flags on that prod doesn't.
3. **Check the fixture's vintage.** A record created before the deploy doesn't exercise the new code. Create or find one dated after it.
4. **Predict, then trigger.** For jobs and sweeps, run the selection query read-only first, write down the expected outcome per row, then trigger once and compare.
5. **Restore** anything you changed on a fixture, and stop background port-forwards and proxies.
6. **Report** as below.

## Reporting

State exactly what ran, against what, and what it proves:

- Environment, fixture IDs, deployed version, and whether each step hit the real service, a vendor sandbox, or a mock.
- Per scenario: `PASS`, `FAIL`, `BLOCKED` or `NOT RUN`. An HTTP 200, an idempotent repeat of an existing call, or a skipped live subtest is not a pass.
- A "Not dev tested" list with the reason (unreachable, too costly for the risk, needs the vendor or a human login) and what covers it instead.
- An honest confidence statement. Don't round partial coverage up to "tested".

## References

- [references/techniques.md](references/techniques.md): commands for proxies, gRPC, DB, Pub/Sub, Datadog, LD, logs and UI driving.
- [references/gotchas.md](references/gotchas.md): environment traps that cost past sessions time.
