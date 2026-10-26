# API Reference

Base URL: `http://localhost:3000` in development.

All routes except `/health` and `/auth/github*` require an authenticated session. Authentication uses an `httpOnly` cookie named `token`, set by `GET /auth/github/callback`.

Every response includes an `X-Request-Id` header. Error responses include `requestId` in the body so client-side logs and server-side logs can be correlated.

## Errors

All errors have the shape:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Not authenticated",
    "details": {},
    "requestId": "uuid"
  }
}
```

Known codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT`, `INVALID_JSON`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`, `VALIDATION_ERROR`.

Rate-limited responses also include `Retry-After` and `X-RateLimit-*` headers.

## Rate limits

Limits are fixed windows per minute. Once authenticated, the identity is the
user id (not the IP), so users behind a shared proxy do not exhaust each
other's quota. Unauthenticated routes key by IP.

| Scope | Limit |
|-------|-------|
| All API routes | 300/min |
| `POST /repos/:id/scan` | 10/min |
| `GET /repos/:id/metrics` | 120/min |
| Scan reads (`GET /repos/:id/scans`, `GET /scans/:scanId`) | 120/min |
| Writes (`PUT /repos/:id/tracked-tools`, `DELETE /repos/:id`) | 20/min |
| Auth routes | 300/min |

If the API runs behind a reverse proxy, set `TRUST_PROXY` so Express resolves
the client IP correctly for unauthenticated limits.

## Health

### `GET /health`

No auth, no rate limit.

```json
{ "status": "ok", "service": "repo-insights", "time": "2026-01-01T00:00:00.000Z" }
```

## Auth

### `GET /auth/github`

Redirects to GitHub's authorize URL. Sets a `state` value in Redis (10m TTL) and an `oauth_state` httpOnly cookie for CSRF protection. Requests the read-only scopes `read:user`, `user:email`, `public_repo`, and `read:org`.

### `GET /auth/github/callback?code=…&state=…`

Exchanges the OAuth code, upserts the user, sets the JWT cookie, redirects to `FRONTEND_URL`. `state` is validated twice: it must match the `oauth_state` httpOnly cookie set by `GET /auth/github`, and it must still exist in Redis. A cookie mismatch, missing state, or replayed state returns `400 BAD_REQUEST`.

### `GET /auth/me`

Requires auth.

```json
{
  "user": {
    "id": "uuid",
    "githubId": 123,
    "username": "octocat",
    "email": "octocat@example.com",
    "avatarUrl": "https://avatars.githubusercontent.com/u/123"
  }
}
```

### `POST /auth/logout`

No auth required. Clears the `token` cookie and revokes the current JWT's
session id if the cookie contains a valid token. Revoked sessions are rejected
by `requireAuth` even if the JWT itself has not expired.

```json
{ "ok": true }
```

> **Tenancy:** this API is a single shared workspace. All authenticated
> users see the same tracked repositories and their scans/metrics. See
> `docs/architecture.md#tenancy-model`.

## Repositories

### `GET /repos/github`

Requires auth. Lists repos the user owns, collaborates on, or has contributed to in an org. Org repos where the user has never committed are excluded.

Query parameters:

| Name | Default | Description |
|------|---------|-------------|
| `page` | `1` | 1-based page number (max 10,000) |
| `perPage` | `100` | Page size (max 100) |

Pagination is applied after GitHub listings are merged and capped at ten
GitHub pages per request. `hasMore` indicates whether another API page exists.

```json
{
  "repos": [
    {
      "id": 123,
      "name": "hello-world",
      "full_name": "octocat/hello-world",
      "owner": { "login": "octocat" },
      "private": false,
      "default_branch": "main",
      "stargazers_count": 5,
      "forks_count": 1
    }
  ],
  "hasMore": false,
  "page": 1
}
```

### `POST /repos`

Requires auth.

Body:

```json
{ "githubId": 123 }
```

Response `201`:

