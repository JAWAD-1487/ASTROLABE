# Ask Mode — Documentation Context

Non-obvious structure and organisation for Astrolabe. Read `AGENTS.md` at root for full context.

## Where Things Live (Counterintuitive)

- All implementation decisions and component specs are in `astrolabe-plan.md` at the repo root — this is the canonical reference, not inline comments or a `docs/` folder.
- `backend/src/services/` contains all business logic; `backend/src/routes/` are thin controllers only.
- `frontend/hooks/` contains `useBlastWave.ts` (graph BFS state) and `useGitHubAuth.ts` (OAuth state) — not inside `components/`.
- The `File` DB model stores full file `content` as text — it is the source of truth for AST re-parsing at analysis time; no files are re-read from disk after ingestion.

## Two Separate Auth Systems
- Anonymous session: `cookie-parser` + UUID cookie (`astrolabe_session`) — used for session-scoped repo ownership.
- GitHub OAuth: `passport-github2` + `express-session` — used only for the "Create Branch / PR" feature. These are two distinct middleware layers on the backend.

## Gemini Response Schema
The `IMPACT_RESPONSE_SCHEMA` exported from `geminiService.ts` is the single source of truth for what the AI returns. The frontend `BlastRadiusCard` types must exactly match this schema — do not add fields to the frontend type that aren't in the schema.

## Graph Edge Semantics
`edge.from` = the file doing the importing; `edge.to` = the file being imported. "Show Exports" from a node = find edges where `edge.from === nodeId`. "Show Imports" = find edges where `edge.to === nodeId`. The naming is from the perspective of the **selected node**, not the graph direction.
