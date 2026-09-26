import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/requireAuth';
import { createBranchAndPR } from '../services/githubPatchService';

const prisma = new PrismaClient();
const router = Router();

/**
 * POST /api/patch/create-branch
 * Body: { repoId: string, suggestedSafeFix: string }
 *
 * Requires GitHub OAuth. Creates a new branch with the patched files and opens
 * a PR, then returns { prUrl }.
 */
router.post('/create-branch', requireAuth, async (req: Request, res: Response) => {
  const { repoId, suggestedSafeFix } = req.body as {
    repoId?: string;
    suggestedSafeFix?: string;
  };

  if (!repoId || typeof repoId !== 'string') {
    res.status(400).json({ error: 'INVALID_INPUT', message: '`repoId` is required.' });
    return;
  }

  if (!suggestedSafeFix || typeof suggestedSafeFix !== 'string') {
    res.status(400).json({ error: 'INVALID_INPUT', message: '`suggestedSafeFix` is required.' });
    return;
  }

  // Look up the repo to get the original GitHub URL (owner/repo)
  const repository = await prisma.repository.findUnique({ where: { id: repoId } });
  if (!repository) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Repository not found.' });
    return;
  }

  // Extract owner/repo from the stored URL (e.g. https://github.com/owner/repo)
  const match = repository.repoUrl.match(/github\.com\/([^/]+\/[^/.]+?)(?:\.git)?$/);
  if (!match) {
    res.status(400).json({ error: 'INVALID_REPO', message: 'Could not parse owner/repo from URL.' });
    return;
  }
  const repoFullName = match[1];

  const accessToken = req.session.accessToken!; // guaranteed by requireAuth

  try {
    const result = await createBranchAndPR(accessToken, repoFullName, suggestedSafeFix);
    res.json({ prUrl: result.prUrl, branchName: result.branchName });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    console.error('[/api/patch/create-branch]', e);

    if (e.status === 403 || e.status === 404) {
      res.status(403).json({
        error: 'GITHUB_PERMISSION',
        message: 'Insufficient permissions to create a branch on this repository.',
      });
      return;
    }

    res.status(502).json({
      error: 'GITHUB_API_ERROR',
      message: e.message ?? 'Failed to create branch and PR on GitHub.',
    });
  }
});

export default router;
