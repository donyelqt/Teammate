# Deployment

## Web (Vercel)

The web app is `apps/web`, a Next.js 15 App Router project. Vercel builds and deploys it.

**Build command**: `pnpm build` (runs `next build`).

**Environment variables required** (set in the Vercel project dashboard or via `vercel env`):

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | web | Browser-safe. Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | Browser-safe. RLS enforces authorization; a leak costs nothing an attacker cannot reach with a free account. |
| `SUPABASE_SERVICE_ROLE_KEY` | API only | **Never** prefix with `NEXT_PUBLIC_`. It bypasses every RLS policy. If it ever reaches the browser, authorization becomes a suggestion. |

**How to deploy**:

```bash
cd apps/web
vercel --prod
```

Or deploy through the Vercel dashboard by importing the repo and setting the environment variables above.

## API (Cloudflare Workers)

The API is `apps/api`, a FastAPI app. It deploys to Cloudflare Python Workers via `wrangler`.

**Build command**:

```bash
cd apps/api
pywrangler deploy
```

**`wrangler.jsonc` config** (`apps/api/wrangler.jsonc`):

- `main`: `app/worker.py` — the entrypoint, which exposes the FastAPI app via `workers.asgi`.
- `compatibility_flags`: `["python_workers"]` — enables the Python Workers runtime.
- `hyperdrive`: a `HYPERDRIVE` binding pointing at a Hyperdrive config that pools Postgres connections. `id` is the Hyperdrive config ID, set per environment.
- `observability`: enabled — Cloudflare captures structured logs and metrics for the Worker.

**Environment variables** (set via `wrangler secrets put` or the Cloudflare dashboard):

| Variable | Notes |
|---|---|
| `TEAMMATE_DATABASE_URL` | Pooled Postgres connection from Cloudflare Hyperdrive. Never hardcoded. |
| `TEAMMATE_SUPABASE_JWT_SECRET` | JWT secret used to verify Supabase-issued access tokens. Must match the Supabase project's configured secret, or every token verifies as invalid. |
| `TEAMMATE_SUPABASE_URL` | Supabase project URL, used for token verification and admin calls. |

**How to run locally**:

```bash
cd apps/api
pywrangler dev server/worker.py --port 8787
```

This starts the Worker on `http://localhost:8787`, wired to the local Supabase instance started by `supabase start`.

## Database

Supabase hosts PostgreSQL. Migrations live in `supabase/migrations/`:

- `001_init.sql` — schema, RLS policies, triggers
- `002_realtime_publication.sql` — the `realtime` publication that streams WAL changes to subscribed clients

**How to apply**:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/001_init.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/002_realtime_publication.sql
```

Or use the Supabase CLI:

```bash
supabase db push --link
```

**RLS policies** live in `supabase/migrations/001_init.sql`. They are the authorization boundary: the API has no app-level fallback for a request Postgres rejects. The policy test suite in `supabase/tests/policies.sql` is a required CI gate — it asserts an outsider reads zero rows on every table, a member reads all, and a viewer cannot write.

## Observability

- **Structured logs** come from `server.core.logging`. Every request carries a `request_id` propagated through a context variable, emitted in every log line as `rid=<request_id>`. Set verbosity with `TEAMMATE_LOG_LEVEL` (default `INFO`).
- **Health endpoint** at `/health` (in `server/core/health.py`). It probes the database with `SELECT 1` and reports `realtime` as configured. Returns HTTP 200 when all checks are up, 503 otherwise. Use it as a liveness/readiness probe.
- **Error boundaries** in the web app:
  - `apps/web/src/app/error.tsx` — catches errors in nested segments and offers a "Try again" reset.
  - `apps/web/src/app/global-error.tsx` — catches errors that escape the root layout; renders a full HTML document so the shell never dies blank.

## Rollback

**Web (Vercel)**:

- Via the dashboard: open the deployment, click **Rollback**, and select a previous deployment.
- Via CLI: `vercel rollback`.

**API (Cloudflare Workers)**:

- Via the Cloudflare dashboard: open the Worker, go to **Releases**, and promote a previous release.
- Via CLI: `wrangler rollback`.

**General pattern**: tag the current deploy with `git tag deploy-<date> && git push origin deploy-<date>`. If something breaks, redeploy the previous tag:

```bash
git checkout <previous-tag>
cd apps/web && vercel --prod
cd apps/api && pywrangler deploy
```