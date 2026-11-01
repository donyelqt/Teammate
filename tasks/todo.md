# Task List: Teammate

## Phase 1: Foundation

- [ ] Task 1: Scaffold the monorepo (`apps/web`, `apps/api`, `packages/shared`)
  - Acceptance: `pnpm install` and `uv sync` both succeed; root `typecheck` runs
  - Verify: `pnpm typecheck`
  - Files: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/api/pyproject.toml`, `packages/shared/package.json`
  - Scope: Medium

- [ ] Task 2: Establish the env contract and boundary rules
  - Acceptance: `.env.example` for both apps; documented list of which vars are browser-safe; lint rule forbids `service_role` in `NEXT_PUBLIC_`
  - Verify: `pnpm lint` catches a `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` assignment
  - Files: `.env.example`, `apps/web/lib/env.ts`, `.eslintrc`
  - Scope: Medium

- [ ] Task 3: CI pipeline green
  - Acceptance: workflow runs typecheck, lint, build, pytest, policy tests, secret scan
  - Verify: workflow file parses; every job references an existing script or directory
  - Files: `.github/workflows/ci.yml`
  - Scope: Medium

- [ ] Checkpoint: fresh clone runs `pnpm typecheck` and `uv run pytest` clean, CI green

## Phase 2: Data model

- [ ] Task 4: Apply the schema migration and verify RLS
  - Acceptance: migration applies against clean Postgres with `ON_ERROR_STOP`
  - Verify: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/001_init.sql`
  - Files: `supabase/migrations/001_init.sql`
  - Scope: Medium

