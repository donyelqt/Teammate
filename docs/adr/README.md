# Architecture Decision Records

Each ADR is one decision that is expensive to reverse. Statuses: `proposed`, `accepted`, `deprecated`, `superseded by ADR-XXXX`.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-supabase-as-primary-backend.md) | Supabase is the primary backend; no second stateful service | accepted |
| [0002](0002-api-lives-under-apps.md) | FastAPI is a peer app under `apps/api`, not `backend/` | accepted |
| [0003](0003-cloudflare-fronts-not-hosts.md) | FastAPI runs on Cloudflare Python Workers, with a constrained data layer | accepted (superseded its own original) |
| [0004](0004-realtime-through-the-database.md) | Realtime propagates through Postgres, not through FastAPI | accepted |
| [0005](0005-rls-is-the-authz-boundary.md) | Authorization is enforced in Postgres RLS, not app routing | accepted |
| [0006](0006-last-write-wins-not-crdt.md) | Conflict policy is last-write-wins, not a CRDT | accepted |
| [0007](0007-ulids-and-optimistic-queue.md) | Client-generated ULIDs with a serial reconnect drain | accepted |
| [0008](0008-terraform-for-edge-config.md) | Cloudflare config is Terraform, not dashboard | accepted |
| [0009](0009-design-tokens-for-teammate.md) | Design tokens: teal primary, Geist, no serif, no Inter | accepted |
| [0001-choose-supabase-over-custom-auth](0001-choose-supabase-over-custom-auth.md) | Supabase (Auth + Realtime + RLS + Postgres) chosen over custom auth/realtime | accepted |
| [0002-choose-cloudflare-workers-for-api](0002-choose-cloudflare-workers-for-api.md) | API runs on Cloudflare Workers (Pyodide/PyEmscripten, no async ORM, edge deploy) instead of a traditional ASGI server | accepted |
| [0003-choose-asyncpg-over-async-orm](0003-choose-asyncpg-over-async-orm.md) | Raw `asyncpg` SQL instead of SQLAlchemy/Tortoise-ORM (Workers constraints, no C extensions) | accepted |
| [0004-choose-branded-ids-over-plain-strings](0004-choose-branded-ids-over-plain-strings.md) | `CardId`, `BoardId`, etc. are branded types in `@teammate/shared`, not plain `string` | accepted |

## How to add one

Copy the template below. Number is the next free integer. Never renumber, never edit a decision after it is accepted — write a new ADR that supersedes it and mark the old one.

```markdown
# ADR-XXXX: Title

- Status: proposed
- Date: YYYY-MM-DD
- Deciders: who was in the room

## Context
What forces the decision. The constraint that makes it unavoidable.

## Decision
What we are doing, in one paragraph.

## Alternatives considered
| Option | Why not |
|---|---|
| ... | ... |

## Consequences
What becomes easier. What becomes harder. What we are explicitly accepting.
