# Spec: Teammate

## Objective

Real-time collaborative kanban workspace. A user signs in, joins a workspace, and edits boards, lists, and cards. Every change appears on other users' screens without a refresh. Changes survive disconnection and reconnect without duplicating or losing local work.

Three claims the product must hold at once:

1. Two users editing the same board see each other's changes converge.
2. A user who goes offline mid-edit, edits more, then reconnects does not lose or duplicate work.
3. A user who lacks a workspace role cannot read or write that workspace's data.

Product type: productivity tool, B2B team collaboration. Audience: product and engineering teams already fluent with Trello or Linear. Success looks like: two browser windows side by side, edits in one land in the other in under 400ms without manual refresh.

## Tech Stack

| Layer | Choice | Version |
|---|---|---|
| Web app | Next.js App Router | 15.x |
| Language | TypeScript | 5.5+ |
| Styling | Tailwind CSS | 4.x |
| Runtime | React | 19.x |
| Motion | Framer Motion | 11.x |
| Database | PostgreSQL via Supabase | 15.x |
| Realtime | Supabase Realtime (WAL change streams) | — |
| Auth | Supabase Auth (email OTP + OAuth) | — |
| API service | FastAPI (Python) | 0.110+ |
| DB driver | asyncpg direct SQL | — |
| Web deploy | Vercel | — |
| Edge + API runtime | Cloudflare Workers (Python) | GA 2026-09-21 |
| Package manager | pnpm workspaces | 10.9.2 |
| Python env | uv | — |

### Architecture decision: why the API lives in `apps/api`, not `backend/`

Turborepo and Vercel convention: every deployable is a peer under `apps/`. Next.js in `apps/web`, FastAPI in `apps/api`. A Python service under `backend/` is not resolvable by pnpm, so pnpm cannot install, typecheck, or build it; the workspace excludes it either way. Placing it under `apps/` makes it a peer that the root scripts and CI address by name and that Docker/Cloudflare deploy configs reference by a stable path.

### Architecture decision: the API runs on Cloudflare Python Workers

Python Workers reached general availability on 2026-09-21 and Cloudflare publishes its own ASGI server, so FastAPI runs there directly through `workers.asgi` without uvicorn and without a separate hosting provider. Cloudflare handles DNS, TLS, WAF, caching, and rate limiting as both edge and runtime. Verified against Cloudflare's documentation on 2026-11-02. See ADR-0003 for sources and for the constraints this imposes on the data layer.

The constraint that matters: the Workers runtime has no greenlet support, so async SQLAlchemy does not run there. The data layer uses `asyncpg` directly against SQL rather than an async ORM. Only pure-Python or PyEmscripten wheels are allowed, so every dependency is audited before it enters the app.

### Architecture decision: realtime goes through the database, not through FastAPI

Supabase Realtime streams Postgres WAL changes to subscribed clients. FastAPI does not maintain socket connections. Consequence: writes must land in Postgres (not an in-memory queue) for them to propagate. This is a constraint that simplifies the design rather than complicating it.

## Commands

```bash
pnpm install                 # install web deps
cd apps/api && uv sync       # install api deps

pnpm dev                     # web dev server on :3000
cd apps/api && uv run pywrangler dev    # Worker on :8787

pnpm typecheck               # tsc --noEmit across web + packages
pnpm lint                    # eslint
pnpm build                   # next build
cd apps/api && uv run pytest # api tests
supabase db push --link      # apply migrations to linked project
cd apps/api && uv run pywrangler deploy
```

## Project Structure

```
teammate/
├── apps/
│   ├── web/                    # Next.js deployable
│   │   ├── app/                # routes, layouts, server components
│   │   ├── components/         # UI, one directory per feature
│   │   ├── lib/
│   │   │   ├── supabase/       # client, server, middleware clients
│   │   │   ├── realtime/       # subscription hooks, optimistic queue
│   │   │   └── api/            # typed client for the FastAPI boundary
│   │   └── ...
│   └── api/                    # FastAPI deployable (Python, uv)
│       ├── app/
│       │   ├── main.py
│       │   ├── core/           # config, db session, security
│       │   ├── models/         # SQLModel tables
│       │   ├── schemas/        # Pydantic request/response
│       │   └── routers/        # boards, cards, comments, activity
│       └── tests/
├── packages/
│   └── shared/                 # TS types shared by web
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── tasks/
└── docs/
```

