# Astrolabe — Implementation Plan

## Overview

**Astrolabe** is an interactive codebase visualizer and AI blast-radius engine.

A user submits a public GitHub repo URL. The backend clones the repo, parses all JS/TS files via AST (zero LLM tokens), and builds a dependency graph. The frontend renders this graph as an interactive canvas. The user picks a file and a specific line, proposes a change, and AI (Google Gemini) returns a structured JSON impact analysis — rendered as an animated "blast-radius" card with severity, breakage breakdown, and a safe-fix diff.

**Monorepo structure:**
```
Astrolabe/
├── backend/   (Node.js, Express, TypeScript, Prisma, Postgres)
└── frontend/  (Next.js App Router, TypeScript, Tailwind CSS, React Flow, Framer Motion)
```

**Decisions made during planning:**
- Gemini fallback chain: `gemini-2.5-flash` → `gemini-2.0-flash-lite` → `gemini-1.5-flash-8b` (one API key per model in `.env`)
- Session strategy: one active repo per anonymous session — new analysis replaces previous
- File cap: 500 files max; auto-exclude `node_modules`, `dist`, `.git`, `build`
- Code viewer: `react-syntax-highlighter`
- Graph canvas: `@xyflow/react` (React Flow v12)
- Animations: `framer-motion`
- GitHub OAuth: included for "Create Branch / PR" feature; patch download is the unauthenticated fallback
- Test coverage detection: purely static — a file is "covered" if a matching `*.test.*` or `__tests__/*` sibling file exists in the repo (no test runner required)

---

## Sub-Task 1 — Monorepo Scaffold & Backend Foundation

**Status:** `[x] complete`

**Intent:**
Set up the repository structure, initialize both workspaces, configure TypeScript for the backend, and wire up the Express server with basic middleware so all subsequent sub-tasks have a stable foundation to build on.

**Expected Outcomes:**
- `backend/` and `frontend/` directories exist with correct `package.json` files
- Backend Express server starts and responds to `GET /health`
- `cookie-parser` is configured and attaches an anonymous `sessionId` (UUIDv4) cookie on every request
- Prisma schema is defined and migrations run against a Dockerized Postgres instance
- A `docker-compose.yml` at the root starts the Postgres container

**Todo List:**
1. Create root `package.json` (workspaces: `["backend", "frontend"]`)
2. Scaffold `backend/` with `tsconfig.json`, `package.json`, `src/index.ts`
3. Install backend dependencies: `express`, `cookie-parser`, `uuid`, `prisma`, `@prisma/client`, `cors`, `dotenv`
4. Install backend dev dependencies: `typescript`, `ts-node`, `nodemon`, `@types/*`
5. Configure `tsconfig.json` (strict mode, `ES2022`, `commonjs`)
6. Create `docker-compose.yml` at root with a Postgres 15 service
7. Define Prisma schema:
   - `Repository` model: `id`, `sessionId`, `repoUrl`, `status` (enum: PENDING/PROCESSING/READY/FAILED), `errorMessage`, `createdAt`
   - `File` model: `id`, `repoId`, `path`, `lineCount`, `content` (text), `imports` (JSON), `exports` (JSON)
8. Run `prisma migrate dev` to generate migration
9. Create `src/index.ts`: Express app, `cookie-parser` middleware, session-cookie middleware (attach UUIDv4 if not present), `GET /health` route
10. Scaffold `frontend/` with `create-next-app` (App Router, TypeScript, Tailwind)

**Relevant Context:**
- Session cookie name: `astrolabe_session`
- Cookie options: `httpOnly: true`, `sameSite: 'lax'`, `maxAge: 7 days`
- Postgres connection string goes in `backend/.env` as `DATABASE_URL`

---

## Sub-Task 2 — Repo Ingestion & AST Dependency Graph

**Status:** `[x] complete`

**Intent:**
Implement the `POST /api/repo/analyze` endpoint that clones a GitHub repo, parses all JS/TS files with `@babel/parser`, extracts import/export relationships, persists everything to the database, and returns a clean graph payload.

**Expected Outcomes:**
- Endpoint accepts `{ repoUrl }`, validates it is a GitHub HTTPS URL
- Repo is shallow-cloned to a temp directory using `simple-git`
- Files are filtered: only `.js`, `.jsx`, `.ts`, `.tsx`; excludes `node_modules`, `dist`, `.git`, `build`
- Returns `400` with a clear error message if file count exceeds 500 and delete the clone repo from dist.
- Each file's content, line count, imports (array of resolved relative paths), and exports (array of exported identifier names) are stored in the `File` table
- Existing repo+files for the session are deleted before the new analysis runs (replace strategy)
- Response: `{ repoId, nodes: [{ id, path, lineCount, fileType }], edges: [{ from, to, type: 'import' }] }`

