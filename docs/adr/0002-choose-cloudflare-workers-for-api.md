# ADR 0002: Choose Cloudflare Workers for the API

- **Date**: 2026-11-05
- **Status**: Accepted
- **Deciders**: project owner

## Context

The product runs FastAPI and needs Postgres. Cloudflare is already in the stack for DNS, TLS, WAF, and caching. The question is where the Python process lives.

Python Workers reached general availability on 2026-09-21. Python is a first-class supported language on the platform, not a preview. FastAPI is supported through Cloudflare's own ASGI server (`workers.asgi`), so FastAPI never needs uvicorn.

## Decision

The FastAPI app deploys to Cloudflare Python Workers via `wrangler`, with `compatibility_flags = ["python_workers"]`. No second hosting provider is introduced. Cloudflare is the runtime, not merely a proxy in front of one.

The entrypoint is `apps/api/server/worker.py`:

```python
from workers import asgi
from server.main import app
Default = asgi.entrypoint(app)
```

## Consequences

Simplification: one deploy target, no origin host to secure, no certificate to manage at the API. The Terraform edge config becomes a Worker deployment rather than a proxy in front of an external origin.

The cost is concentrated in the data layer. RLS moves from a safety net to the *only* authorization mechanism. What does not work is an app-level fallback that fixes up a request Postgres rejected. That is a design constraint, not an inconvenience.

| Constraint | Change it forces |
|---|---|
| Async SQLAlchemy unsupported | Use `asyncpg` directly against SQL. No greenlet-dependent ORM. |
| No CPython native extensions | Every dependency audited before it enters `apps/api`. A package with only `manylinux` wheels is a blocker. |
| Runtime differs from local uvicorn | Tests run against `pywrangler dev`, not only uvicorn, before a Worker is called working. |

## Alternatives considered

| Option | Why not |
|---|---|
| Cloudflare only fronts, FastAPI runs on a Python host | Valid, but unnecessary: the runtime supports the stack natively, and a second provider adds a deploy target, a cert, and a failure domain for no gain. |
| Run FastAPI on Vercel's Python runtime | Vercel targets Next.js. A second serverless platform for one service is cost without capability. |
| Workers with a JS/TS handler and no Python | Abandons the requested stack and the type safety FastAPI brings. |