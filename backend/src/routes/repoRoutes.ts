import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ingestRepo } from '../services/ingestionService';

const prisma = new PrismaClient();

const router = Router();

/** Validates that a string is a public GitHub HTTPS URL. */
const GITHUB_URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?$/;

function isValidGithubUrl(url: string): boolean {
  return GITHUB_URL_RE.test(url.trim());
}

/**
 * POST /api/repo/analyze
 * Body: { repoUrl: string }
 *
 * Clones the repo, builds the AST dependency graph, and returns:
 *   { repoId, nodes: [...], edges: [...] }
 */
router.post('/analyze', async (req: Request, res: Response) => {
  const { repoUrl } = req.body as { repoUrl?: string };

  if (!repoUrl || typeof repoUrl !== 'string') {
    res.status(400).json({ error: 'INVALID_INPUT', message: '`repoUrl` is required.' });
    return;
  }

  if (!isValidGithubUrl(repoUrl)) {
    res.status(400).json({
      error: 'INVALID_URL',
      message: 'Only public GitHub HTTPS URLs are accepted (e.g. https://github.com/owner/repo).',
    });
    return;
  }

  const sessionId: string = req.cookies['astrolabe_session'] ?? 'anonymous';

  try {
    const result = await ingestRepo(repoUrl.trim(), sessionId);
    res.json(result);
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & { message: string };

    if (e.code === 'FILE_CAP_EXCEEDED') {
      res.status(400).json({ error: 'FILE_CAP_EXCEEDED', message: e.message });
      return;
    }

    // Git clone failures
    const msg = e.message ?? 'Unknown error';
    const msgLower = msg.toLowerCase();
    if (
      msgLower.includes('not found') ||
      msgLower.includes('repository') ||
      msgLower.includes('authentication') ||
      msgLower.includes('could not read') ||
      msgLower.includes('fatal:')
    ) {
      res.status(400).json({ error: 'CLONE_FAILED', message: `Could not clone repository: ${msg}` });
      return;
    }

    console.error('[/api/repo/analyze]', e);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to analyse repository.' });
  }
});

/**
 * GET /api/repo/:repoId/file?path=<filePath>
 * Returns the source content of a single file from the DB.
 */
router.get('/:repoId/file', async (req: Request, res: Response) => {
  const { repoId } = req.params;
  const filePath = req.query['path'] as string | undefined;

  if (!filePath) {
    res.status(400).json({ error: 'INVALID_INPUT', message: '`path` query param is required.' });
    return;
  }

  const file = await prisma.file.findFirst({
    where: { repoId, path: filePath },
    select: { content: true },
  });

  if (!file) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'File not found in repository.' });
    return;
  }

  res.json({ content: file.content });
});

/**
 * GET /api/repo/:repoId/status
 * Returns the current ingestion status of the repository.
 * Useful for polling during long ingestion runs.
 */
router.get('/:repoId/status', async (req: Request, res: Response) => {
  const { repoId } = req.params;

  const repo = await prisma.repository.findUnique({
    where: { id: repoId },
    select: { id: true, status: true, errorMessage: true, repoUrl: true, createdAt: true },
  });

  if (!repo) {
    res.status(404).json({ error: 'NOT_FOUND', message: `Repository ${repoId} not found.` });
    return;
  }

  res.json(repo);
});

export default router;
