# ADR-0008: Cloudflare configuration is Terraform, not the dashboard

- Status: accepted
- Date: 2026-11-02
- Deciders: project owner

## Context

Cloudflare config now carries real security decisions: rate limits that bound OTP brute force, cache keys that key on `Authorization`, TLS mode. That configuration is part of the security posture, not deployment plumbing.

## Decision

Cloudflare config lives in `infra/terraform` as a Cloudflare provider resource set. Dashboard edits are drift to be reconciled, not a way to make a change.

## Alternatives considered

| Option | Why not |
|---|---|
| Dashboard only | The config exists nowhere in the repo. It cannot be reviewed in a PR, and a silent change to a cache key or a WAF rule is invisible. |
| Pulumi | Same outcome, less familiar, no advantage for a single-cloud single-resource set. |
| Manual + documentation | The doc describes the intent; the dashboard holds the truth. They diverge. |

## Consequences

Requires a Cloudflare API token scoped to DNS edit, zone settings, and WAF.

One rule matters more than the rest: **the API cache key must include `Authorization`.** A cached authenticated response served to a different user is a cross-tenant data leak, and it is exactly the class of bug a dashboard tweak introduces. The rule is codified in Terraform so it is diffable, and a checklist item in `docs/DEPLOYMENT.md` so it is visible.

State starts local. It holds the token in plaintext, so remote state with locking is required before a second person runs `apply`. The backend block is already written and commented.
