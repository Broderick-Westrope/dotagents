# Dev Testing Gotchas

Traps that cost past sessions time, grouped by where they bite.

## Auth and Access

- Expired gcloud auth makes `kubectl`, `gcloud`, `bq` and `eucli` all fail with generic errors (`gke-gcloud-auth-plugin failed`, "Reauthentication failed ... cannot prompt"). Ask the user to run `gcloud auth login`; application-default credentials sometimes still work meanwhile.
- MCP auth (Datadog, Notion, Sigma) also expires and needs the user.
- `eucli proxy` prompts when an argument is missing and then hangs in the background. Always pass `-e`, `-r`, `-i`/`-n` and `-p`.
- Dev RBAC allows configmaps, not secrets. You can compare service IDs and URLs, not keys.
- `.env` files: an inline comment after a quoted value becomes part of the value and gives a 401.

## Deploys and Versions

- Merged is not deployed. A merge produces a tag, then an `app-deployments` bump; dev can be a release behind for a while. Check the image tag.
- Local checkouts and the code index can both be stale. Check `gh pr view` or the deployed tag, not the index, for "is this live?".
- A new env var read outside its brand or region block can crashloop engine pods in other regions.

## Shared Environment

- Dev data is shared and dirty: colleagues' fixtures, junk consignments that clog subscriptions, and recurring errors from old stuck records. Compare against the previous version before calling an error a regression.
- A nightly job or sweep with no time bound acts on every historical match on its first run, including colleagues' patients.
- Dev flags can differ from prod (some features are already on in dev only). Re-read LD before trusting a doc's flag claim, and target the fixture explicitly when you need the prod path.
- A catalogue-style flag read without customer context affects every dev user of that brand when edited.
- Dev data lake mirrors are incomplete and lag; don't use them to confirm a change you just made.

## Fixtures

- Behaviour that happens at creation time needs a record created after the deploy; check `createdAt` against the rollout. Paths that act on existing records can use older fixtures, but still prove the new version handled them.
- eng-bot fixtures share identity fields (a fixed phone per brand; ES phone and DNI derived from the email), which clash in vendor systems and produce misleading errors.
- A flag evaluated at event time doesn't re-run when you change it later; past events need a manual redrive.
- Dev can't use doctor logins it doesn't have; prescriber flows need a human with a prescriber test account.

## Notifications

- Dev email isn't gated: SendGrid sends to any address with real brand sender addresses. A real email on a test customer gets password resets, MFA codes and signup mail.
- Dev SMS shares Twilio accounts with prod; only the LD allowlist stops a send. Treat that flag as shared config.

## Signals

- HTTP 200 on a webhook or publish means accepted, not handled.
- Consumers that fail validation often ack, so nothing reaches the DLQ.
- Spans are sampled. No span doesn't mean no call; use logs or trace metrics for proof.
- Gauge monitors with no data freeze in their last state.
- gRPC JSON omits empty strings and zero values unless you pass `-emit-defaults`.
- A repeat of an idempotent create on an existing record isn't a test of creation.

## Vendors

- Sandboxes differ from prod and change without notice (codes, URLs, zones). Re-probe after any vendor change and before a booked session.
- Sandbox keys, service IDs and webhook registrations are scoped per environment and partner. A 401 or 404 usually means the wrong environment.
- Cloudflare in front of some vendors blocks default Python and Go user agents (error 1010); set one explicitly.
- Webhooks can arrive before our write commits; the first delivery errors and the retry succeeds.
- Some vendors can only be advanced by the vendor (IMA); for others we can bypass them in our own DB (`eucli set-consignment-status`). A bypass doesn't test the vendor integration. See the vendor table in techniques.md.