**Todo List:**
1. Install: `simple-git`, `@babel/parser`, `@babel/traverse`, `@babel/types`, `glob`, `uuid`
2. Create `src/services/gitService.ts`: clone repo to `tmp/<repoId>/` using `simple-git` shallow clone (`--depth 1`)
3. Create `src/services/astService.ts`:
   - `parseFile(filePath, content)` → extracts `imports[]` (resolved absolute paths within repo) and `exports[]` (identifier names)
   - Handle both `import` statements and `require()` calls
   - Resolve relative specifiers to actual file paths (try with and without extensions)
   - Skip non-local imports (npm packages, absolute paths outside repo)
4. Create `src/services/ingestionService.ts`: orchestrates clone → file discovery → parse loop → DB write
5. Create `src/routes/repoRoutes.ts` with `POST /api/repo/analyze`
6. Add validation: GitHub URL regex check, 500-file cap check
7. Cleanup temp directory after DB write (or on failure) using `fs.rm`
8. Return the graph in the specified format; include `fileType` on each node (extension without dot)

**Relevant Context:**
- `@babel/parser` options needed: `sourceType: 'module'`, `plugins: ['typescript', 'jsx']`
- Import path resolution: try exact path, then append `.ts`, `.tsx`, `.js`, `.jsx`, then `index.ts`, etc.
- Temp clone path: `os.tmpdir() + '/astrolabe/<repoId>'`
- Ingestion is synchronous within the request (acceptable for hackathon); status field is set to PROCESSING at start and READY or FAILED at end

---

## Sub-Task 3 — Context Slicer, Risk Index & Gemini Impact Analysis Endpoint

**Status:** `[x] complete`

**Intent:**
Implement `POST /api/impact/evaluate` which slices the minimal relevant code context, calculates the Repo Risk Index for the target file, calls Google Gemini with structured output mode, and returns a strict JSON impact report. Implement the three-model fallback chain with proper error handling.

**Expected Outcomes:**
- Endpoint accepts `{ repoId, filePath, lineNumber, proposedChange }`
- Identifies the enclosing function/block at the given `lineNumber` using the AST
- Finds all files that import from `filePath`, sorts by directness, caps at top 5
- Extracts only the call-site snippet (the specific lines that reference the target symbol) from each dependent — not full file content
- Sends the minimal context slice to Gemini using `@google/genai` with `responseSchema` enforcing the exact JSON shape
- Fallback chain: `gemini-2.5-flash` → `gemini-2.0-flash-lite` → `gemini-1.5-flash-8b`; triggers on `429` rate-limit errors only
- If all three models are exhausted, returns a structured `503` error with `{ error: 'RATE_LIMIT_EXHAUSTED', message: '...' }`
- All other Gemini errors surface as structured `502` responses
- Response includes all original fields plus `riskIndex` (1–100), `isBottleneck` (boolean), `bottleneckReason` (string or null), `incomingImportCount`, `hasTestCoverage`

**Repo Risk Index calculation (pure static, no LLM):**
- `incomingImportCount`: number of files that import from `filePath`
- `hasTestCoverage`: true if a `*.test.*` or `__tests__/*` sibling file exists
- Score formula: `min(100, incomingImportCount * 5 + (hasTestCoverage ? 0 : 20))`
- `isBottleneck`: true when `incomingImportCount >= 15` AND `hasTestCoverage === false`

**Todo List:**
1. Install: `@google/genai`
2. Create `src/services/geminiService.ts`:
   - Define the three model names and their API keys from env (`GEMINI_KEY_FLASH`, `GEMINI_KEY_FLASH_LITE`, `GEMINI_KEY_FLASH_8B`)
   - `callGeminiWithFallback(prompt, schema)` — iterates through models, catches `429`, falls through
   - Use `responseSchema` / JSON mode to enforce the output shape
3. Create `src/services/slicerService.ts`:
   - `findEnclosingBlock(fileContent, lineNumber)` — uses `@babel/parser` + `@babel/traverse` to find the smallest function/arrow/method node that contains the line
   - `extractCallSites(dependentContent, targetSymbols)` — finds lines in dependent files that reference the exported symbols, returns ±3 lines of context around each call
