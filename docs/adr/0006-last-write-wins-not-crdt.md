# ADR-0006: Last-write-wins per field, not a CRDT

- Status: accepted
- Date: 2026-11-02
- Deciders: project owner

## Context

Two users can edit the same card. The question is what happens when they do.

## Decision

Each field's latest write wins, with `updated_at` as the arbiter. When a client's queued write arrives and the server holds a strictly newer version, the server responds `409` and the client shows a conflict state the user resolves. The queue never auto-resolves.

## Alternatives considered

| Option | Why not |
|---|---|
| Field-level CRDTs | Adds permanent complexity to every model and write path to cover concurrent edits to the same field, which here means two people typing in one card within the same second. Rare, and LWW degrades to "one edit wins" rather than corruption. |
| Server-side merge by timestamp | Same as LWW with extra moving parts. |
| Locking / check-out | Kills the collaboration that is the product's reason to exist. |

## Consequences

The honest cost: a slow reconnect can lose an edit. The design accepts that and pays it visibly with a conflict badge rather than silently.

Consequence for position ordering specifically: concurrent drags converge to whichever write landed second. That is LWW and it is the documented policy. The `reorder_positions()` trigger compacts to a canonical contiguity so there is no ambiguity about gaps, only about which order.

## Verification

`supabase/tests/policies.sql` asserts positions stay contiguous per parent after insert, delete, and move, which is the part LWW depends on to converge at all.
