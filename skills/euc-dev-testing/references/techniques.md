# Dev Testing Techniques

Placeholders are in `<angle brackets>`. Every command here targets dev; the prod equivalents need PAM, a justification, and the user (see the permissions table in SKILL.md).

## Clusters and Regions

| Region | kubectl context | Notes |
|---|---|---|
| EU | `gke_euc-clusters-dev_australia-southeast1_app-eu-1` | EU dev lives in an Australian GCP region |
| AU | `gke_euc-clusters-dev_australia-southeast1_app-au-1` | Juniper JP is on AU |
| CA | `gke_euc-clusters-dev_northamerica-northeast1_app-ca-1` | |

Workloads are in namespace `default`. Engine deployments are `<brand>-engine-{app,admin,grpc,worker}`; core services are `svc-core-<name>`. Label selector: `app.kubernetes.io/name=<name>`.

```bash
# What is deployed?
kubectl --context <ctx> get deploy <name> -o jsonpath='{.spec.template.spec.containers[0].image}'
# Config (secrets are not readable)
kubectl --context <ctx> get configmap <name>-env-configmap -o json | jq .data
# Logs, including a crashed container
kubectl --context <ctx> logs -l app.kubernetes.io/name=<name> --since=15m --prefix | rg <id>
kubectl --context <ctx> logs <pod> -c <container> --previous
```

"Does not have minimum availability" only means pods never became Ready; the real error is in the container logs.

## gRPC

```bash
eucli proxy svc -n <svc> -e dev -r <eu|au|ca> -p <port>          # run in background; always pass -r
# or: kubectl --context <ctx> port-forward service/<svc> <port>:grpc
grpcurl -plaintext localhost:<port> list
grpcurl -plaintext localhost:<port> describe <pkg.Service>
grpcurl -plaintext -emit-defaults -d '{"brand":"BRAND_JUNIPER_ES", ...}' localhost:<port> <pkg.Service>/<Method> | jq
# assert instead of eyeballing
set -o pipefail; grpcurl ... | jq -e '<predicate>'
```

- Use high, unusual local ports (19000+). Before calling, confirm with `lsof -nP -iTCP:<port>` that the listener is the proxy you just started; a stale forward to another service or region would silently become the test target.
- Port-forwards die after a few hours ("lost connection to pod"). Track them as background jobs and kill them when done.
- Some services refuse the service port; forward the pod instead.
- A method name starting with `Get` is not proof it's read-only; check the handler before calling it unattended.
- To change a test customer's data, use the owning service's RPC (for example `EngineCustomers/UpdateMobileNumber`) rather than SQL.

## Postgres

```bash
eucli proxy db -e dev -i <instance> [-s <service-db>] -p <port>   # e.g. -i juniper-es, or -i services-eu-replica-0 -s svc-core-offerings
psql "$(pbpaste)" -X -q -f query.sql
pbcopy </dev/null   # clear the credential when done
```

- `eucli proxy db` puts a connection string with the password on the clipboard. Never echo or log it, and don't paste it into files, chat or commit messages.
- Before running anything, confirm you're connected where you meant to be: `select current_database(), current_user, inet_server_port();`, and for engine DBs that the schema is `app$dev`. If the clipboard was overwritten, `psql` falls back to a local socket and fails; restart the proxy rather than guessing a connection string.
- Engine DBs use schema `app$dev`: `set search_path to "app$dev";`. Quote mixed-case tables (`"User"`).
- Reads: `begin read only; ... rollback;`.
- Writes to own fixtures:

```sql
\set ON_ERROR_STOP on
begin;
update <table> set <col> = <value> where id = '<id>' and <col> = <old_value> returning *;
-- check the row count, then:
commit;
```

- `psql -c` does not substitute `-v` variables; use `-f`.
- Ledger tables often have a `latest_entry` trigger keyed on `event_at`, and readers inner-join the ledger. Bare inserts are invisible, and a seed dated `now()` swallows later events.
- Validate any seed or repair script against a local clone first (`make dbup` in the service repo, then `create database <x> template <db>`).

## Pub/Sub and Jobs

```bash
gcloud pubsub subscriptions describe <sub> --project euc-services-dev --format='value(topic,filter)'
gcloud pubsub topics publish <topic> --project euc-services-dev --message='' --attribute=brand=<brand>
gcloud pubsub subscriptions pull <sub>.dead-letter --project euc-services-dev --limit 20   # peek, don't ack
gcloud scheduler jobs list --project euc-services-dev --location <region>
```

