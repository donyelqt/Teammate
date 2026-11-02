# Task List: Teammate

## Phase 1: Foundation

- [x] Task 1: Scaffold the monorepo (`apps/web`, `apps/api`, `packages/shared`)
  - Acceptance: `pnpm install` and `uv sync` both succeed; root `typecheck` runs
  - Verify: `pnpm typecheck` — PASS, verified from a clean clone of main on 2026-11-02
  - Files: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/api/pyproject.toml`, `packages/shared/package.json`
  - Scope: Medium

- [x] Task 2: Establish the env contract and boundary rules
  - Acceptance: `.env.example` for both apps; documented list of which vars are browser-safe; lint rule forbids `service_role` in `NEXT_PUBLIC_`
  - Verify: `pnpm lint` catches a `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` assignment — PASS, four injected violations produced four errors
  - Files: `.env.example`, `apps/web/src/lib/env.ts`, `apps/web/eslint.config.mjs`
  - Scope: Medium

- [x] Task 3: CI pipeline green
  - Acceptance: workflow runs typecheck, lint, build, pytest, policy tests, secret scan
  - Verify: workflow file parses; every job references an existing script or directory — PASS, 8 jobs green on main
  - Files: `.github/workflows/ci.yml`
  - Scope: Medium

- [x] Checkpoint: fresh clone runs `pnpm typecheck` and `uv run pytest` clean, CI green
  - Verified from `git clone --depth 1 --branch main` on 2026-11-02:
    `pnpm install --frozen-lockfile` OK, `pnpm typecheck` OK (3 workspace projects),
    `pnpm lint` OK, `pnpm build` OK, `pytest` 2 passed, `ruff` OK, `mypy` 6 files OK.

## Phase 2: Data model

- [x] Task 4: Apply the schema migration and verify RLS
  - Acceptance: migration applies against clean Postgres with `ON_ERROR_STOP`
  - Verify: PASS — applied from an empty PostgreSQL 16 database, exit 0
  - Files: `supabase/migrations/001_init.sql`
  - Scope: Medium

- [x] Task 5: Policy test suite green
  - Acceptance: outsider reads zero rows on every table; member reads all; viewer cannot write; member cannot escalate
  - Verify: PASS — suite exits 0 locally and green in CI against real Supabase
  - Files: `supabase/tests/policies.sql`
  - Scope: Large

- [x] Task 6: Ordering trigger verified under concurrent moves
  - Acceptance: positions contiguous per parent after insert, delete, and move
  - Verify: PASS — section 6 now has a block per operation plus a two-session
    interleave. Found and fixed four real trigger defects; see PR #4.
  - Files: `supabase/migrations/001_init.sql`
  - Scope: Medium

- [x] Checkpoint: RLS boundary and ordering both proven against real Postgres
  - Verified 2026-11-02 via PR #4 (`fix/position-compaction`), 8/8 jobs green,
    including `RLS policy tests` and `Migrations apply cleanly` on real Supabase.

## Phase 3: Auth

- [x] Task 7: Supabase client wiring
  - Acceptance: server, client, and middleware clients each constructed once with correct cookie handling
  - Verify: PASS — `pnpm typecheck` clean; anon key only reaches the browser bundle and the secret guard still fires on a `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` probe
  - Files: `apps/web/src/lib/supabase/server.ts`, `client.ts`, `middleware.ts`
  - Scope: Medium

- [x] Task 8: Sign-in flow with email OTP
  - Acceptance: email sent, code verified, session established, redirect to workspace
  - Verify: PASS — verified against a live local Supabase stack on 2026-11-02.
    The mechanism is a magic link, not a numeric code: GoTrue emails a link
    carrying a one-use token hash and no six-digit token is issued, so the
    code-collecting form could not work. `GET /auth/v1/verify?...&type=magiclink`
    returns 303 with a redirect to `#access_token=<JWT>`. Evidence in
    `docs/VERIFICATION-auth-otp.md`.
  - Files: `apps/web/src/app/(auth)/sign-in/page.tsx`, `apps/web/src/app/auth/callback/route.ts`
  - Scope: Large

- [x] Task 9: Workspace membership resolution and route guards
  - Acceptance: unauthenticated hits `/` redirect to sign-in; non-members get an empty board query
  - Verify: PASS — `/auth/callback` with no code returns 307 to
    `/sign-in?error=missing_code`, and with a bad code 307 to sign-in carrying
    Supabase's PKCE error. An anon-key query on `workspace_members` returns
    `[]`, so the non-member boundary holds through real RLS.
  - Files: `apps/web/src/middleware.ts`, `apps/web/src/lib/auth/workspace.ts`
  - Scope: Medium

- [x] Checkpoint: sign in lands on a workspace; non-member queries return zero rows
  - Verified 2026-11-02 via PR #7 against the local Supabase stack:
  - migration applies, password grant returns a 780-char token
  - `GET /auth/v1/verify` 303 with a session JWT in the fragment
  - anon query on `workspace_members` returns `[]`
  - callback route redirects correctly with and without a code
  - `pnpm typecheck`, `pnpm lint`, `pnpm build` clean; 8/8 CI jobs green on main
  - One gap remains, recorded: the full redirect chain from the emailed link
    into the app needs a browser that can reach the `redirect_to` host.

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

- [x] Task 12: Sync state machine
  - Acceptance: `synced`/`pending`/`offline`/`conflict` transitions exhaustively typed
  - Verify: PASS — the union is exhaustively switched with a `never` assertion, so
    an unhandled variant fails the build. Runtime assertions cover `syncBadge`
    across all four states.
  - Files: `packages/shared/src/sync-state.ts` (+ `.test.ts`, `.type-test.ts`)
  - Scope: Medium
  - Note: the task list named `apps/web/lib/realtime/syncState.ts`. The type is
    a domain concept used by both apps, so it lives in `packages/shared` where
    Phase 1 put it. The file path differs from the plan; the capability does not.

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
