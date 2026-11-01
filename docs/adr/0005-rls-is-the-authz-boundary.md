# ADR-0005: Authorization is enforced in Postgres RLS, not application routing

- Status: accepted
- Date: 2026-11-02
- Deciders: project owner

## Context

The product has workspaces with roles: owner, admin, member, viewer. A user outside a workspace must not read or write its data. Data is reachable from two clients (Next.js server code and the FastAPI Worker), plus the browser via Supabase RLS-enforced client access.

## Decision

RLS policies are the authorization boundary. Every table has RLS enabled and policies that route through `workspace_role_of()`. Application checks are UX only.

## Alternatives considered

| Option | Why not |
|---|---|
| API-layer checks in FastAPI | Two clients must both remember to check. The browser's direct Supabase access bypasses the API entirely, so it cannot be the only authority. |
| API-layer checks plus client-side guards | Guards are not security. Every new endpoint is an opportunity to forget. |
| Single shared middleware enforcing roles | Still application code, still reachable from a client that does not call it. |

## Consequences

Because the Worker's DB connection goes through Hyperdrive with the *service role*, RLS is bypassed at that hop. This is the one dangerous consequence, and the mitigation is explicit: the Worker re-establishes `SET LOCAL role = authenticated` plus the caller's JWT claims per transaction, so policies still apply. If that pattern survives no other way, the Worker drops to the anon-key path for user-scoped queries.

DPR: any bug in a policy exposes data. The `supabase/tests/policies.sql` suite asserts an outsider reads zero rows on every table and is a required CI gate, not advisory.

## Verification

That suite is the contract. A session exists solely to make the outsider case observable, and it is the first thing checked.