- Topics are regional (`<name>-eu|-au|-ca`); subscriptions are `<region>.<service>.<topic-stem>`.
- Before publishing, read every subscriber's handler for that topic: what does it select, and does it honour the brand or ID in the message? Scheduler-style jobs often ignore the payload and act on everything that matches.
- Scheduler ticks are plain strings, not protos, and carry no `brand` attribute.
- A proto message with one string field 1 is `0x0a <len> <bytes>`, for example `printf '\x0a\x24%s' <uuid>`. Bash `$(cat ...)` drops NUL bytes; use base64 through the REST API for anything with them.
- `eucli pubsub publish -e dev -r eu -t <topic> -b <brand>` works too, but its bundled protobufs can be stale (`eucli upgrade`), and `orchestrate` topics prompt interactively.

## Fixtures

- **eng-bot** `/test-user <brand> <stage>` in Slack (the user runs it) drives the real app, admin and practitioner GraphQL APIs from sign-up to the chosen stage (`svc-internal-eng-slackbot/src/test-user`). It doesn't call vendors itself.
  - Email: the caller's address plus a random `+<suffix>`. The password equals the email.
  - Phone: fixed per brand, except ES, where phone and DNI are derived from the email. Reusing an email reuses the identity and clashes at vendors.
  - Onfido is skipped with the admin `verifyUser` mutation, not simulated. Stripe uses `tok_visa_debit`.
  - ES delivery preference: PICKUP reaches `FULFILLED`; HOME_DELIVERY leaves the first dispensement `PENDING`, the in-flight fixture.
- **`svc.core.testusers`** recipes insert pre-baked patients with vendor state (UK in-flight, delivered, delivery-failed) straight into the databases, with no vendor call.
- Synthetic customers can also be created through the brand engine GraphQL `signup` and `updateProfile`, with a `+<tag>@eucalyptus.vc` email.
- Admins-ui sync-group actions ("Refill now", "Repeat last order") create orders through the real path; prefer a gateway mutation over stitching RPCs together.
- When a vendor needs distinct identities, derive them from a controlled email rather than inventing random phone numbers or emails (see Notifications in SKILL.md).

## Vendors in Dev

From dev config and code in Oct 2026; check `app-deployments/deployments/services/<svc>/dev/` for the current endpoint.

| Vendor | Dev target | Who moves vendor-side state |
|---|---|---|
| Stripe | Test mode | We create charges. Card `4000 0000 0000 0341` attaches, then declines on charge |
| Delonia (eReceta) | Vendor test API | We sign: in dev, `RequestPrescriberOtp` returns the OTP in the response. Redemption and webhooks come from Delonia |
| IMA | Vendor sandbox | Only IMA. No simulation endpoint or mock switch; book the vendor for progression |
| Titan, Evermed, Shipmate | Vendor dev or staging hosts | We can bypass them: `eucli set-consignment-status <consignment-id> -s Fulfilled\|Delivered\|DeliveryFailed\|Canceled` writes the ledgers and publishes the event. This tests our side only, not the vendor |
| Randox | Separate dev endpoints | Postcodes `LAB_S`, `LAB_F`, `LAB_PF`, `LAB_HH` choose the pathology outcome |
| Onfido | Per-brand dev tokens | Usually bypassed with `verifyUser`; whether dev tokens are sandbox is unconfirmed |
| Shopify | Separate dev stores | Set by hand in Shopify admin |

Report vendor bypasses as bypasses: a `Delivered` written by `eucli` proves our downstream handling, not the vendor integration.

## LaunchDarkly

- MCP `get-flag` / `query-change-history`, project `default`, env `test` (dev) or `production`.
- Individual targeting on the test customer flips a flag for one fixture only.
- The MCP can't edit variation values; that needs the LD UI and is shared config.

## Datadog

- Dev env tag is `dev` or `development` depending on the service; filter `env:(dev OR development)`.
- Version check: `analyze_datadog_logs` grouped by `version`.
- Counts: trace metrics such as `trace.pubsub.message.hits` / `.errors` by `resource_name`; spans and APM are sampled.
- Compare error messages per version to separate regressions from existing dev noise.

## UI

- `agent-browser --headed --session-name <name> open <url>`; the user logs in through SSO in that window, then the agent drives it with `snapshot -i`, `click`, `screenshot`.
- Close modals with Back so nothing in dev changes, and crop screenshots that show test emails.

## Local Before Dev

Cheaper than a dev round trip and often enough:

- Go services: `make dbup`, then `go test -run <name>`; `pgtest` rolls back each test. Check `docker ps` first, because another worktree may already hold the port.
- pilot-engine: a per-worktree database in the compose Postgres, `pnpm migrate up`, targeted `jest --runInBand -t <name>`.
- Probe a vendor API directly with a small script before writing assertions or a suite.
