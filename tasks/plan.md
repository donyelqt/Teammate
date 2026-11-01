# Implementation Plan: Teammate

## Overview

Real-time collaborative kanban workspace. Next.js App Router frontend on Vercel, FastAPI backend on a Python origin behind Cloudflare, PostgreSQL + Realtime on Supabase. Realtime propagates through the database rather than through the API, so a write that does not reach Postgres does not propagate. Conflicts resolve last-write-wins per row.

## Architecture Decisions

**Supabase is the primary backend.** Auth, Postgres, and Realtime all come from one provider. A second stateful service (Redis, a separate socket server) is out of the MVP.

**FastAPI is a peer app under `apps/api`, not a `backend/` project.** pnpm cannot resolve Python or a venv, so a `backend/` directory would be excluded from the workspace regardless. Putting it under `apps/` makes it a peer that root scripts, CI, and `pywrangler deploy` address by a stable path.

**The API runs on Cloudflare Python Workers.** Python Workers reached GA on 2026-09-21 and Cloudflare publishes its own ASGI server, so FastAPI deploys there directly through `workers.asgi` with no uvicorn and no separate hosting provider. Verified against Cloudflare's own documentation. The cost: no greenlet support, so the data layer uses `asyncpg` direct SQL instead of an async ORM, and only pure-Python or PyEmscripten wheels are permitted.

**Authorization lives in Postgres RLS, not application routing.** A client-side redirect is UX; a policy is the boundary. Removing a user from a workspace revokes access on their next query with no cache invalidation.

**Optimistic queue holds ids, not payloads.** Enough to dedupe a remote echo, and far smaller to mirror into localStorage.

**ULID ids generated client-side.** `Math.random()` and `Date.now()` counters collide across sessions, producing duplicate cards on reconnect.

**Sends are serial, not parallel.** Parallel sends reorder on the server and the resulting positions contradict the client's intent.

**Conflict policy is LWW, not a CRDT.** Field CRDTs buy freedom for concurrent edits to one field, which here means two people typing in the same card within the same second. Rare, and LWW degrades to "one edit wins" rather than corruption.

## Task List

### Phase 1: Foundation

- [ ] Task 1: Scaffold the monorepo (`apps/web`, `apps/api`, `packages/shared`)
- [ ] Task 2: Establish the env contract and boundary rules
- [ ] Task 3: CI pipeline green (typecheck, lint, build, pytest, policy tests, secret scan)

**Checkpoint after 1-3:** a fresh clone runs `pnpm typecheck` and `uv run pytest` clean, CI green.

### Phase 2: Data model

- [ ] Task 4: Apply the schema migration and verify RLS
- [ ] Task 5: Policy test suite green in CI against real Postgres
- [ ] Task 6: Ordering trigger verified under concurrent moves

**Checkpoint after 4-6:** outsider reads zero rows, member reads all, viewer cannot write, positions contiguous after mixed moves.

### Phase 3: Auth

- [ ] Task 7: Supabase client wiring (server, client, middleware)
- [ ] Task 8: Sign-in flow with email OTP
- [ ] Task 9: Workspace membership resolution and route guards

**Checkpoint after 7-9:** sign in lands on a workspace with no manual step; a non-member is redirected and their queries return zero rows.

### Phase 4: Realtime fabric

- [ ] Task 10: Realtime subscription hook with typed channels
- [ ] Task 11: Optimistic queue with ULID ids and echo dedup
- [ ] Task 12: Sync state machine (synced / pending / offline / conflict)
- [ ] Task 13: Reconnect drain with backoff

**Checkpoint after 10-13:** two browser windows converge in under 400ms; a 60s outage with 20 queued edits yields no duplicates and no lost work.

### Phase 5: Board shell

- [ ] Task 14: Shared domain types and branded ids
- [ ] Task 15: Typed API client at the FastAPI boundary
- [ ] Task 16: Board page layout (list columns, horizontal scroll, header)

**Checkpoint after 14-16:** board renders from real data with loading, empty, and error states.

### Phase 6: Feature slices (parallelizable)

- [ ] Task 17: Card CRUD with optimistic apply
- [ ] Task 18: Drag-to-reorder with position compaction
- [ ] Task 19: Labels, assignees, due dates
- [ ] Task 20: Comments on cards
- [ ] Task 21: Activity history panel
- [ ] Task 22: Card presence with TTL prune

**Checkpoint after 17-22:** every slice verified in two windows; concurrent drags converge.

### Phase 7: Workspace access

- [ ] Task 23: Workspace switcher
- [ ] Task 24: Member roles and invite by slug

**Checkpoint after 23-24:** role change revokes access immediately; invite link grants read.

### Phase 8: API service

- [ ] Task 25: FastAPI app skeleton with health and config
- [ ] Task 26: Routers for boards, cards, comments, activity
- [ ] Task 27: Worker entrypoint and `pywrangler dev` verified locally
- [ ] Task 28: Cloudflare edge configuration

**Checkpoint after 25-28:** `docker compose up` serves the API; policy tests and pytest green.

### Phase 9: Polish and ship

- [ ] Task 29: Accessibility pass (focus, names, reduced motion, contrast in both themes)
- [ ] Task 30: Observability (structured logs, error boundaries)
- [ ] Task 31: Docs updated (README, DEPLOYMENT, ADRs)
- [ ] Task 32: E2E suite green

**Checkpoint after 29-32:** full scenario passes end-to-end; all success criteria in the spec met.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Realtime latency exceeds the 400ms target on a slow connection | High, breaks core claim | Measure the round trip before building UI on it; if slow, the optimistic queue must cover the gap and the badge must tell the truth |
| Two users reorder simultaneously and one edit silently vanishes | High | LWW is documented and surfaced as a conflict state, not a silent drop |
| Reconnect replays a stale edit and resurrects deleted work | Medium | `409` surfaces a conflict; the queue never auto-resolves it |
| `service_role` key reaches the browser | Critical, full data exposure | Lint rule on `NEXT_PUBLIC_`, CI secret scan, boundary contract |
| Positions drift out of contention under load | Medium | Compaction trigger + policy tests asserting contiguity after mixed moves |
| RLS policy accidentally widened during a refactor | Critical | Policy tests are a required CI gate, not advisory |
| Presence rows orphan when a client is killed | Low, cosmetic | 2-minute TTL plus a prune cron |

## Open Questions

1. **Cloudflare: Terraform or dashboard?** Determines whether `infra/terraform/` exists. Blocking Task 28 only.
2. **API origin host** — which Python-capable host does the operator hold? Blocking Task 27 and 28.

## Parallelization Opportunities

Phases 6's tasks 17-22 are independent feature slices once the board shell (14-16) exists and can be built concurrently. Tasks 23-24 and 25-28 can start in parallel once their dependencies land. Phases 1-5 are sequential because each phase's contract is consumed by the next: schema before auth, auth before realtime, realtime before board, board before features.
