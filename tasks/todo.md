# Task List: Teammate

## Phase 4: Realtime fabric — COMPLETE
## Phase 5: Board shell — IN PROGRESS

- [x] Task 14: Shared domain types and branded ids (PR #13 merged)
- [x] Task 15: Typed API client at FastAPI boundary (PR pending, commit 0b2a76f)
- [x] Task 16: Board page layout
  - Acceptance: list columns scroll horizontally, header stable, `min-h-[100dvh]` not `h-screen`, empty and loading states
  - Verify: render at 375px, 768px, 1440px; both themes
  - Files: `apps/web/app/(app)/board/[id]/page.tsx`, `apps/web/components/board/*`
  - Scope: Large
- [x] Checkpoint: board renders from real data with loading, empty, and error states