4. Create `src/services/riskService.ts`:
   - `calculateRiskIndex(filePath, repoId)` — queries DB for incoming import count, checks for test file siblings, returns `{ riskIndex, isBottleneck, bottleneckReason, hasTestCoverage, incomingImportCount }`
   - Test file detection: check if any file path in the DB matches `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.js`, or is in a `__tests__` folder AND shares the same base name as `filePath`
5. Create `src/routes/impactRoutes.ts` with `POST /api/impact/evaluate`
6. Compose the prompt: target file path, enclosing block source, proposed change, and call-site snippets from top 5 dependents
7. Define and export `IMPACT_RESPONSE_SCHEMA` (Gemini `responseSchema` format) matching the required JSON shape
8. Wire up error responses for: repo not found, file not in DB, line out of range, Gemini errors

**Relevant Context:**
- Gemini env vars: `GEMINI_KEY_FLASH`, `GEMINI_KEY_FLASH_LITE`, `GEMINI_KEY_FLASH_8B`
- The `proposedChange` field is a free-text string (e.g., "change return type from string to number" or "delete this function")
- `suggestedSafeFix` in the response should be a unified diff string or a code block with explanation

---

## Sub-Task 4 — Frontend: Repo Input & Graph Canvas

**Status:** `[x] complete`

**Intent:**
Build the Next.js frontend pages for repo URL input and the interactive React Flow dependency graph canvas, including node design, the import/export edge reveal interaction, and the Simulate Removal canvas animation (pulse + dim + traveling wave).

**Expected Outcomes:**
- Landing page has a centered input bar for the GitHub URL with a pulsing loading state during analysis
- On success, transitions to the graph canvas page
- Nodes display: file name, file extension badge (color-coded), and line count
- Default state: all edges are hidden
- Clicking a node shows a context menu with two buttons: "Show Exports" (green edges) and "Show Imports" (red edges)
- Only one edge category visible at a time; clicking the canvas background clears all active edges
- Edges are animated with a glowing curved style
- Error states (repo too large, clone failure, invalid URL) display clear toast notifications
- **Simulate Removal animation** triggered from the inspector panel:
  - Primary file node pulses red (Framer Motion keyframe loop)
  - Nodes with no dependency path to the target immediately drop to 20% opacity
  - Level-1 dependents highlight with a red border; after 400ms, level-2 dependents highlight with an amber border

**Todo List:**
1. Install frontend dependencies: `@xyflow/react`, `framer-motion`, `react-syntax-highlighter`, `@types/react-syntax-highlighter`, `axios`
2. Create `app/page.tsx`: repo URL input form, calls `POST /api/repo/analyze` (proxied to backend), transitions to canvas on success
3. Create `components/graph/AstroNode.tsx`: custom React Flow node with file name, extension badge, line count; accepts `pulseState` prop (`null | 'target' | 'level1' | 'level2' | 'dimmed'`) to drive visual state via Framer Motion variants
4. Create `app/graph/page.tsx`: React Flow canvas, receives graph data from state/URL params
5. Implement edge visibility logic: `activeEdgeType` state (`null | 'import' | 'export'`), computes visible edges from full edge list
6. Create `components/graph/NodeContextMenu.tsx`: appears on node click, contains "Show Exports" / "Show Imports" / "Inspect File" buttons
7. Style edges: green glowing animated stroke for exports, red for imports — use React Flow's `edgeTypes` or inline `style`
8. Add canvas `onClick` handler to clear active edges
9. Create `hooks/useBlastWave.ts`:
   - BFS from `targetNodeId` over edges to find level-1 and level-2 dependent node IDs
   - Returns `{ targetId, level1Ids, level2Ids, dimmedIds }` and exposes `triggerWave(nodeId)` / `clearWave()`
   - BFS direction: follow edges INWARD (nodes that import the target), matching "who breaks" semantics
10. Wire `triggerWave` to the "Simulate Removal" toggle in the inspector panel via shared React context
11. Configure Next.js `next.config.ts` to proxy `/api/*` requests to the backend (`http://localhost:3001`)

**Relevant Context:**
- Graph data is fetched once on the graph page mount (stored in React state or Zustand)
- The graph page receives `repoId` as a query param after successful analysis
- React Flow canvas must be wrapped in `<ReactFlowProvider>` and sized to `100vw / 100vh`

---

## Sub-Task 5 — Frontend: Code Viewer & Blast-Radius Card

**Status:** `[x] complete`