```json
{
  "repository": {
    "id": "uuid",
    "githubId": 123,
    "owner": "octocat",
    "name": "hello-world",
    "fullName": "octocat/hello-world",
    "isPrivate": false,
    "defaultBranch": "main",
    "stars": 5,
    "forks": 1,
    "contributorCount": 3,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

Errors: `400 BAD_REQUEST` if `githubId` isn't accessible or already tracked is a `409 CONFLICT`.

### `GET /repos`

Requires auth. Lists tracked repos.

### `GET /repos/:id`

Requires auth. Returns one tracked repo.

### `DELETE /repos/:id`

Requires auth. Rate-limited to 20/min.

Permanently untracks a repository and deletes its scan history, tool usage,
metrics cache, and tracked-tool settings. Pending or running scans are marked
`failed` with `error = "Repository removed"` before the repository row is
deleted; the schema cascades `scans`, `tool_usage`, and `tracked_tools`.
Redis keys `cache:scan-result:<repoId>` and `cache:metrics:<repoId>:*` are
invalidated. `scan:context:<scanId>` entries are left to expire.

Returns `204 No Content` with an empty body. Unknown repository → `404
NOT_FOUND`; malformed id → `400 BAD_REQUEST`.

> **Tenancy:** any authenticated user may remove any tracked repository,
> matching the shared-workspace access model. See
> `docs/architecture.md#tenancy-model`.

## Scans

### `POST /repos/:id/scan`

Requires auth. Rate-limited to 10/min.

- **`202 Accepted`** — new scan queued. Body: `{ scan: {...}, cached: false }`
- **`200 OK`** — either a fresh cached scan (< 1h old) or a pending/running scan already exists. Body: `{ scan: {...}, cached: true }`
- **`503 SERVICE_UNAVAILABLE`** — the scan queue (Redis) is unavailable. The
  scan is marked failed before returning.
- **`500 INTERNAL_ERROR`** — another enqueue failure occurred; the scan is
  marked failed.

Scan shape:

```json
{
  "scan": {
    "id": "uuid",
    "repoId": "uuid",
    "status": "pending" | "running" | "complete" | "failed",
    "startedAt": null,
    "completedAt": null,
    "error": null,
    "summary": null,
    "createdAt": "2026-01-01T00:00:00.000Z"
  },
  "cached": false
}
```

### `GET /repos/:id/scans`

Requires auth. Last 50 scans, newest first.

### `GET /scans/:scanId`

Requires auth. Single scan, includes `summary` once complete.

## Metrics

### `GET /repos/:id/metrics`

Requires auth. Rate-limited to 120/min. Cached for 60s per `(repoId, latest scan)`.

```json
{
  "repoId": "uuid",
  "repoFullName": "octocat/hello-world",
  "scanId": "uuid",
  "scanCompletedAt": "2026-01-01T00:00:00.000Z",
  "adoptionScore": 62.5,
  "coverage": 71.43,
  "adoption": 87.5,
  "languages": ["js"],
  "toolsChecked": 13,
  "toolsRelevant": 7,
  "toolsTracked": 5,
  "toolsDetected": 4,
  "tools": [
    {
      "name": "jest",
      "category": "testing",
      "detected": true,
      "relevant": true,
      "tracked": true,
      "adoptionRate": 87.5,
      "contributorCount": 8,
      "contributorsUsing": 7,
      "countsTowardScore": true,
      "evidence": { "configFiles": ["jest.config.js"] }
    }
  ]
}
```

`coverage` and `adoption` are also 0–100. `adoptionScore = coverage × adoption / 100`. Coverage is the share of tracked tools that were detected; adoption is the mean per-contributor adoption of detected tracked tools, excluding commit-presence proxies (`github-actions`, `dependabot`, `renovate`). The same scoring module produces the metrics response and the cached scan summary, so both always report the same score. See `docs/architecture.md#scoring`.

Repos with no completed scan return a well-shaped empty response (`scanId: null`, `tools: []`, `adoptionScore: 0`).

## Tracked tools

### `GET /repos/:id/tracked-tools`

Requires auth. Returns all 13 registry tools with their current state for this repo.

```json
{
  "repoId": "uuid",
  "tools": [
    {
      "toolName": "jest",
      "enabled": true,
      "detected": true,
      "relevant": true,
      "category": "testing"
    }
  ]
}
```

### `PUT /repos/:id/tracked-tools`

Requires auth. Rate-limited to 20/min. Full replacement of the user's tracked set.

```json
{
  "tools": [
    { "name": "jest", "enabled": true },
    { "name": "eslint", "enabled": false }
  ]
}
```

Tools not mentioned in the body are deleted. Unknown tool names → `400 BAD_REQUEST`.