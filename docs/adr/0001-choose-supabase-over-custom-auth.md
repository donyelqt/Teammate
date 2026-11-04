# ADR 0001: Choose Supabase over custom auth

- **Date**: 2026-11-05
- **Status**: Accepted
- **Deciders**: project owner

## Context

The product needs authentication, a Postgres database, and realtime change propagation. That is three capabilities. Choosing three vendors means three auth models, three failure modes, and three deployment targets. Choosing one provider that offers all three collapses that surface.

Supabase provides Auth (email OTP + OAuth), Postgres, and Realtime (Postgres WAL streaming) out of the box. It also gives us Row Level Security as a native database feature rather than an app-layer mimic.

## Decision

Supabase is the primary backend. FastAPI is a peer service for logic Supabase cannot express, not a second backend. No Redis, no separate socket server, no container orchestrator in the MVP.

## Consequences

Auth, data, and realtime share one failure domain. If Supabase is down, sign-in, reads, and propagation all degrade together. That is accepted because the alternative is three independent outages instead of one.

The service-role key bypasses every RLS policy, so it must never reach the browser. It lives only in `apps/api` and is enforced by lint and CI secret scan. This is the single most dangerous mistake available in this stack.

## Alternatives considered

| Option | Why not |
|---|---|
| Postgres + Auth0 + Socket.io | Three vendors, three auth models, three failure modes. Cost is not financial, it is integration surface. |
| Postgres + custom realtime on FastAPI websockets | FastAPI holds sockets, so writes must reach Postgres to propagate and the socket server becomes a second source of truth to keep consistent. |
| Firebase | Document store, not relational. Cards in lists in boards in workspaces is a graph that wants joins and transactions. |
| Supabase + self-hosted realtime | Adds an ops burden for no capability gain; Supabase realtime is already Postgres-native. |