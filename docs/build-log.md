# Build Log

Phase-by-phase history of how `repo-insights` was built. Each phase was a self-contained, testable milestone with its own acceptance test. Kept as engineering documentation for future contributors.

---

## Phase 0 — Project Skeleton 

Express server with `/health` returning `{ status: 'ok' }`.

Files: `package.json`, `tsconfig.json`, `.env(.example)`, `.gitignore`, `server/{server,app}.ts`, `server/config/env.ts`, `server/utils/logger.ts`, `server/utils/errors.ts`, `server/middleware/error.middleware.ts`.

---

## Phase 1 — Postgres + Redis + Migrations 

Postgres and Redis running locally, schema applied via a migration runner.

Files: `server/config/database.ts`, `server/config/redis.ts`, `migrations/001_initial_schema.sql`, `scripts/migrate.js`.

---

## Phase 2 — GitHub OAuth 

User logs in via GitHub, receives a JWT cookie, GitHub access token encrypted at rest with AES-256-GCM.

Files: `server/utils/jwt.ts`, `server/utils/crypto.ts`, `server/integrations/github/*`, `server/modules/auth/*`, `server/middleware/auth.middleware.ts`.

---

## Phase 3 — Repository Module 

List GitHub repos, add to tracking, list tracked repos, get one. Org-repo filter excludes repos the user has never contributed to.

Files: `server/modules/repositories/*`.

---

## Phase 4 — Scan Queue 

`POST /repos/:id/scan` enqueues a BullMQ job; worker writes `scans` rows.

Files: `server/modules/scans/scan.{queue,service,controller,routes,worker}.ts`.

---

## Phase 5 — GitHub Data Fetching 

Worker fetches commits, contributors, config files, workflow listings and caches them in Redis as `scan:context:<scanId>` with 1h TTL.

Files: `server/modules/scans/scan.context.ts`; extended `server/integrations/github/github.client.ts` and `server/modules/scans/scan.worker.ts`.

---

## Phase 6 — First Detector (Jest) + GraphQL N+1 Fix 

Jest detector writes `tool_usage` rows. Replaced org-repo N+1 REST filter with a single GraphQL `commitContributionsByRepository` query.

Files: `server/modules/tools/detector.{interface,registry}.ts`, `server/modules/tools/detectors/jest.detector.ts`.

---

## Phase 7 — Remaining Detectors 

Twelve more detectors, 13 total: eslint, prettier, pytest, black, ruff, pre-commit, github-actions, dependabot, renovate, go-test, golangci-lint, phpunit.

Files: `server/modules/tools/detectors/*.detector.ts`; extended `scan.worker.ts` config candidate lists.

---

## Phase 8 — Metrics Aggregation 

`GET /repos/:id/metrics` returns adoption score, coverage, adoption, per-tool breakdown, per-contributor counts, language list.

Composite formula: `coverage × adoption`, where:

- `coverage = detected tracked / tracked`
- `adoption = mean(adoptionRate of detected tracked tools that aren't commit-presence proxies)`

Commit-presence proxies (`github-actions`, `dependabot`, `renovate`) are reported but excluded from the score.

Files: `server/modules/metrics/*`.

---

## Phase 8b — User-Curated Tracked Tools 

`tracked_tools` table. `GET/PUT /repos/:id/tracked-tools`. Scan worker backfills newly detected + relevant tools (user choices win). Metrics scores against the user's tracked set; falls back to detected+relevant when uncurated.

Files: `migrations/002_tracked_tools.sql`, `server/modules/tracked-tools/*`.

---

## Phase 9 — Caching + Rate Limiting 

- Scan cache: 1h TTL, keyed by repoId; `cached: true` on fresh hits
- Metrics cache: 60s TTL, keyed by `repoId + scanId` — a new scan naturally busts
- In-flight scan dedup: `pending`/`running` short-circuits
- Rate limiting: 300/min global, 10/min scan, 120/min metrics; fails open on Redis errors

Files: `server/utils/cache.ts`, `server/middleware/rate-limit.middleware.ts`; extended scan/metrics services.

---

## Phase 10 — Hardening + Tests 

Vitest unit tests (jwt, crypto, 3 detectors), supertest integration tests (auth, scan pipeline), `attachRequestId` middleware, `INVALID_JSON` 400 handling.

Files: `vitest.config.ts`, `tests/**/*.test.ts`, `tests/helpers/*`; extended `error.middleware.ts` and `scan.worker.ts` (`processScanJobForTests`).

---