- [ ] Task 5: Policy test suite green
  - Acceptance: outsider reads zero rows on every table; member reads all; viewer cannot write; member cannot escalate
  - Verify: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/policies.sql`
  - Files: `supabase/tests/policies.sql`
  - Scope: Large

- [ ] Task 6: Ordering trigger verified under concurrent moves
  - Acceptance: positions contiguous per parent after insert, delete, and move
  - Verify: reorder section of `policies.sql` passes
  - Files: `supabase/migrations/001_init.sql`
  - Scope: Medium

- [ ] Checkpoint: RLS boundary and ordering both proven against real Postgres

## Phase 3: Auth

- [ ] Task 7: Supabase client wiring
  - Acceptance: server, client, and middleware clients each constructed once with correct cookie handling
  - Verify: `pnpm typecheck`; server client returns a session, browser client does not leak keys
  - Files: `apps/web/lib/supabase/server.ts`, `client.ts`, `middleware.ts`
  - Scope: Medium

- [ ] Task 8: Sign-in flow with email OTP
  - Acceptance: email sent, code verified, session established, redirect to workspace
  - Verify: manual sign-in end-to-end on `localhost:3000`
  - Files: `apps/web/app/(auth)/sign-in/page.tsx`, `apps/web/app/auth/callback/route.ts`
  - Scope: Large

- [ ] Task 9: Workspace membership resolution and route guards
  - Acceptance: unauthenticated hits `/` redirect to sign-in; non-members get an empty board query
  - Verify: session and non-session both exercised
  - Files: `apps/web/middleware.ts`, `apps/web/lib/auth/workspace.ts`
  - Scope: Medium

- [ ] Checkpoint: sign in lands on a workspace; non-member queries return zero rows

## Phase 4: Realtime fabric

- [ ] Task 10: Realtime subscription hook with typed channels
  - Acceptance: typed change payload, unsubscribe on cleanup, no leak across mounts
  - Verify: unit test on mount/unmount; two-window convergence smoke
  - Files: `apps/web/lib/realtime/useRealtimeChannel.ts`
  - Scope: Medium

- [ ] Task 11: Optimistic queue with ULID ids and echo dedup
  - Acceptance: remote echo for a queued id updates rather than appends; no duplicate card on reconnect
  - Verify: table-driven unit tests including echo, duplicate echo, and reconnect
  - Files: `apps/web/lib/realtime/optimisticQueue.ts`
  - Scope: Large

- [ ] Task 12: Sync state machine
  - Acceptance: `synced`/`pending`/`offline`/`conflict` transitions exhaustively typed
  - Verify: unit tests on each transition
  - Files: `apps/web/lib/realtime/syncState.ts`
  - Scope: Medium

- [ ] Task 13: Reconnect drain with backoff
  - Acceptance: serial drain, exponential jittered backoff capped at 30s, keep on transport failure, drop on 409
  - Verify: unit tests on failure classes; 60s outage with 20 edits yields no duplicates
  - Files: `apps/web/lib/realtime/reconnectDrain.ts`
  - Scope: Large

- [ ] Checkpoint: two windows converge under 400ms; 60s outage with 20 queued edits yields no duplicates and no lost work

## Phase 5: Board shell

- [ ] Task 14: Shared domain types and branded ids
  - Acceptance: `WorkspaceId`, `BoardId`, `CardId` branded; sync state is a discriminated union; no `as` at boundaries
  - Verify: `pnpm typecheck`; a deliberate invalid id fails to compile
  - Files: `packages/shared/src/domain.ts`, `ids.ts`
  - Scope: Medium

- [ ] Task 15: Typed API client at the FastAPI boundary
  - Acceptance: response schema validation at the boundary; unknown is not trusted
  - Verify: unit tests against a recorded response and a malformed one
  - Files: `apps/web/lib/api/client.ts`, `packages/shared/src/api-contract.ts`
  - Scope: Large

- [ ] Task 16: Board page layout
  - Acceptance: list columns scroll horizontally, header stable, `min-h-[100dvh]` not `h-screen`, empty and loading states
  - Verify: render at 375px, 768px, 1440px; both themes
  - Files: `apps/web/app/(app)/board/[id]/page.tsx`, `apps/web/components/board/*`
  - Scope: Large

- [ ] Checkpoint: board renders from real data with loading, empty, and error states

## Phase 6: Feature slices (parallelizable)

- [ ] Task 17: Card CRUD with optimistic apply
  - Acceptance: create appears instantly, survives reconnect; edit and delete verified in two windows
  - Verify: two-window smoke; unit tests on the reducer
  - Files: `apps/web/components/card/*`, `apps/web/app/api` router mirror
  - Scope: Large

- [ ] Task 18: Drag-to-reorder with position compaction
  - Acceptance: reorder across and within lists; simultaneous drags converge to one order without duplicates
  - Verify: policy test contiguity plus two-window drag smoke
  - Files: `apps/web/components/board/DraggableCard.tsx`
  - Scope: Large

- [ ] Task 19: Labels, assignees, due dates
  - Acceptance: all three persist, appear on the card, and broadcast to other windows
  - Verify: two-window smoke for each field
  - Files: `apps/web/components/card/*`
  - Scope: Medium

- [ ] Task 20: Comments on cards
  - Acceptance: add, list, delete by author; broadcast to other windows
  - Verify: two-window smoke
  - Files: `apps/web/components/card/Comments.tsx`, API router
  - Scope: Medium

- [ ] Task 21: Activity history panel
  - Acceptance: last 50 events with actor, action, target; outsider sees none
  - Verify: RLS test plus render check
  - Files: `apps/web/components/board/ActivityPanel.tsx`
  - Scope: Medium

- [ ] Task 22: Card presence with TTL prune
  - Acceptance: who is editing shows; clears within 2 minutes of exit
  - Verify: two windows, one closes, row gone after TTL
  - Files: `apps/web/lib/realtime/usePresence.ts`
  - Scope: Medium

- [ ] Checkpoint: every slice verified in two windows; concurrent drags converge

## Phase 7: Workspace access

- [ ] Task 23: Workspace switcher
  - Acceptance: switch updates board query and membership context without full reload
  - Verify: manual switch across two workspaces
  - Files: `apps/web/components/workspace/Switcher.tsx`
  - Scope: Medium

- [ ] Task 24: Member roles and invite by slug
  - Acceptance: invite grants read; role change revokes write immediately
  - Verify: RLS test plus manual role downgrade
  - Files: `apps/web/app/(app)/board/settings/*`, API router
  - Scope: Large

- [ ] Checkpoint: role change revokes access immediately; invite link grants read

## Phase 8: API service

- [ ] Task 25: FastAPI app skeleton
  - Acceptance: `/health` returns 200; config from env; no secret in source
  - Verify: `uv run pywrangler dev` then `curl localhost:8787/health`
  - Files: `apps/api/app/main.py`, `core/config.py`
  - Scope: Medium

- [ ] Task 26: Routers for boards, cards, comments, activity
  - Acceptance: every route has a success test and a non-member rejection test
  - Verify: `uv run pytest -q`
  - Files: `apps/api/app/routers/*`
  - Scope: Large

- [ ] Task 27: Worker entrypoint and `pywrangler dev` verified locally
  - Acceptance: ASGI entrypoint deploys; no async ORM anywhere; every dependency is pure-Python or PyEmscripten
  - Verify: `uv run pywrangler dev` serves `/health`; dependency audit passes
  - Files: `apps/api/src/main.py`, `wrangler.jsonc`, `pyproject.toml`
  - Scope: Large

- [ ] Task 28: Cloudflare edge configuration
  - Acceptance: DNS, TLS, WAF, cache rules documented or codified
  - Verify: API reachable through the edge hostname; static assets cached
  - Files: blocked on the Cloudflare decision (Terraform or dashboard)
  - Scope: Medium

- [ ] Checkpoint: `docker compose up` serves the API; policy tests and pytest green

## Phase 9: Polish and ship

- [ ] Task 29: Accessibility pass
  - Acceptance: every control named, focus visible, contrast 4.5:1 both themes, `prefers-reduced-motion` honored
  - Verify: keyboard tab through the board; both themes inspected
  - Files: `apps/web/components/**`
  - Scope: Large

- [ ] Task 30: Observability
  - Acceptance: structured logs with request id, React error boundaries, health endpoint
  - Verify: a forced error surfaces a boundary, not a blank screen
  - Files: `apps/api/app/core/logging.py`, `apps/web/app/error.tsx`
  - Scope: Medium

- [ ] Task 31: Docs updated
  - Acceptance: README, DEPLOYMENT, and one ADR per major decision
  - Verify: a new contributor can follow README to a running app
  - Files: `README.md`, `docs/DEPLOYMENT.md`, `docs/adr/*`
  - Scope: Medium

- [ ] Task 32: E2E suite green
  - Acceptance: sign-in, create board, edit card, second window sees it
  - Verify: `pnpm e2e`
  - Files: `apps/web/e2e/*`
  - Scope: Large

- [ ] Checkpoint: full scenario passes end-to-end; all spec success criteria met
