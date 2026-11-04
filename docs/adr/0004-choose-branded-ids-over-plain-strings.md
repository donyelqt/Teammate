# ADR 0004: Choose branded IDs over plain strings

- **Date**: 2026-11-05
- **Status**: Accepted
- **Deciders**: project owner

## Context

Entity identifiers flow through the API, the database, the realtime stream, and the client. They are UUIDs, and everywhere they appear they are typed as `string`. That is a leaky abstraction: a function that takes a `BoardId` accepts `"hello world"` with no compile-time complaint, and a typo in a column name passes a `CardId` where a `ListId` is expected.

The fix is a branded type: `type CardId = string & { readonly [CardIdBrand]: "CardId" }`. Each brand is a unique symbol, so two different brands are never assignable to each other, and a plain `string` is never assignable to a branded type without an explicit cast.

## Decision

`@teammate/shared` defines branded types for every entity: `Uuid`, `WorkspaceId`, `BoardId`, `ListId`, `CardId`, `CommentId`, `UserId`. Each is a `string` intersected with a branded readonly property. Companion guards (`isCardId`, `isBoardId`, ...) validate at runtime and narrow the type.

All are UUIDs today, so every guard delegates to `isUuid`, which tests the canonical pattern. The brands are kept distinct even though the underlying shape is identical, because the distinction is the point.

## Consequences

Type errors at the boundary are caught at compile time instead of at 3am in production. A call site that mixes up `CardId` and `ListId` fails `tsc` immediately.

The cost is boilerplate. Every place that receives an id from an untrusted source (URL param, API response, `localStorage`) needs a guard call before it can be used as a branded type. The alternative — casting everywhere — silently reintroduces the problem.

## Alternatives considered

| Option | Why not |
|---|---|
| Plain `string` everywhere | No type-level distinction between entity kinds. Typos compile and ship. |
| UUID class wrapper | Runtime overhead, serialization friction, and it still needs a guard to accept unknown input. |
| `ulid` library types | ULIDs are used client-side for optimistic ids (see ADR on the optimistic queue), but persisted rows are UUIDs. Mixing two id shapes adds a conversion step at every boundary. |
| Zod schemas for ids | Validating at runtime is necessary anyway; Zod adds a schema object per type on top of the brand. The brand carries the compile-time guarantee Zod cannot. |