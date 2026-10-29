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
| Repository insight reads (`GET /repos/:id/{structure,activity,concentration,ci,dependencies,overview}`) | 120/min |
| `POST /repos/:id/dependencies/refresh` | 10/min |
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

Requires auth. Lists repos the user owns, can access, or has contributed to
in the last 12 months. A contribution is a commit or a pull request that was
actually merged; opened-but-unmerged pull requests do not count.

- Owned repos are always included.
- Collaborator and organization repos are included only when the user has a
  commit in the last 12 months or an authored pull request merged in the last
  12 months.
- Repos owned by others are included when the user committed there or had a
  pull request merged there, even if `/user/repos` does not list them.
- Discovery is limited to repos the token can read. The app requests
  `public_repo`, so external private repos are not supported.
- Commit contributions are capped at 100 repositories. Merged pull-request
  search paginates up to 1,000 results and is capped at 100 unique repos.

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

## Repository insights

Insight reads all use the latest **completed** scan and are cached for 60s per
`(repoId, scanId, filters)`. Every response includes the availability envelope:

```json
{
  "available": true,
  "scanId": "uuid",
  "completedAt": "2026-10-29T00:00:00.000Z"
}
```

When a source was not collected, `available` is `false`, `reason` is set, and
the source-specific payload is omitted. Reasons include `no_scan` (no completed
scan), `not_collected` (older scan before this feature), `no_workflows` (no
GitHub Actions workflow files), and `github_unavailable` (Actions data could
not be read).

### `GET /repos/:id/structure`

Repository tree from the latest scan. Bounded to 500 entries, depth 4; test
synthetic leaf nodes are excluded. `truncated` is true when GitHub or the cap
cut the tree.

```json
{
  "available": true,
  "scanId": "uuid",
  "completedAt": "2026-10-29T00:00:00.000Z",
  "structure": {
    "fileCount": 214,
    "directoryCount": 31,
    "totalSize": 1048576,
    "truncated": false,
    "fileTypes": [{ "extension": ".ts", "count": 120, "sizeBytes": 800000 }],
    "tree": [
      {
        "name": "src",
        "path": "src",
        "type": "dir",
        "size": 800000,
        "lastModified": null,
        "fileCount": 120,
        "children": []
      }
    ]
  }
}
```

### `GET /repos/:id/activity?range=90|180|365`

Commit activity and commit-quality stats. Default `range` is `365`. The scan
stores 90-, 180-, and 365-day aggregates over up to 1,000 commits. Daily keys
are UTC `YYYY-MM-DD`; weekly keys are UTC Monday week starts.

```json
{
  "available": true,
  "scanId": "uuid",
  "completedAt": "2026-10-29T00:00:00.000Z",
  "activity": {
    "range": 90,
    "daily": { "2026-10-28": 3 },
    "weekly": [{ "weekStart": "2026-10-26", "count": 3 }],
    "topContributors": [{ "login": "octocat", "commits": 3 }],
    "weekday": [0, 1, 1, 0, 0, 1, 0],
    "hourOfDay": [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "quality": {
      "totalCommits": 3,
      "conventionalPercent": 66.67,
      "bodyPercent": 33.33,
      "averageMessageLength": 32,
      "averageBodyLength": 40,
      "mostCommonType": "feat",
      "examples": ["update docs"],
      "messageLengthBuckets": [{ "label": "1-20", "count": 1 }]
    }
  }
}
```

Merge commits and invalid timestamps are ignored. Commit-quality examples are
sanitized (emails and `@mentions` are redacted).

### `GET /repos/:id/concentration`

Contributor concentration over the same 365-day commit history.

```json
{
  "available": true,
  "scanId": "uuid",
  "completedAt": "2026-10-29T00:00:00.000Z",
  "concentration": {
    "totalCommits": 100,
    "contributorCount": 12,
    "top1Share": 45,
    "top3Share": 72,
    "top10Share": 96,
    "gini": 0.61,
    "risk": "yellow",
    "topContributors": [{ "login": "octocat", "commits": 45, "share": 45 }]
  }
}
```

Risk buckets: top-3 share `< 50%` is `green`, `50–75%` is `yellow`, and
`> 75%` is `red`. Gini is computed over positive per-contributor commit counts.

### `GET /repos/:id/ci?range=30|90|365&workflow=&branch=`

Aggregates persisted GitHub Actions runs for the latest scan. Default `range`
is `90`; `workflow` and `branch` are exact-match filters. Up to 300 runs are
stored per scan.

