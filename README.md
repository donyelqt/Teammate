# Teammate

Real-time collaborative kanban workspace. Multiple users edit the same board simultaneously; changes propagate in under 400ms without a refresh, survive disconnection, and are gated by database-level authorization.

## Stack

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

## Layout

```
apps/
  web/     Next.js deployable → Vercel
  api/     FastAPI deployable → Cloudflare Python Workers
packages/
  shared/  TS types shared by web
supabase/
  migrations/  schema, RLS, triggers
  tests/       RLS policy suite (required CI gate)
infra/
  terraform/   Cloudflare provider config
tasks/         spec, capability map, plan, task list
docs/
  ARCHITECTURE.md
  adr/          decision records
```

Note: `apps/api` is a Python project with its own uv environment and is deliberately excluded from `pnpm-workspace.yaml`. pnpm cannot resolve it.

## Setup

Two toolchains. Both are required.

```bash
pnpm install                    # web + packages
cd apps/api && uv sync          # api
```

Environment files: `.env.example` in each app, filled into `.env.local`. The service-role Supabase key exists only in `apps/api`. It must never appear in a `NEXT_PUBLIC_` variable.

## Development

```bash
pnpm dev                          # web on :3000
cd apps/api && uv run pywrangler dev    # Worker on :8787
supabase start                    # local Postgres + Realtime
```

## Checks

```bash
pnpm typecheck      # tsc --noEmit, web + packages
pnpm lint
pnpm build
cd apps/api && uv run pytest -q
cd apps/api && uv run ruff check app tests
cd apps/api && uv run mypy app
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/policies.sql
```

`supabase/tests/policies.sql` is a required gate. It asserts an outsider reads zero rows on every table, a member reads all, and a viewer cannot write. A widened policy fails CI.

## Deployment

| Target | Command |
|---|---|
| Web | push to `main` (Vercel builds `apps/web`) |
| Worker | `cd apps/api && uv run pywrangler deploy` |
| Edge config | `terraform apply` in `infra/terraform` |
| Migrations | `supabase db push --link` |

Details, including the origin-hardening and cache-key requirements, are in `docs/DEPLOYMENT.md`.

## Documentation

- `tasks/SPEC-syncboard.md` — product spec, acceptance criteria
- `docs/ARCHITECTURE.md` — topology, the two rules that decide the design
- `docs/adr/` — one record per expensive-to-reverse decision
- `tasks/plan.md`, `tasks/todo.md` — phases and task list

## Design rules

Teal `#0D9488` primary, orange `#EA580C` accent, zinc neutrals. Geist + Geist Mono. No serif, no Inter. Motion uses `ease-out` (never `ease-in`), 100-200ms, transform and opacity only, `prefers-reduced-motion` respected. No emoji as icons; Phosphor icons instead. Full detail in `docs/adr/0009-design-tokens-for-teammate.md`.