**Intent:**
Build the file inspection slide-over panel (with line selection) and the animated blast-radius result card. Wire the full frontend flow from line selection → API call → animated result display, including the Risk Index badge, PR comment preview, Generate Patch / Create Branch button, and error handling with a retry button.

**Expected Outcomes:**
- Double-clicking a node or clicking "Inspect File" opens a slide-over panel on the right
- Panel shows: file path, export count, import count, and full syntax-highlighted source with line numbers
- Clicking a line selects it (highlight), shows a text input for `proposedChange` and an "Analyze Blast Radius" button
- A "Simulate Removal" toggle pre-fills `proposedChange` with "Delete this function/block" AND triggers the canvas blast-wave animation
- While analysis runs: the blast-radius card shows a scanning beam skeleton
- On success: animated card with severity badge, animated score meter (1–100), summary, collapsible affected files list, and syntax-highlighted safe-fix diff
- **Risk Index badge**: shows 1–100 score, incoming import count, test coverage status; shows "⚠️ High-Risk Bottleneck" banner if `isBottleneck === true`
- **PR Comment Preview**: "📋 Copy PR Comment" button generates and copies formatted GitHub PR markdown to clipboard
- **Generate Patch / Create Branch**: button next to the safe-fix diff; downloads `.patch` if unauthenticated, or calls `POST /api/patch/create-branch` and opens PR URL if authenticated via GitHub OAuth
- On error (rate-limit or other): card shows error message with a "Retry" button
- Severity badge colors: CRITICAL = red, HIGH = orange, MEDIUM = amber, LOW = green

**Todo List:**
1. Create `components/inspector/FileInspectorPanel.tsx`: slide-over drawer (Framer Motion `x` slide animation), renders `react-syntax-highlighter` with line number click handler
2. Add `selectedLine` and `proposedChange` state; show the analysis trigger UI below the code view
3. Wire "Simulate Removal" toggle to call `triggerWave(nodeId)` from `useBlastWave` context
4. Create `components/blast/BlastRadiusCard.tsx`: floating card with Framer Motion entrance animation
5. Create `components/blast/SeverityMeter.tsx`: animated arc/bar meter that counts up from 0 to `severityScore`, color changes at thresholds
6. Create `components/blast/RiskIndexBadge.tsx`: displays `riskIndex`, `incomingImportCount`, `hasTestCoverage`; prominent "⚠️ High-Risk Bottleneck" banner when `isBottleneck === true`
7. Create `components/blast/AffectedFilesList.tsx`: collapsible list per item showing `filePath`, `callSite`, `breakageReason`, `isBreakingChange` badge
8. Create `components/blast/SafeFixBlock.tsx`: `react-syntax-highlighter` diff block + action buttons row
9. Create `components/blast/PRCommentButton.tsx`: formats PR markdown from result data, copies to clipboard, shows "✓ Copied!" confirmation for 2 seconds
10. Create `components/blast/PatchButton.tsx`:
    - Unauthenticated: generates `.patch` blob from `suggestedSafeFix` diff and triggers browser download
    - Authenticated: calls `POST /api/patch/create-branch`; opens returned PR URL in new tab
11. Wire `POST /api/impact/evaluate` call from inspector panel; pass `repoId`, `filePath`, `lineNumber`, `proposedChange`
12. Implement error state in `BlastRadiusCard`: error message + "Retry" button
13. Implement loading skeleton state in `BlastRadiusCard`: pulsing scan-line animation

**PR Comment markdown format:**
```
### ⚠️ BlastRadius Analysis
- **Severity:** {severity} (Score: {severityScore}/100)
- **Risk Index:** {riskIndex}/100{isBottleneck ? ' — ⚠️ High-Risk Bottleneck' : ''}
- **Blast Radius:** {affectedFiles.length} dependent files impacted
- **Breaking Change:** {first breaking callSite summary}
```

**Relevant Context:**
- `repoId` must be passed into all child components (React Context or prop drilling)
- The blast-radius card overlays the canvas (fixed position), not replaces it
- `proposedChange` is required — disable "Analyze" button if empty and "Simulate Removal" is not toggled
- GitHub auth state is managed by `useGitHubAuth` hook (implemented in Sub-Task 7)

---

## Sub-Task 6 — GitHub OAuth & Patch / Branch Creation

**Status:** `[x] complete`

**Intent:**
Implement GitHub OAuth login on the frontend and the backend endpoint that generates a branch/PR from the suggested safe fix. Also provide the unauthenticated `.patch` download path.

