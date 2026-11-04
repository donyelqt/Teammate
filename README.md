# Teammate

Real-time collaborative kanban workspace. Multiple users edit the same board simultaneously; changes propagate in under 400ms without a refresh, survive disconnection, and are gated by database-level authorization.

## Tech stack

| Layer | Choice |
|---|---|
| Web | Next.js 15 (App Router), React 19, TypeScript, Tailwind 4 |
| API | FastAPI on Cloudflare Python Workers |
| Data | PostgreSQL via Supabase |
| Realtime | Supabase Realtime (Postgres WAL) |
| Auth | Supabase Auth (email OTP + OAuth) |
| Edge | Cloudflare: DNS, TLS, WAF, cache, rate limits |
| Infra | Terraform (`infra/terraform`) |
| Package manager | pnpm workspaces |
| Python env | uv |

## Prerequisites

- **Node.js 22+** and **pnpm** (the repo pins `pnpm@10.34.9` in `package.json`)
- **Python 3.13+** and **uv** (the API app requires `>=3.13,<3.14`)
- **Docker Compose** — needed to run local Supabase (Postgres + Realtime)
- A **Cloudflare account** — the API deploys to Cloudflare Workers
- A **Supabase account** — for the database, auth, and realtime

Install the dependencies:

```bash
pnpm install          # web + packages
cd apps/api && uv sync   # API (separate uv environment, not in pnpm workspace)
```

## Quick start

1. `pnpm install`
2. `pnpm dev` — starts the web app on `http://localhost:3000` and the API on `http://localhost:8787`
3. Sign in at `http://localhost:3000`
4. Create a board, add cards, then open a second window — changes propagate in real time

Supabase must be running locally for auth and the database:

```bash
supabase start
```

## Project structure

```
apps/
  web/        Next.js deployable → Vercel
  api/        FastAPI deployable → Cloudflare Python Workers
packages/
  shared/     TypeScript types shared by web and API
supabase/
  migrations/   schema, RLS, triggers (001_init.sql, 002_realtime_publication.sql)
  tests/        RLS policy suite (required CI gate)
infra/
  terraform/    Cloudflare provider config
tasks/           spec, capability map, plan, task list
docs/
  ARCHITECTURE.md
  DEPLOYMENT.md
  adr/           one decision record per expensive-to-reverse decision
```

`apps/api` is a Python project with its own uv environment and is deliberately excluded from `pnpm-workspace.yaml`. pnpm cannot resolve it.

## Testing

```bash
pnpm test            # web: vitest
cd apps/api && python -m pytest   # API: pytest
```

The RLS policy suite is a required gate:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/policies.sql
```

It asserts an outsider reads zero rows on every table, a member reads all, and a viewer cannot write. A widened policy fails CI.

## Type checking

```bash
pnpm typecheck       # tsc --noEmit, web + packages
```

## Contributing

- **Branch naming**: one file = one branch = one PR = one merge. Name branches by the task they close (e.g. `task/31-docs-updated`).
- **Commit conventions**: conventional commits — `feat:`, `fix:`, `docs:`, `chore:`, `test:`. Prefix with the task number when relevant.
- **Before merging**: the branch must pass `pnpm typecheck`, `pnpm test`, and the API checks (`cd apps/api && python -m pytest`). Do not merge failing work.
- **Never edit an accepted ADR** — write a new one that supersedes it and mark the old one deprecated.