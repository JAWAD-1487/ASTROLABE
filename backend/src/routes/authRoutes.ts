import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as GitHubStrategy, Profile } from 'passport-github2';

// ── Extend express-session typings ────────────────────────────────────────────
declare module 'express-session' {
  interface SessionData {
    accessToken?: string;
    user?: {
      login: string;
      avatarUrl: string;
    };
  }
}

// ── Passport configuration ────────────────────────────────────────────────────
// Called once at startup via configurePassport(); guarded so it only runs if
// the OAuth credentials are present (avoids crashing in envs without them).
export function configurePassport(): void {
  const clientID = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    console.warn(
      '[auth] GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET not set — GitHub OAuth disabled.'
    );
    return;
  }

  passport.use(
    new GitHubStrategy(
      {
        clientID,
        clientSecret,
        callbackURL: process.env.GITHUB_CALLBACK_URL ?? 'http://localhost:3001/api/auth/github/callback',
        scope: ['user:email', 'repo'],
      },
      (
        accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: (err: unknown, user?: Express.User) => void
      ) => {
        // Store what we need; passport serialize/deserialize is not needed
        // because we use a simple session store (no DB persistence for OAuth users).
        done(null, {
          login: profile.username ?? profile.displayName ?? '',
          avatarUrl: (profile.photos?.[0]?.value) ?? '',
          accessToken,
        });
      }
    )
  );

  // Minimal serialize/deserialize — we store the full user object in the session.
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj as Express.User));
}

// ── Router ────────────────────────────────────────────────────────────────────
const router = Router();

/** Kick off the GitHub OAuth flow */
router.get(
  '/github',
  passport.authenticate('github', { scope: ['user:email', 'repo'] })
);

/** OAuth callback — GitHub redirects here after the user authorises */
router.get(
  '/github/callback',
  passport.authenticate('github', { failureRedirect: '/?auth=failed', session: true }),
  (req: Request, res: Response) => {
    // Passport puts the user on req.user after authenticate succeeds.
    const u = req.user as { login: string; avatarUrl: string; accessToken: string } | undefined;
    if (u) {
      req.session.accessToken = u.accessToken;
      req.session.user = { login: u.login, avatarUrl: u.avatarUrl };
    }
    const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
    res.redirect(`${origin}/graph?auth=success`);
  }
);

/** Return the currently authenticated user or 401 */
router.get('/me', (req: Request, res: Response) => {
  if (req.session.user && req.session.accessToken) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Not signed in.' });
  }
});

/** Sign out — destroy session data for this user */
router.get('/logout', (req: Request, res: Response, next: NextFunction) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.json({ ok: true });
  });
});

export default router;
