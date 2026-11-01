# ADR-0004: Realtime goes through the database, not through the API

- Status: accepted
- Date: 2026-11-01
- Deciders: project owner

## Context

Two users must see each other's changes. There are two shapes: the API broadcasts changes itself, or the database broadcasts changes clients subscribe to.

## Decision

Supabase Realtime streams Postgres WAL changes to subscribed clients. FastAPI holds no socket connections and no in-memory event bus.

## Alternatives considered

| Option | Why not |
|---|---|
| FastAPI websockets + in-process broadcast | A second source of truth. Every write must reach both the socket and the DB, and the two drift the moment a process restarts or scales past one instance. |
| Redis pub/sub between API instances | Solves multi-instance broadcast, adds a stateful service to operate, and still needs the DB round trip. |
| Client polling | Latency ceiling is the poll interval, so the 400ms target means a 200ms poll, which is a lot of empty requests. |

## Consequences

The invariant that follows: **a write that does not reach Postgres does not propagate.** This rules out any design where the client queues a mutation somewhere other than a DB transaction.

Every write is a Postgres round trip. Read-heavy fanout is the same. That cost is accepted because there is exactly one path for data to move, and it is the one we already need.

Reconnection is simpler than it would be with a server-side event log: resubscribe forces a fresh refetch of the board, so the client does not need to replay missed events. This is why the reconnect drain only needs to handle the client's own unsent work, not a gap in a server stream.

WAL adds write overhead. For an MVP's write volume that is noise. It becomes a real cost only at a scale this product will not reach first.
