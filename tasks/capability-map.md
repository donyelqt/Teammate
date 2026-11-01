# Capability Map: Teammate

Real-time collaborative Trello-style workspace. 5-10 day MVP.

| Module id | Responsibility | Depends on |
|---|---|---|
| foundation | Monorepo scaffold, TypeScript config, env contract, CI gates | — |
| data-model | Supabase schema, RLS policies, position ordering, activity log | foundation |
| auth | Sign-in, sessions, workspace membership resolution | data-model |
| realtime-fabric | Supabase Realtime subscriptions, optimistic queue, reconnect, conflict-by-LWW | data-model |
| board-shell | Board/list/card domain types, API boundary, board page layout | data-model, realtime-fabric |
| card-editing | Card CRUD, drag-reorder, labels, assignees, due dates | board-shell |
| presence | Per-card editing presence, cursors, stale-prune | card-editing |
| comments | Threaded comments on cards | card-editing |
| activity | Activity history panel from `activity_events` | data-model |
| workspace-access | Workspace switcher, member roles, invite by slug | auth, board-shell |
| api-service | FastAPI service, typed client contract, deployment shape | board-shell, workspace-access |
| observability | Structured logs, error boundaries, health checks | all |

Build order: foundation → data-model → auth → realtime-fabric → board-shell → (card-editing, presence, comments, activity) → workspace-access → api-service → observability

`card-editing` and `comments` and `activity` are parallelizable after `board-shell`.
`workspace-access` and `api-service` are parallelizable after `workspace-access`'s dependency.
