# Agent Mode — Coding Rules

Non-obvious implementation constraints for Astrolabe. Read `AGENTS.md` at root for full context.

## Backend Services — Required Patterns

- `geminiService.ts`: fallback iterates the 3 model+key pairs in order; catch the error, check for `429` status, only then advance to next model. Any other error must break out and return `502`.
- `riskService.ts` queries the `File` table (via Prisma) for `imports` JSON fields — the stored value is an array of resolved **absolute repo paths**, not raw specifiers. Match against those resolved paths.
- `slicerService.ts` must call `@babel/parser` with `{ sourceType: 'module', plugins: ['typescript', 'jsx'] }` — missing `jsx` plugin will throw on `.tsx` files silently treated as `.ts`.
- `ingestionService.ts` must delete the previous `Repository` record (cascade deletes `File` rows) **before** inserting the new one for the session — not after. Doing it after leaves orphaned files if the new ingestion fails.
- Temp directory cleanup belongs in a `finally` block wrapping the entire ingestion pipeline — not just the success path.
- `POST /api/impact/evaluate` must run `riskService.calculateRiskIndex` **before** the Gemini call and merge results into the final response — the risk fields are computed locally, not by the LLM.

## Frontend — Non-Obvious Coupling

- `useBlastWave` context must be provided **above** both the graph canvas and the inspector panel in the React tree so both can read/write wave state.
- `AstroNode` must read `pulseState` from React Flow node `data` (passed via `nodes` array), not from a separate context — React Flow re-renders nodes via the `nodes` prop, not context subscriptions.
- Edge visibility is computed in the graph page, not inside the node: filter the full edge list each render based on `activeEdgeType` and the selected node ID.
- `BlastRadiusCard` is rendered inside the graph page layout at `position: fixed` — rendering it inside `FileInspectorPanel` will clip it behind the panel's `overflow: hidden`.

## TypeScript — Backend tsconfig
- Target: `ES2022`, module: `commonjs`, strict: `true`. Do not use `ES module` imports in backend files — Prisma client generation and `ts-node` both require CJS.

## Prisma
- `imports` and `exports` columns on `File` are typed as `Json` in the Prisma schema — read them back as `string[]` by casting: `file.imports as string[]`.
- Run migrations from `backend/` directory: `npx prisma migrate dev`. Running from root will fail (no schema found).
