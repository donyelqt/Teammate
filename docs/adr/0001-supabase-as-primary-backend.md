# ADR-0001: Supabase is the primary backend

- Status: accepted
- Date: 2026-11-01
- Deciders: project owner

## Context

The product needs Postgres, authentication, and realtime change propagation. That is three capabilities. Choosing three vendors means three auth models, three failure modes, and three deployment targets. Choosing one provider that offers all three collapses that.

## Decision

Supabase provides auth, Postgres, and Realtime. FastAPI is a peer service for logic that Supabase cannot express, not a second backend. No Redis, no separate socket server, no container orchestrator in the MVP.

## Alternatives considered

| Option | Why not |
|---|---|
| Postgres + Auth0 + Socket.io | Three vendors, three auth models, three failure modes. Cost is not financial, it is integration surface. |
| Postgres + custom realtime on FastAPI websockets | FastAPI holds sockets, so writes must reach Postgres to propagate and the socket server becomes a second source of truth to keep consistent. |
| Firebase | Document store, not relational. Cards in lists in boards in workspaces is a graph that wants joins and transactions. |

## Consequences

Auth, data, and realtime share one failure domain. If Supabase is down, sign-in, reads, and propagation are all degraded together. That is accepted because the alternative is three independent outages instead of one.

Realtime propagates through the database. See [ADR-0004](0004-realtime-through-the-database.md). The service-role key bypasses every RLS policy, so it must never reach the browser. That constraint is enforced by lint and by CI secret scan, and it is the single most dangerous mistake available in this stack.
