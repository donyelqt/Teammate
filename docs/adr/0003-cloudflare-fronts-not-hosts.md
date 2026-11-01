# ADR-0003: FastAPI deploys to Cloudflare Python Workers, with a constrained data layer

- Status: accepted (supersedes the earlier version of this ADR, which was wrong)
- Date: 2026-11-02
- Deciders: project owner, with a verified correction from the operator

## Context

The product runs FastAPI and needs Postgres. Cloudflare is in the stack. The question is where the Python process lives.

An earlier version of this ADR asserted that Cloudflare Workers could not run uvicorn or native Python, and therefore that Cloudflare could only sit in front of an API hosted elsewhere. That assertion was written from recollection and was checked against primary sources on 2026-11-02. It is false.

## Verified facts

Retrieved from Cloudflare's own documentation and blog on 2026-11-02:

1. **Python Workers reached general availability on 2026-09-21.** Python is a first-class supported language on the platform, not a preview. Source: Cloudflare blog, "Python Workers are now generally available."
2. **FastAPI is supported through Cloudflare's own ASGI server.** `workers.asgi` provides the entrypoint, so FastAPI never needs uvicorn. Source: Cloudflare Workers docs, Python language packages, FastAPI page.
3. **`asyncpg` is Cloudflare's recommended Postgres driver for Python Workers.** Source: Cloudflare Hyperdrive docs, Python Workers page.
4. **Async SQLAlchemy is not supported**, because the runtime lacks greenlet support. Sync SQLAlchemy ORMs work; async ones do not. Source: same Hyperdrive page.
5. **Only pure-Python or PyEmscripten packages run.** No CPython native extensions. WebAssembly wheels are still early, and availability is a per-package question.
6. **Long-running tasks and WebSockets were not verified.** FastAPI compatibility of request routing does not imply every deployment pattern survives the runtime.

## Decision

The FastAPI app deploys to Cloudflare Python Workers via `wrangler`, exposed as a Worker with `compatibility_flags = ["python_workers"]`. No second hosting provider is introduced. Cloudflare is the runtime, not merely a proxy in front of one.

`apps/api` rewired to the ASGI shape Cloudflare expects:

```python
from fastapi import FastAPI
from workers import asgi

app = FastAPI()

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

Default = asgi.entrypoint(app)
```

Consequences are not cosmetic, so each is listed with the change it forces:

| Constraint | Change it forces |
|---|---|
| Async SQLAlchemy unsupported | Drop SQLModel-asyncpg. Use `asyncpg` directly against SQL, or sync SQLAlchemy. No greenlet-dependent ORM. |
| No CPython native extensions | Every dependency audited before it enters `apps/api`. A package with only `manylinux` wheels is a blocker. |
| Runtime differs from local uvicorn | Tests run against `pywrangler dev`, not only uvicorn, before a Worker is called working. |

## Alternatives considered

| Option | Why not |
|---|---|
| Cloudflare only fronts, FastAPI runs on a Python host | Valid, and it was this ADR's original position. It is unnecessary: the runtime supports the stack natively, and a second provider adds a deploy target, a cert, and a failure domain for no gain. |
| Run FastAPI on Vercel's Python runtime | Vercel targets Next.js. A second serverless platform for one service is cost without capability. |
| Workers with a JS/TS handler and no Python | Abandons the requested stack and the type safety FastAPI brings. |

## Consequences

Simplification: one deploy target, no origin host to secure, no certificate to manage at the API. The Terraform edge config becomes a Worker deployment rather than a proxy in front of an external origin.

The cost is real and concentrated in the data layer. RLS moves from a safety net to the *only* authorization mechanism. `SECURITY DEFINER` policies still work; what does not work is an app-level fallback that fixes up a request Postgres rejected. That is a design constraint, not an inconvenience.

The one open risk: Hyperdrive connection pooling through the Workers runtime is untested here. If pooling behaves badly under concurrent load, the fallback is Supabase's connection pooler on a direct `asyncpg` connection, bypassing Hyperdrive. That is a task, not a design change.

The prompt that produced this ADR also carried a correct warning: FastAPI compatibility does not mean every conventional Python pattern survives. Dependencies, DB connectivity, and background tasks each require a test in the actual runtime before production. Recorded as a blocking task, not an assumption.