**Expected Outcomes:**
- Users can sign in with GitHub via OAuth (GitHub App or OAuth App); auth state persists in a session cookie
- `GET /api/auth/github` initiates the OAuth flow; `GET /api/auth/github/callback` exchanges the code for an access token and sets it in the session
- `GET /api/auth/me` returns `{ login, avatarUrl }` if authenticated, `401` otherwise
- `POST /api/patch/create-branch` accepts `{ repoId, suggestedSafeFix }`, uses the GitHub REST API (`@octokit/rest`) to create a new branch on the user's fork (or the original repo if they have write access), commits the patched files, and returns a `{ prUrl }` to open in the browser
- Frontend `useGitHubAuth` hook manages auth state (checks `GET /api/auth/me` on mount, exposes `login()` and `logout()`)
- A "Sign in with GitHub" button appears in the top-right corner of the graph canvas page; after login it shows the user avatar

**Todo List:**
1. Install: `@octokit/rest`, `passport`, `passport-github2`, `express-session`
2. Register a GitHub OAuth App; document required callback URL in `README.md`
3. Create `src/routes/authRoutes.ts`: `GET /api/auth/github`, `GET /api/auth/github/callback`, `GET /api/auth/me`, `GET /api/auth/logout`
4. Store GitHub access token in the Express session (encrypted); add `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET` to `backend/.env.example`
5. Create `src/services/githubPatchService.ts`:
   - Parse `suggestedSafeFix` unified diff to extract changed files and hunks
   - Use `@octokit/rest` to: get default branch SHA → create new branch `astrolabe/fix-<timestamp>` → create/update blobs for each changed file → open a PR with a standard title and body
6. Create `src/routes/patchRoutes.ts` with `POST /api/patch/create-branch` (requires auth middleware)
7. Create frontend `hooks/useGitHubAuth.ts`: checks `GET /api/auth/me`, exposes `{ user, login, logout, isAuthenticated }`
8. Add "Sign in with GitHub" button to graph canvas page header
9. Wire `PatchButton` component (Sub-Task 5) to use `isAuthenticated` state — download vs. API call branch

**Relevant Context:**
- OAuth callback URL for local dev: `http://localhost:3001/api/auth/github/callback`
- The patch service assumes `suggestedSafeFix` is a valid unified diff string; if it is not parseable, fall back to creating a single file with the raw content
- `@octokit/rest` requires the user's `access_token` from the session for all API calls

---

## Sub-Task 7 — Integration, Error Handling & Polish

**Status:** `[x] complete`

**Intent:**
Wire the full stack together end-to-end, harden error surfaces, add the CORS configuration, finalize the `.env` setup, and ensure the app runs cleanly with a single startup command.

**Expected Outcomes:**
- `docker-compose up` starts Postgres; backend and frontend start independently with `npm run dev`
- All `.env.example` files are present for both `backend/` and `frontend/`
- CORS is configured on the backend to allow requests from the Next.js dev origin
- All API errors surface to the frontend as readable messages (not raw stack traces)
- Repo ingestion shows a progress state on the frontend (polling or immediate response)
- The app works end-to-end: URL → graph → inspect → analyze → blast-radius card → patch/PR

**Todo List:**
1. Finalize `backend/.env.example`: `DATABASE_URL`, `PORT`, `FRONTEND_ORIGIN`, `GEMINI_KEY_FLASH`, `GEMINI_KEY_FLASH_LITE`, `GEMINI_KEY_FLASH_8B`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`
2. Finalize `frontend/.env.example` with `NEXT_PUBLIC_API_URL`
3. Configure `cors` middleware on the backend to allow `FRONTEND_ORIGIN` with `credentials: true`
4. Add global Express error handler (`src/middleware/errorHandler.ts`) that formats all errors as `{ error: string, message: string }`
5. Ensure temp directories are always cleaned up (`finally` blocks in ingestion service)
6. Add a `GET /api/repo/:repoId/status` endpoint for the frontend to poll ingestion status
7. Test full flow: real GitHub repo → graph → inspect → analyze → card animates → PR comment → patch/branch creation
8. Add `README.md` at root: prerequisites, env setup, GitHub OAuth App registration steps, `docker-compose up`, `npm install`, `npm run dev`

**Relevant Context:**
- Backend port: `3001` (default, overridable via `PORT` env var)
- Frontend port: `3000` (Next.js default)
- The ingestion endpoint can be made async (returns `repoId` immediately, frontend polls status) to avoid request timeout on large repos
