<h1 align="center">
  <img src="public/favicon.png" alt="repo-insights logo" width="96" height="96" />
  <br />
  repo-insights
</h1>

repo-insights tells you whether your contributors are actually using the tools you set up — plus activity, dependency health, workflow stability, and more, all in one dashboard.

> **"Are our contributors actually using the tools we're asking them to use?"**

Connect a GitHub repository and get clear, per-tool adoption metrics — who's using ESLint, who's writing tests, who's bypassing CI — instead of guessing.

## Features

- **Overview** — repository health first, with activity, dependency, workflow, structure, adoption, and commit-quality cards.
- **Activity** — commit cadence, weekday/hour patterns, contributor mix, and Conventional Commits quality.
- **Structure** — a bounded repository tree, file-type mix, and directory size totals.
- **Dependencies** — direct manifest parsing, latest-version checks, OSV advisories, and queued refresh.
- **Workflows** — GitHub Actions success rates, durations, branches, and recent failures.
- **Tools** — one adoption score plus per-tool, per-contributor adoption across 13 tools.
- **Contributor concentration** — top-contributor share and bus-factor risk.

Tool adoption is one signal alongside activity, dependency freshness, workflow stability, contributor spread, and commit quality. All repository views are first-class, and missing sources are removed and renormalized rather than presented as a primary workflow.

The app requests the read-only `public_repo` scope, so it analyzes public repositories. Some Actions data may still be unavailable to the token; the UI reports that source as not collected instead of failing the whole report.

## Repository layout

```
server/       Backend — Express API + BullMQ worker
src/          Frontend — React source for the Vite app
public/       Frontend static assets (favicon)
shared/       TypeScript types shared between server and frontend (API contract)
migrations/   SQL migrations
tests/        Vitest unit + integration tests
scripts/      Migration runner and dev utilities
docs/         Architecture, API reference, detector details, build log
```

Frontend and backend share the root `package.json`, `tsconfig*.json`, and
tooling config. Vite builds to `dist/frontend/`; the server builds to
`dist/server/`.

## Quickstart

```bash
npm install
cp .env.example .env    # fill in DATABASE_URL, REDIS_URL, GitHub OAuth keys, JWT + encryption secrets
npm run migrate
npm run dev             # API on http://localhost:3000
npm run worker          # in a separate terminal — BullMQ scan worker
npm run dev:frontend    # frontend on http://localhost:5173
```

Before opening a pull request, run `npm run lint`, `npm run typecheck`,
`npm run typecheck:frontend`, and `npm test`.

See [`docs/development.md`](docs/development.md) for Postgres/Redis setup (native or Docker).

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — system overview
- [`docs/detectors.md`](docs/detectors.md) — the 13 tools we detect and how
- [`docs/api.md`](docs/api.md) — HTTP API reference
- [`docs/build-log.md`](docs/build-log.md) — phase-by-phase build history
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to contribute

## License

MIT — see [`LICENSE`](LICENSE).