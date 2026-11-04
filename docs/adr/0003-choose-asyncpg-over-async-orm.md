# ADR 0003: Choose asyncpg over an async ORM

- **Date**: 2026-11-05
- **Status**: Accepted
- **Deciders**: project owner

## Context

The API runs on Cloudflare Python Workers, which constrain the data layer. The runtime supports Python 3.13 but no CPython native extensions and no greenlet support. That rules out async SQLAlchemy and Tortoise-ORM, both of which depend on greenlets or C extensions.

Cloudflare's own Hyperdrive documentation recommends `asyncpg` as the Postgres driver for Python Workers. It is pure Python, it speaks the wire protocol directly, and it is the one driver the runtime is known to support.

## Decision

The API uses raw `asyncpg` SQL against a pooled connection (`server/core/db.py`). No ORM, no query builder, no migration framework beyond hand-written SQL in `supabase/migrations/`.

The pool is created lazily on first request (`asyncpg.create_pool`, min 1 / max 10 connections) and torn down on app shutdown. Each request acquires a connection, runs `SET ROLE authenticated`, sets `request.jwt.claim.sub`, and resets both on the way out so a pooled connection never leaks the previous request's principal.

## Consequences

Every query is hand-written SQL. That is more verbose than an ORM and it means schema changes touch two places (the migration file and the query code). In return, there are no surprises from ORM SQL generation, no N+1 queries to debug, and no dependency that can silently break on a runtime upgrade.

The constraint that matters most: RLS is the *only* authorization mechanism. The API has no app-level fallback for a request Postgres rejects. `set_user` exists to make RLS see the right principal, not to double-check it.

## Alternatives considered

| Option | Why not |
|---|---|
| Async SQLAlchemy / SQLModel | Needs greenlets, which the Workers runtime does not support. |
| Tortoise-ORM | Async ORM with C-extension dependencies; same problem. |
| Sync SQLAlchemy | Works, but blocks the event loop on every query and offers no advantage over `asyncpg` here. |
| Prisma / other ORM ported to Python | Not supported on Workers; no path to a pure-Python runtime build. |