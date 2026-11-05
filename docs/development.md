# Local Development

## Prerequisites

- Node 24 LTS
- Postgres 15+
- Redis 7+

Docker is used for production deployment, not local development. Run Postgres
and Redis natively for local work.

## Native install

### Linux (Debian/Ubuntu)

```bash
sudo apt install postgresql redis-server

sudo -u postgres psql -c "CREATE USER you WITH PASSWORD 'dev';"
sudo -u postgres createdb -O you repositron

sudo systemctl enable --now postgresql
sudo systemctl enable --now redis-server
```

`.env`:

```bash
DATABASE_URL=postgres://you:dev@localhost:5432/repositron
REDIS_URL=redis://localhost:6379
```

### macOS

```bash
brew install postgresql@15 redis
brew services start postgresql@15
brew services start redis

createdb repositron
```

`.env`:

```bash
DATABASE_URL=postgres://user@localhost:5432/repositron
REDIS_URL=redis://localhost:6379
```

### Termux (Android)

```bash
pkg install postgresql redis

mkdir -p $PREFIX/var/lib/postgresql
initdb $PREFIX/var/lib/postgresql

pg_ctl -D $PREFIX/var/lib/postgresql -l $PREFIX/var/lib/postgresql/logfile start
createdb repositron
redis-server --daemonize yes
```

`.env`:

```bash
DATABASE_URL=postgres://user@localhost:5432/repositron
REDIS_URL=redis://localhost:6379
```

On Termux, Postgres and Redis don't start automatically after a reboot. Either re-run the two start commands, or alias them in `~/.bashrc`:

```bash
alias startdb='pg_ctl -D $PREFIX/var/lib/postgresql -l $PREFIX/var/lib/postgresql/logfile start && redis-server --daemonize yes'
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | no (default `development`) | `development`, `production`, or `test` |
| `PORT` | no (default `3000`) | API listen port |
| `DATABASE_URL` | yes | Postgres connection string |
| `REDIS_URL` | yes | Redis connection string |
| `GITHUB_CLIENT_ID` | yes | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | yes | GitHub OAuth app client secret |
| `GITHUB_CALLBACK_URL` | yes | Must match the OAuth app's callback URL exactly |
| `JWT_SECRET` | yes (32+ chars) | HMAC key for session tokens |
| `JWT_EXPIRES_IN` | no (default `7d`) | Accepts `3600`, `60s`, `5m`, `2h`, `7d` |
| `TOKEN_ENCRYPTION_KEY` | yes (64 hex chars) | AES-256-GCM key for GitHub access tokens at rest |
| `FRONTEND_URL` | yes | Redirect target after OAuth; also the CORS origin |
| `GITHUB_FETCH_TIMEOUT_MS` | no (default `15000`) | Timeout for each GitHub API request; must be > 0 |
| `TRUST_PROXY` | no | Reverse proxy hops to trust. Use `1` behind one proxy, or `true`, `false`, or an Express trust-proxy value. Defaults to `1` when `NODE_ENV=production`. |
| `SCAN_RETENTION_DAYS` | no (default `90`) | Delete scans older than this while keeping the latest completed scan per repository. |

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## GitHub OAuth app

1. Go to https://github.com/settings/developers → **New OAuth App**
2. **Homepage URL**: `http://localhost:5173`
3. **Authorization callback URL**: `http://localhost:3000/auth/github/callback`
4. Leave **Allow wildcard matching** and **Enable Device Flow** unchecked
5. Leave **Expire user access tokens** unchecked
6. Copy the Client ID and generate a Client Secret into `.env`

For production, create or update the OAuth app with the public HTTPS homepage
and callback URL, for example `https://repositron.example.com` and
`https://repositron.example.com/auth/github/callback`. `GITHUB_CALLBACK_URL`
must match exactly.

The app requests the read-only scopes `read:user`, `user:email`, `public_repo`,
and `read:org` at login. Scans only read repository contents, contributors,
commits, and workflows; no write scopes are requested.

## Migrations

```bash
npm run migrate
```

