# Architecture

## Overview

`repo-insights` is a two-process backend: an Express HTTP API and a BullMQ scan worker. Both connect to the same Postgres database and Redis instance. The frontend (Vite app in `src/`) calls the API over HTTP.

```
┌─────────────┐        HTTP        ┌─────────────────┐
│  Frontend   │ ─────────────────▶ │  API (Express)  │
│  src/       │ ◀───────────────── │  server/app.ts  │
└─────────────┘      JSON + JWT    └────────┬────────┘
                                            │
                              ┌─────────────┼─────────────┐
                              ▼             ▼             ▼
                        ┌──────────┐  ┌──────────┐  ┌──────────┐
                        │ Postgres │  │  Redis   │  │  GitHub  │
                        └────┬─────┘  └────┬─────┘  └────┬─────┘
                             │             │             │
                             │             │             │
                        ┌────▼─────────────▼─────────────▼────┐
                        │        Scan worker (BullMQ)          │
                        │   server/modules/scans/scan.worker   │
                        └──────────────────────────────────────┘
```

## Request lifecycle — scan

1. `POST /repos/:id/scan` → `requestScan()` in `server/modules/scans/scan.service.ts`
2. Cache check: `cache:scan-result:<repoId>` (1h TTL). Fresh → return `200 { scan, cached: true }` unless a newer scan row exists.
3. In-flight check: `scans` row with `status IN ('pending','running')` for this repo → return that row, `cached: true`. Pending scans older than 10 minutes and running scans older than 30 minutes are considered stale and failed during boot reconciliation.
4. Insert `scans` row (`status = 'pending'`) → enqueue BullMQ job keyed by scan id → return `202 { scan, cached: false }`. The check, stale update, and insert run in one transaction guarded by `pg_advisory_xact_lock` on the repo id, backed by a partial unique index for active scans.
5. Worker picks up job → marks `status = 'running'` → fetches GitHub data → builds `ScanContext` → saves to `scan:context:<scanId>` (1h TTL) → runs 13 detectors → persists `tool_usage` rows → backfills `tracked_tools` → writes `scans.languages` and the scored `scans.summary` → caches completed scan.
6. On failure → final attempt writes `status = 'failed'` and error text, invalidates matching caches; earlier attempts log and leave the row for BullMQ retry (up to 3 attempts with exponential backoff). Stale retries cannot overwrite a newer scan's cached result.

## Request lifecycle — metrics

1. `GET /repos/:id/metrics` → `getRepoMetrics()`
2. Latest completed scan for repo → cache key `cache:metrics:<repoId>:<scanId>` (60s TTL)
3. Cache miss → aggregate `tool_usage` + `tracked_tools`, read persisted `scans.languages` (Redis context fallback only when NULL) → compute `coverage × adoption` → write cache → return
4. New scan → new scan id → new cache key; old key expires naturally

## Data model

- **users** — GitHub identity + encrypted access token (AES-256-GCM)
- **repositories** — tracked repos; metadata synced from GitHub at add time
- **scans** — one row per scan request; status, timestamps, detected `languages` (`TEXT[]`), summary JSON
- **tool_usage** — one repo-level row per tool per scan (`contributor_login IS NULL`), plus one per-contributor row per tool per scan
- **tracked_tools** — user's curated set of tools per repo (`enabled` flag); scan worker backfills newly detected + relevant tools with `ON CONFLICT DO NOTHING` so user choices win
- **migrations** — applied migration ledger

Cascades: deleting a repo cascades to its `scans`, `tool_usage`, and `tracked_tools`.
Deleting a repo is a single service operation: in-flight scans are first marked
`failed` with `error = 'Repository removed'`, then the repository row is deleted
and its scan-result and metrics cache keys are invalidated. Scan contexts are
left to expire. A worker that starts after deletion logs a warning, updates any
surviving scan row if present, and exits without throwing.

## Redis keys

| Key | TTL | Purpose |
|-----|-----|---------|
| `scan:context:<scanId>` | 1h | Full scan context for detectors (commits, contributors, config files, workflows) |
| `cache:scan-result:<repoId>` | 1h from scan completion | Last completed scan; short-circuits `POST /repos/:id/scan` |
| `cache:metrics:<repoId>:<scanId>` | 60s | Latest computed metrics for a repo |
| `revoked:<jti>` | remaining JWT lifetime | Revoked session ids; checked by `requireAuth` |
| `ratelimit:<name>:<identity>:<window>` | window + 1s | Fixed-window rate counter |
| `oauth:state:<state>` | 10m | OAuth CSRF state |

Redis is not a source of truth — everything cached here can be regenerated from Postgres and GitHub.

## Authentication

1. `GET /auth/github` → 32-byte random `state` stored in Redis (10m TTL) → redirect to GitHub authorize URL
2. `GET /auth/github/callback` → validate `state` (delete on match) → exchange code for token → fetch GitHub user + primary email → encrypt token → upsert `users` → sign JWT (`sub = user id`, random `jti`) → set `httpOnly` cookie → redirect to `FRONTEND_URL`. Requested GitHub scopes are read-only: `read:user`, `user:email`, `public_repo`, `read:org`.
3. Protected routes → `requireAuth` middleware → read `token` cookie → verify HMAC (timing-safe) → reject if the `jti` exists under `revoked:<jti>` → attach `req.userId`
4. `POST /auth/logout` clears the cookie and writes the current `jti` to Redis with the token's remaining TTL. Revocation is per-session; other sessions stay valid.
5. Every protected handler resolves the GitHub token via `getAccessTokenForUser(req.userId)` which decrypts at rest; decrypt failures are treated as "no token available" (worker fails the scan cleanly, user must re-authenticate)

## Tenancy model

repo-insights is deployed as a **single shared workspace**. All authenticated
users see the same set of tracked repositories, scans, and metrics.

`repositories.added_by` records who added the repo — it is informational,
not an ownership model. It does not gate access. Any authenticated user may
delete any tracked repository.

This model is correct for:

- A self-hosted deployment used by one team
- A shared demo instance
- Early-stage SaaS before team features exist

It is **not** correct for:

- Multi-tenant SaaS where different customers share a deployment
- Any workflow where "who can see this repo" matters

If multi-tenancy becomes a requirement, the upgrade path is:

1. Add `organizations` and `org_members` tables
2. Add `repositories.org_id`
3. Backfill every repo to a default org
4. Add `WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = $1)`
   to every repo/scan/metric/tracked-tools query
5. Write tests proving user A cannot access user B's org's repos

Until then, do not add per-user filtering. Doing so without a team model
creates the worst of both worlds: users lose access to shared data, and
there is still no way to share.

## Scoring

`adoptionScore = coverage × adoption`, both 0–100:

- `coverage = detected tracked tools / tracked tools`
- `adoption = mean(adoptionRate of detected tracked tools that aren't commit-presence proxies)`
- Commit-presence proxies (`github-actions`, `dependabot`, `renovate`) are always reported but never count toward `adoption` — their per-contributor signal is "made a commit," which would inflate the score to 100 on any active repo.

When `tracked_tools` is empty (uncurated repo), scoring falls back to "everything detected and relevant" so a fresh repo doesn't score 0.