## Monorepo refactor 

`src/` moved to `server/`. Frontend directory `src/` created and waiting for Vite. Docs moved into `docs/`. CI workflow added.

---

## Frontend F0 — Scaffold ✅

Vite 6 + React 18 + TypeScript + Tailwind v4 + shadcn/ui (Neutral).
`src/` is a workspace. Vite proxy forwards `/auth`, `/repos`, `/scans`,
`/health` to `:3000`. Aliases: `@/*` → `src`, `@shared/*` → `shared`.

---

## Frontend F1 — Router, Shell & Landing

React Router v6 data router with lazy pages, a shared app shell, and the
public marketing page.

Routes:

- `/` — landing page
- `/app` — dashboard
- `/app/repos` — repositories
- `/app/repos/:owner/:repo` — repository report
- `/app/repos/:owner/:repo/settings` — repository settings
- `*` — 404

Files: `src/router.tsx`, `App.tsx`,
`components/{ErrorBoundary,PageLoader}.tsx`,
`components/layout/{AppShell,PageHeader}.tsx`,
`components/auth/ProtectedRoute.tsx`, `pages/*`, and shadcn `card`,
`separator`, `avatar`, `dropdown-menu`, `sheet`, `badge`, `progress`.

Added `react-router-dom@6.30.6` and `date-fns@4.4.0`. The shadcn CLI pulled
v4 component sources from the current registry; their imports were converted
back to the individual `@radix-ui/react-*` packages used by the v2 setup.

Verified with `npm run typecheck:frontend`, `npm run build:frontend`, and the
Vite dev server serving every route above plus unknown paths.

---

## Frontend F2 — Auth + API Client ✅

Typed fetch wrapper (`credentials: include`) with an `ApiError` that preserves
status, code, message, details, and request ID. TanStack Query with
`['auth', 'me']` hydrates a Zustand store. `AuthGate` shows a skeleton while
loading; `ProtectedRoute` redirects to `/` when there is no user. The landing
page CTA starts GitHub OAuth, and the header user menu shows the avatar,
username, and Sign out. Session persistence relies on the httpOnly cookie.

Routes moved to `/dashboard`, `/repos`, `/repos/:id`, and
`/repos/:id/settings`; `/app` and `/app/*` redirect to `/dashboard`. Because
`/repos` is both an API path and an SPA route, the Vite proxy serves
`index.html` for browser navigations while forwarding API fetches to `:3000`.

---

## Frontend F3 — Repo List + Detail ✅

`/repos` lists tracked repos with an AddRepoDialog that fetches GitHub
repos and posts `githubId`. `/repos/:id` shows metrics with ScoreGauge
(Recharts radial), coverage/adoption stat cards, and a tool list grouped by
category with detected/relevant badges. Run-scan handles cached vs queued
scans and polls `/scans/:id` until complete, with a 60s timeout. Scan
history shows the last five scans and expands to show the summary.

Added `recharts@3.10.1`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`,
and shadcn `dialog`, `input`, `table`, `tabs`, `tooltip`. `GitHubRepo` lives
in `src/types/local.ts` because it is not yet in the shared API types.

---

## Frontend F4 — Settings, GitHub Dark Theme, Polish ✅

`/repos/:id/settings` with per-tool switches grouped by category, optimistic
save with debounce + revert on error, warning banner if zero tools enabled.
The UI is permanently GitHub dark: `html.dark` plus the GitHub dark palette
in `index.css`, with no light-mode toggle. Charts use `useChartColors()` for
dark-aware colors. Every page has loading skeletons, empty states, and error states
with retry. Mobile-first: all pages work at 375px, sidebar becomes Sheet,
tables stack. Accessibility pass: keyboard nav, focus management, aria
labels on icon-only buttons.

The tracked-tools API now derives each tool's `relevant` flag from the
latest metrics, so language-specific tools correctly show "Not applicable"
instead of inheriting the detected state. Saving tracked tools also
invalidates the metrics cache, so the score reflects the new selection
immediately.

---

## Monorepo layout cleanup

Flattened the frontend from `src/src/` to `src/`, moved `index.html`,
`public/`, `vite.config.ts`, `components.json`, and the frontend tsconfigs to
the repo root, and merged the frontend dependencies/scripts into the root
`package.json`. Migrations moved to `migrations/`, shared types to
`shared/types.ts`, and stale `.gitkeep` files were removed. Tailwind now uses
the root `tailwind.config.ts` and `postcss.config.js`; the production frontend
build goes to `dist/frontend/`.
