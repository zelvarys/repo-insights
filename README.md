<h1 align="center">
  <img src="public/favicon.png" alt="repo-insights logo" width="96" height="96" />
  <br />
  repo-insights
</h1>

An analytics platform for open-source maintainers and engineering teams that answers a question they've never had data for:

> **"Are our contributors actually using the tools we're asking them to use?"**

Connect a GitHub repository and get clear, per-tool adoption metrics — who's using ESLint, who's writing tests, who's bypassing CI — instead of guessing.

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