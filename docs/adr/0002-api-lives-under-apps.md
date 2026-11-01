# ADR-0002: FastAPI lives under apps, not backend

- Status: accepted
- Date: 2026-11-01
- Deciders: project owner

## Context

The repo is a monorepo. The Python service needs a directory. The instinct is `backend/`, because it is not the frontend.

## Decision

The FastAPI service is at `apps/api`, a peer of `apps/web`. Not `backend/`, not `services/api`, not `server/`.

## Alternatives considered

| Option | Why not |
|---|---|
| `backend/api` | Reads as "everything behind the frontend", but the web server is also behind the frontend. It describes position in a request, not a deployable. |
| `services/api` | Implies multiple services where there is one. The plural names a scale that does not exist. |
| `apps/api` | Turborepo and Vercel convention. Every deployable is a peer under `apps/`, addressable by the same name in root scripts, CI, Docker, and deploy config. |

## Consequences

Root scripts and CI can address the API by a stable path. `docker compose build ./apps/api` and `working-directory: apps/api` in CI read as ordinary.

The remaining asymmetry: `apps/api` is a Python project with a venv, and pnpm cannot resolve it. So it is excluded from `pnpm-workspace.yaml` rather than silently listed and ignored. The pnpm workspace covers `apps/web` and `packages/*`; the API is built with `uv`. Two toolchains in one repo, one workspace file that knows only about one of them.

Anyone expecting to `pnpm install` and have the API running will be wrong. The README must state both install commands.