## Code Style

TypeScript: discriminated unions for card-editing state, branded ids at the boundary, `unknown` at external edges, no `as` casts without prior validation, exhaustiveness switches.

```ts
type SyncState =
  | { readonly kind: "synced" }
  | { readonly kind: "pending"; readonly queued: number }
  | { readonly kind: "offline"; readonly queued: number; readonly lastError: string }
  | { readonly kind: "conflict"; readonly local: CardDraft; readonly remote: Card };

function renderBadge(state: SyncState) {
  switch (state.kind) {
    case "synced": return null;
    case "pending": return `Saving ${state.queued}`;
    case "offline": return `Offline, ${state.queued} queued`;
    case "conflict": return "Conflict";
  }
}
```

Python: type-annotated everything, Pydantic schemas at the router boundary, no business logic in route handlers, `async def` handlers throughout.

## Testing Strategy

| Level | Tool | Scope |
|---|---|---|
| Type safety | `tsc --noEmit` | web + packages |
| Unit | Vitest | reducers, optimistic queue, ordering math |
| Component | Vitest + Testing Library | card editor state machine, empty/loading/error states |
| API | pytest + httpx AsyncClient | every router, every auth-rejection path |
| Realtime integration | two clients against a dev Postgres | convergence and reconnect |
| E2E | Playwright | sign-in → create board → edit card → second window sees it |

Coverage expectation: every router path has a test asserting both the success case and the non-member rejection. Pure functions (ordering, queue) get table-driven cases including boundaries.

## Boundaries

**Always do:**
- Run `pnpm typecheck` and `uv run pytest` before any commit
- Validate every external input through a schema before it reaches a domain type
- Give interactive elements an accessible name and a visible focus state
- Derive optimistic ids as ULIDs, never `Math.random()`
- Respect `prefers-reduced-motion`

**Ask first:**
- Changes to RLS policies or any table shape
- Adding a runtime dependency to `apps/web` or `apps/api`
- Changing the Supabase project or auth provider
- Touching deploy configuration

**Never do:**
- Commit `.env` or any credential
- Use `SUPABASE_SERVICE_ROLE_KEY` in client code (it bypasses RLS)
- Use `any` in TypeScript or ship an `as` cast that hides unvalidated input
- Put serif fonts in this UI, or use Inter
- Emit an emoji as an icon
- Use `h-screen` where `min-h-[100dvh]` is meant

## Success Criteria

1. A user signs in with email OTP and lands on a workspace with no manual step.
2. Creating a board, list, and card persists across a full page reload.
3. Two browser sessions on the same board converge in under 400ms with no manual refresh.
4. With the network cut, editing a card and reconnecting yields that card exactly once with the latest local edit.
4a. That reconnect works after a 60s outage with 20 queued edits and yields no duplicate rows.
5. A user removed from the workspace loses read and write access immediately (RLS, not client routing).
6. Concurrent drag-to-reorder by two users does not duplicate, drop, or reorder-lock cards.
7. The activity panel shows the last 50 events with actor, action, and target.
8. Presence shows which users are editing a card and clears within 2 minutes of their exit.
9. `pnpm typecheck` and `uv run pytest` pass clean on a fresh clone.
10. The UI passes the UI/UX pre-delivery checklist in both light and dark mode.

## Open Questions

None blocking. The following are settled by explicit decision and recorded here so a future session does not relitigate them:

- Conflict policy is last-write-wins per field, with `updated_at` as tiebreaker. Not a CRDT. Chosen because field-level CRDTs add a semester of complexity for a tool where two people rarely edit the same card in the same second, and LWW degrades to "someone's edit wins" rather than corruption.
- Presence is Postgres-backed with a 2-minute TTL prune, not a Redis channel. Chosen to avoid a second piece of stateful infrastructure in an MVP.
