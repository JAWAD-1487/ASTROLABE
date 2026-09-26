import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import { v4 as uuidv4 } from 'uuid';

import repoRoutes from './routes/repoRoutes';
import impactRoutes from './routes/impactRoutes';
import authRoutes, { configurePassport } from './routes/authRoutes';
import patchRoutes from './routes/patchRoutes';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT ?? 3001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';

// ── Middleware ────────────────────────────────────────────────────────────────

app.set('trust proxy', 1);

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// express-session — must come before passport.session()
app.use(
  session({
    secret: process.env.SESSION_SECRET ?? 'astrolabe-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Configure GitHub OAuth strategy (no-op if env vars are missing)
configurePassport();

/** Attach an anonymous session cookie if not already present */
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.cookies['astrolabe_session']) {
    const sessionId = uuidv4();
    res.cookie('astrolabe_session', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/repo', repoRoutes);
app.use('/api/impact', impactRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/patch', patchRoutes);

// ── Global error handler ─────────────────────────────────────────────────────
// Must be registered AFTER all routes.
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 Astrolabe backend listening on http://localhost:${PORT}`);
});

export default app;
