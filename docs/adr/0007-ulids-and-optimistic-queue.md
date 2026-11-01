# ADR-0007: Client-generated ULIDs with a serial reconnect drain

- Status: accepted
- Date: 2026-11-02
- Deciders: project owner

## Context

Optimistic UI shows local edits before the server confirms. That creates a re-identification problem: the optimistic card and the confirmed card are the same card, and the client must know that when the server's echo arrives.

## Decision

Ids are ULIDs generated client-side, so an offline-created card has a stable identity before it reaches the server. The optimistic queue holds the *id set* only, mirrored to localStorage. Sends are serial, drained oldest-first, with exponential jittered backoff capped at 30s. Transport failures keep the item; `409` drops it into a visible conflict state.

## Alternatives considered

| Option | Why not |
|---|---|
| `Math.random()` ids | Collide across sessions. Two offline clients generate the same id and one card silently replaces the other. |
| `Date.now()` counter | Collides on fast creation and on clock skew. No ordering guarantee that holds across devices. |
| Store payloads in localStorage | Wasted bytes. Ids are enough to dedupe the remote echo. |
| Parallel sends | Server-side reorder, so resulting `position` values contradict client intent. |

## Consequences

Serial draining caps throughput, and that is correct: order *is* the feature for a kanban board.

Because ids come from the client, the server must treat an inserted id as authoritative rather than generating one. Consequence: a hostile client can choose an id. Harmless here because RLS still governs the row's visibility, and it is recorded so a future session does not "fix" the server to mint ids and break dedupe.

## Verification

Table-driven tests on the queue covering echo, duplicate echo, and reconnect. The observable claim is the reconnect scenario in the spec: a 60-second outage with 20 queued edits yields no duplicate cards and no lost work.
