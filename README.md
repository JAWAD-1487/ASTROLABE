# Astrolabe

**Interactive codebase visualiser &amp; AI blast-radius engine.**

Submit a public GitHub repo URL. Astrolabe clones it, parses every JS/TS file via AST (zero LLM tokens for parsing), and renders an interactive dependency graph. Click any file, select a line, describe a proposed change — Gemini returns a structured impact analysis with severity, affected call-sites, a risk index, and a suggested safe-fix diff.

---

## Architecture

```
Astrolabe/
├── backend/   Node.js · Express · TypeScript · Prisma · PostgreSQL
└── frontend/  Next.js App Router · TypeScript · Tailwind · React Flow · Framer Motion
```

| Service   | Port |
|-----------|------|
| Frontend  | 3000 |
| Backend   | 3001 |
| Postgres  | 5432 (Docker) |

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18 + |
| npm | 9 + |
| Docker & Docker Compose | any recent |

---

## Quick Start

### 1 — Clone and install

```bash
git clone https://github.com/your-org/astrolabe.git
cd Astrolabe
npm install          # installs all workspace dependencies
```

### 2 — Start PostgreSQL

```bash
docker-compose up -d
```

The default Postgres credentials (`astrolabe / astrolabe / astrolabe`) are configured in [`docker-compose.yml`](docker-compose.yml).

### 3 — Configure the backend

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and fill in the required values (see table below).

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string — default matches docker-compose |
| `PORT` | Backend port (default `3001`) |
| `FRONTEND_ORIGIN` | Next.js dev origin — `http://localhost:3000` for local dev |
| `GEMINI_KEY_FLASH` | API key for `gemini-2.5-flash` (primary model) |
| `GEMINI_KEY_FLASH_LITE` | API key for `gemini-2.0-flash-lite` (first fallback) |
| `GEMINI_KEY_FLASH_8B` | API key for `gemini-1.5-flash-8b` (second fallback) |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `SESSION_SECRET` | Random string used to sign sessions |

Get free Gemini API keys at <https://aistudio.google.com/app/apikey>.

### 4 — Run Prisma migrations

```bash
cd backend
npx prisma migrate dev
```

### 5 — Configure the frontend (optional)

```bash
cd frontend
cp .env.example .env.local
```

The frontend proxies all `/api/*` requests to the backend via `next.config.ts` rewrites, so `NEXT_PUBLIC_API_URL` is not required for local development.

### 6 — Start both servers

Open two terminals:

```bash
# Terminal 1 — backend
cd backend
npm run dev
```

```bash
# Terminal 2 — frontend
cd frontend
npm run dev
```

Open <http://localhost:3000> in your browser.

---

## GitHub OAuth App Setup

The "Create Branch / PR" feature requires a GitHub OAuth App. The app still works without it — users get a `.patch` file download instead.

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**  
   (or visit <https://github.com/settings/applications/new>)

2. Fill in:

   | Field | Value |
   |-------|-------|
   | Application name | Astrolabe (local) |
   | Homepage URL | `http://localhost:3000` |
   | Authorization callback URL | `http://localhost:3001/api/auth/github/callback` |

3. Click **Register application**.

4. Copy the **Client ID** and generate a **Client Secret**, then add them to `backend/.env`:

   ```
   GITHUB_CLIENT_ID=your_client_id
   GITHUB_CLIENT_SECRET=your_client_secret
   ```

---

## Full End-to-End Flow

1. **Enter a public GitHub repo URL** on the landing page and click *Analyse Repository*.
2. The backend clones the repo, parses all JS/TS files, builds a dependency graph, and returns it.
3. **Explore the graph** — click any node to reveal import/export edges, or double-click to open the File Inspector.
4. **Select a line** in the inspector, type a proposed change, and click *Analyse Blast Radius*.
5. Gemini returns a severity score, affected file list, risk index, and a suggested safe-fix diff.
6. **Generate a patch** — unauthenticated users download a `.patch` file; GitHub-authenticated users can create a branch and open a PR directly.

---

## Project Structure

```
backend/
├── src/
│   ├── index.ts                  # Express app entry point
│   ├── middleware/
│   │   ├── errorHandler.ts       # Global error formatter
│   │   └── requireAuth.ts        # GitHub OAuth guard
│   ├── routes/
│   │   ├── repoRoutes.ts         # POST /api/repo/analyze, GET /api/repo/:id/status
│   │   ├── impactRoutes.ts       # POST /api/impact/evaluate
│   │   ├── authRoutes.ts         # GitHub OAuth flow
│   │   └── patchRoutes.ts        # POST /api/patch/create-branch
│   └── services/
│       ├── gitService.ts         # Shallow clone / cleanup
│       ├── astService.ts         # Babel AST parser
│       ├── ingestionService.ts   # Clone → parse → DB pipeline
│       ├── slicerService.ts      # Enclosing block + call-site extraction
│       ├── riskService.ts        # Static risk index calculation
│       ├── geminiService.ts      # Gemini fallback chain
│       └── githubPatchService.ts # Octokit branch/PR creation

frontend/
├── app/
│   ├── page.tsx                  # Landing / URL input page
│   └── graph/page.tsx            # React Flow graph canvas
├── components/
│   ├── graph/                    # AstroNode, NodeContextMenu
│   ├── inspector/                # FileInspectorPanel
│   └── blast/                    # BlastRadiusCard, SeverityMeter, RiskIndexBadge, …
├── context/
│   └── BlastWaveContext.tsx      # Shared blast-wave BFS state
├── hooks/
│   └── useGitHubAuth.ts          # GitHub auth state hook
└── types/
    └── graph.ts                  # Shared TypeScript types
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/repo/analyze` | Clone repo, parse AST, return graph |
| `GET`  | `/api/repo/:id/status` | Poll ingestion status |
| `GET`  | `/api/repo/:id/file?path=` | Fetch file source content |
| `POST` | `/api/impact/evaluate` | Gemini blast-radius analysis |
| `GET`  | `/api/auth/github` | Initiate GitHub OAuth flow |
| `GET`  | `/api/auth/github/callback` | OAuth callback |
| `GET`  | `/api/auth/me` | Current user or `401` |
| `GET`  | `/api/auth/logout` | Sign out |
| `POST` | `/api/patch/create-branch` | Create branch + PR (auth required) |
| `GET`  | `/health` | Backend health check |

---

## Environment Variables Reference

### `backend/.env`

See [`backend/.env.example`](backend/.env.example) for the full list.

### `frontend/.env.local`

See [`frontend/.env.example`](frontend/.env.example).