```json
{
  "available": true,
  "scanId": "uuid",
  "completedAt": "2026-10-29T00:00:00.000Z",
  "ci": {
    "successRate": 82.5,
    "totalRuns": 40,
    "workflows": [
      {
        "name": "CI",
        "totalRuns": 30,
        "successfulRuns": 25,
        "failedRuns": 3,
        "successRate": 83.33,
        "averageDurationSeconds": 142
      }
    ],
    "recentFailures": [
      {
        "runId": 123,
        "workflowName": "CI",
        "branch": "main",
        "actor": "octocat",
        "conclusion": "failure",
        "completedAt": "2026-10-28T12:00:00.000Z",
        "url": "https://github.com/octocat/hello-world/actions/runs/123"
      }
    ],
    "partial": false,
    "fetchedAt": "2026-10-29T00:00:00.000Z"
  }
}
```

Success rate counts completed runs only. A repo with no workflow files returns
`available: false, reason: "no_workflows"`; Actions permission failures return
`available: false, reason: "github_unavailable"`.

### `GET /repos/:id/dependencies?page=1&perPage=50&outdated=&hasAdvisory=`

Paginated dependency rows from lockfiles, with a scan-level summary.

Query parameters:

| Name | Default | Description |
|------|---------|-------------|
| `page` | `1` | 1-based page (max 10,000) |
| `perPage` | `50` | Page size (max 100) |
| `outdated` | unset | `true` or `false` |
| `hasAdvisory` | unset | `true` or `false` |

```json
{
  "available": true,
  "scanId": "uuid",
  "completedAt": "2026-10-29T00:00:00.000Z",
  "summary": {
    "total": 120,
    "checked": 118,
    "outdated": 14,
    "advisoryCount": 2,
    "severity": { "low": 0, "moderate": 1, "high": 0, "critical": 1 },
    "partial": false,
    "checkedAt": "2026-10-29T00:00:00.000Z"
  },
  "rows": [
    {
      "ecosystem": "npm",
      "packageName": "lodash",
      "currentVersion": "4.17.21",
      "latestVersion": "4.17.21",
      "outdated": false,
      "advisoryCount": 0,
      "maxSeverity": null,
      "registryUrl": "https://www.npmjs.com/package/lodash"
    }
  ],
  "pagination": { "page": 1, "perPage": 50, "total": 120, "hasMore": true }
}
```

Supported lockfiles: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`,
`requirements.txt`, `pyproject.toml`, `go.mod`, `go.sum`, `Gemfile.lock`, `Gemfile`,
`composer.lock`, and `composer.json`. Parsing is capped at 300 dependencies per
scan; registry and OSV lookups use 24h Redis caches and a 90s budget. A failed
or truncated lookup sets `summary.partial`.

### `POST /repos/:id/dependencies/refresh`

Requires auth. Rate-limited to 10/min. Queues a dependency-only refresh against
the latest completed scan; the existing scan rows are updated in place and the
dependency/overview caches are invalidated.

- **`202 Accepted`** — `{ "queued": true, "scanId": "uuid" }`
- **`409 CONFLICT`** — no completed scan or no dependency data to refresh.
- **`503 SERVICE_UNAVAILABLE`** — the queue is unavailable.

Clients should poll `GET /repos/:id/dependencies` until `summary.checkedAt`
advances.

### `GET /repos/:id/overview`

Composite card data plus a health score. The health score is context; tool
adoption remains the primary metric.

```json
{
  "available": true,
  "scanId": "uuid",
  "completedAt": "2026-10-29T00:00:00.000Z",
  "health": {
    "score": 74.25,
    "components": [
      { "key": "activity", "label": "Activity", "score": 80, "weight": 0.25, "available": true },
      { "key": "dependencies", "label": "Dependency freshness", "score": 88.33, "weight": 0.25, "available": true },
      { "key": "ci", "label": "CI stability", "score": 82.5, "weight": 0.2, "available": true },
      { "key": "concentration", "label": "Contributor spread", "score": 56, "weight": 0.15, "available": true },
      { "key": "commitQuality", "label": "Commit quality", "score": 70, "weight": 0.15, "available": true }
    ]
  },
  "cards": {
    "concentration": { "top3Share": 72, "risk": "yellow" },
    "ci": { "available": true, "successRate": 82.5, "worstWorkflow": "CI" },
    "dependencies": { "total": 120, "outdated": 14, "advisoryCount": 2, "partial": false },
    "activity": {
      "last90Commits": 40,
      "sparkline": [{ "date": "2026-10-28", "count": 3 }]
    },
    "commitQuality": { "conventionalPercent": 70 }
  }
}
```

Health weights are activity 25%, dependency freshness 25%, CI 20%, contributor
spread 15%, and commit quality 15%. Missing components are removed and the
remaining weights are renormalized. See
[`docs/architecture.md#composite-health-score`](architecture.md#composite-health-score).

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