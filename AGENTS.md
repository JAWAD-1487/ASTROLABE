# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project
Astrolabe — monorepo with `backend/` (Express/TypeScript/Prisma/Postgres) and `frontend/` (Next.js App Router/TypeScript/Tailwind). Full plan in `astrolabe-plan.md`.

## Ports & Entry Points
- Backend: `http://localhost:3001` (Express, `backend/src/index.ts`)
- Frontend: `http://localhost:3000` (Next.js, proxies `/api/*` to backend via `next.config.ts`)
- Postgres: Docker container via `docker-compose.yml` at repo root

## Critical Architecture Decisions
- **Session strategy**: one active repo per anonymous session — new `POST /api/repo/analyze` DELETES all previous repo+files for that session before inserting new ones. Cookie name: `astrolabe_session`.
- **Gemini fallback**: `gemini-2.5-flash` (GEMINI_KEY_FLASH) → `gemini-2.0-flash-lite` (GEMINI_KEY_FLASH_LITE) → `gemini-1.5-flash-8b` (GEMINI_KEY_FLASH_8B). Fallback triggers on HTTP `429` ONLY; other errors return `502` immediately.
- **Rate limit exhaustion**: return `503` with `{ error: 'RATE_LIMIT_EXHAUSTED', message }` — frontend shows this with a Retry button.
- **Test coverage detection is static**: a file is "covered" if any path in the `File` DB table matches `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.js`, or `__tests__/*` with the same base name. No test runner is executed.
- **Risk Index formula**: `min(100, incomingImportCount * 5 + (hasTestCoverage ? 0 : 20))`. `isBottleneck` = true when `incomingImportCount >= 15 AND hasTestCoverage === false`.
- **Ingestion is synchronous** within the HTTP request (no job queue). File cap is 500; auto-exclude `node_modules`, `dist`, `.git`, `build`. Returns `400` if exceeded.
- **Temp clone path**: `os.tmpdir() + '/astrolabe/<repoId>'` — always cleaned up in a `finally` block.

## Babel Parser Config (non-obvious)
Always pass `{ sourceType: 'module', plugins: ['typescript', 'jsx'] }` to `@babel/parser`. Handle both ESM `import` and CJS `require()`. Skip non-local specifiers (npm packages / absolute paths outside the repo root).

## Graph Edge Direction
`edges` in the graph are `{ from: importerFile, to: importedFile, type: 'import' }`.
For blast-wave BFS (`useBlastWave.ts`), traverse edges **inward** — find nodes where `edge.to === targetNodeId` to get "who imports this file" = "who breaks".

## Frontend State Shape
- `AstroNode` accepts `pulseState: null | 'target' | 'level1' | 'level2' | 'dimmed'` — drive all visual variants from this single prop.
- Only one edge category visible at a time (`activeEdgeType: null | 'import' | 'export'`). Canvas `onClick` clears it.
- `repoId` is passed via React Context (not URL params) to inspector and blast-radius components.
- Blast-radius card **overlays** the canvas at fixed position — does not replace it.

## GitHub OAuth (Sub-Task 6)
- Uses `passport-github2`; access token stored in `express-session` (encrypted).
- `POST /api/patch/create-branch` requires auth middleware. Branch name pattern: `astrolabe/fix-<timestamp>`.
- If `suggestedSafeFix` is not a parseable unified diff, fall back to creating a single file with raw content.
- `PatchButton`: unauthenticated → `.patch` blob download; authenticated → call API → open PR URL in new tab.

## env vars (backend)
`DATABASE_URL`, `PORT`, `FRONTEND_ORIGIN`, `GEMINI_KEY_FLASH`, `GEMINI_KEY_FLASH_LITE`, `GEMINI_KEY_FLASH_8B`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`
