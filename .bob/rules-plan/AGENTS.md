# Plan Mode — Architecture Rules

Non-obvious architectural constraints for Astrolabe. Read `AGENTS.md` at root and `astrolabe-plan.md` for full context.

## Hidden Coupling Between Sub-Tasks

- `useBlastWave` (Sub-Task 4) must be complete before `FileInspectorPanel` "Simulate Removal" toggle (Sub-Task 5) can be wired — the context provider must exist in the tree first.
- `riskService.ts` (Sub-Task 3) depends on the `File` table having `imports` as resolved absolute paths — this contract is established in `astService.ts` (Sub-Task 2). If the resolution logic changes, risk detection breaks silently.
- `PatchButton` (Sub-Task 5) calls `POST /api/patch/create-branch` which requires `express-session` and `passport` (Sub-Task 6) — Sub-Task 5 must stub the authenticated path or Sub-Task 6 must be built first.
- GitHub OAuth `express-session` middleware must be registered **before** `passport.initialize()` and **before** any route that reads `req.user`.

## Ingestion is Synchronous by Design (Hackathon Decision)
The `POST /api/repo/analyze` endpoint blocks until clone + parse + DB write completes. For repos approaching the 500-file cap this may take 10–30 seconds. The alternative (async + polling via `GET /api/repo/:repoId/status`) is documented in Sub-Task 7 as an optional upgrade — do not add async complexity unless the synchronous path times out in practice.

## Data Flow: AST Results are Stored, Not Recomputed
After ingestion, all AST data (`imports`, `exports`, `content`) lives in Postgres. The slicer and risk services read from the DB — they do NOT re-clone or re-parse files from disk. Architectural changes that skip storing content will break Sub-Tasks 3 and 6.

## React Flow Constraint
React Flow nodes must receive all visual state through the `data` prop on each node object in the `nodes` array. State passed via React Context is not reflected in node re-renders. Any new per-node visual state (e.g., `pulseState`, risk badge) must be injected into the `nodes` array before passing to `<ReactFlow>`.

## No Shared State Library
The plan does not include Zustand or Redux. State is managed via React Context + `useState`. Do not introduce a state library — it adds complexity without benefit at this scale.