Re-running is a no-op. The `migrations` table in Postgres records what's
applied. The runner takes a Postgres advisory lock and stores a SHA-256
checksum for each migration, so concurrent deploys cannot race and edited
applied migrations fail loudly.

To migrate the test database explicitly:

```bash
createdb repositron_test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/repositron_test npm run migrate
```

## Run

```bash
npm run dev      # API on http://localhost:3000
npm run worker   # in a separate terminal
```

Both must be running for scan processing to work: the API only enqueues jobs; the worker executes them.

## Production deployment

Production runs the full stack from `docker-compose.yml` on one VPS. The API
serves both the built SPA and the API on the same origin.

1. Copy `.env.example` to `.env`.
2. On the VPS, comment out the development values and uncomment the production
   values. Set `POSTGRES_PASSWORD`, `FRONTEND_URL`, `GITHUB_CALLBACK_URL`, and
   the app secrets. Keep `DATABASE_URL` pointed at the `postgres` service and
   `REDIS_URL` at the `redis` service.
3. Build and start the stack:

   ```bash
   docker compose up -d --build
   ```

4. Put a TLS-terminating reverse proxy in front of `127.0.0.1:3000`. Forward
   `X-Forwarded-For` and `X-Forwarded-Proto`, and keep `TRUST_PROXY=1`.
5. Check container and application health:

   ```bash
   docker compose ps
   curl -fsS http://127.0.0.1:3000/health
   curl -fsS http://127.0.0.1:3000/ready
   ```

The `migrate` service runs before the API and worker. Postgres and Redis are
internal-only and have no host-published ports. The API and worker use the
same image with different commands. The worker writes a heartbeat every 30
seconds; its container healthcheck fails if the heartbeat is more than 90
seconds old.

To run migrations manually:

```bash
docker compose run --rm migrate
```

## Backups

Backups are the deployment operator's responsibility. The repository does not
schedule them.

- Back up Postgres regularly with `pg_dump`, or use WAL archiving if you need
  point-in-time recovery. Store backups off-host and encrypted, and test a
  restore before relying on them.
- Back up Redis. Cached values can be regenerated, but BullMQ jobs and
  schedulers, OAuth state, and revoked session ids cannot. Redis runs with
  AOF enabled, and its volume must be included in the backup plan.
- Back up the Docker volumes for Postgres and Redis, or dump the databases
  from inside the containers.
- Run a restore drill after changing the deployment topology.

## Verify

```bash
curl -s http://localhost:3000/health
# → {"status":"ok",...}

curl -s http://localhost:3000/ready
# → {"status":"ready",...}

npm run typecheck
npm run typecheck:frontend
npm test
npm run lint
```

## Running tests

```bash
npm test          # single run
npm run test:watch
npm run test:cov
```

Tests read configuration from a gitignored `.env.test`. Create it with
`NODE_ENV=test`, `DATABASE_URL` pointing at a database whose name ends in
`_test`, and the required app secrets. Then create the database and apply
migrations:

```bash
createdb repositron_test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/repositron_test npm run migrate
```

Tests use the same Redis instance as development. Each test truncates the
Postgres database before running. `truncateAll()` refuses to run unless
`NODE_ENV=test` and the database name ends in `_test` (override with
`ALLOW_TEST_TRUNCATE=1` only if you are certain). Do not point tests at a
production database.

## Frontend

The frontend source lives in `src/` and runs as a Vite app.

```bash
npm install             # one install at root covers backend + frontend
npm run dev:frontend    # http://localhost:5173
```

The Vite dev server proxies `/auth`, `/repos`, `/scans`, and `/health` to
the backend on `:3000`. Start the backend (`npm run dev`) in another
terminal.

Frontend scripts:

- `npm run dev:frontend`: Vite dev server
- `npm run build:frontend`: production build into `dist/frontend/`
- `npm run typecheck:frontend`: TypeScript check

shadcn components live in `src/components/ui/`. Add a new one from the repo root with:

```bash
npx shadcn@latest add <component>
```

The shared frontend/backend config lives at the root: `vite.config.ts`,
`postcss.config.js`, `components.json`, and `config/typescript/*.json`. The
root `tsconfig.json` references the app, server, node, and test projects.
