import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { findEnclosingBlock, extractCallSites } from '../services/slicerService';
import { calculateRiskIndex } from '../services/riskService';
import {
  callGeminiWithFallback,
  RateLimitExhaustedError,
  GeminiError,
} from '../services/geminiService';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/impact/evaluate
 * Body: { repoId, filePath, lineNumber, proposedChange }
 */
router.post('/evaluate', async (req: Request, res: Response) => {
  const { repoId, filePath, lineNumber, proposedChange } = req.body as {
    repoId?: string;
    filePath?: string;
    lineNumber?: number;
    proposedChange?: string;
  };

  // ── Input validation ──────────────────────────────────────────────────────
  if (!repoId || !filePath || lineNumber == null || !proposedChange) {
    res.status(400).json({
      error: 'INVALID_INPUT',
      message: '`repoId`, `filePath`, `lineNumber`, and `proposedChange` are all required.',
    });
    return;
  }

  // ── Fetch repo ────────────────────────────────────────────────────────────
  const repo = await prisma.repository.findUnique({ where: { id: repoId } });
  if (!repo) {
    res.status(404).json({ error: 'REPO_NOT_FOUND', message: `Repository ${repoId} not found.` });
    return;
  }

  // ── Fetch target file ─────────────────────────────────────────────────────
  const targetFile = await prisma.file.findFirst({
    where: { repoId, path: filePath },
  });
  if (!targetFile) {
    res.status(404).json({
      error: 'FILE_NOT_FOUND',
      message: `File "${filePath}" not found in repository ${repoId}.`,
    });
    return;
  }

  // ── Line range check ──────────────────────────────────────────────────────
  if (lineNumber < 1 || lineNumber > targetFile.lineCount) {
    res.status(400).json({
      error: 'LINE_OUT_OF_RANGE',
      message: `Line ${lineNumber} is out of range (file has ${targetFile.lineCount} lines).`,
    });
    return;
  }

  // ── Enclosing block ───────────────────────────────────────────────────────
  const enclosingBlock = findEnclosingBlock(targetFile.content, lineNumber);
  const blockSource = enclosingBlock?.source ?? `// (line ${lineNumber})\n${targetFile.content.split('\n')[lineNumber - 1]}`;

  // ── Find dependents (files that import this file), top 5 ─────────────────
  const allFiles = await prisma.file.findMany({
    where: { repoId },
    select: { id: true, path: true, content: true, imports: true },
  });

  const dependents = allFiles
    .filter((f) => {
      const imports = f.imports as string[];
      return imports.some((imp) => imp.replace(/\\/g, '/') === filePath.replace(/\\/g, '/'));
    })
    .slice(0, 5);

  // ── Extract call-site snippets from dependents ────────────────────────────
  const targetExports = targetFile.exports as string[];
  const callSiteBlocks = dependents.map((dep) => {
    const sites = extractCallSites(dep.content, targetExports);
    const snippet = sites.length > 0
      ? sites.map((s) => `  [line ${s.lineNumber}] ${s.symbol}:\n${s.snippet}`).join('\n\n')
      : `  (imports the file but no direct symbol call-sites found)`;
    return `### ${dep.path}\n${snippet}`;
  });

  // ── Risk index (pure static) ──────────────────────────────────────────────
  const risk = await calculateRiskIndex(filePath, repoId);

  // ── Build Gemini prompt ───────────────────────────────────────────────────
  const prompt = buildPrompt({
    filePath,
    lineNumber,
    proposedChange,
    blockSource,
    callSiteBlocks,
    risk,
  });

  // ── Call Gemini ───────────────────────────────────────────────────────────
  try {
    const geminiResult = await callGeminiWithFallback(prompt);

    res.json({
      ...geminiResult,
      repoId,
      filePath,
      lineNumber,
      proposedChange,
      riskIndex: risk.riskIndex,
      isBottleneck: risk.isBottleneck,
      bottleneckReason: risk.bottleneckReason,
      incomingImportCount: risk.incomingImportCount,
      hasTestCoverage: risk.hasTestCoverage,
    });
  } catch (err: unknown) {
    if (err instanceof RateLimitExhaustedError) {
      res.status(503).json({ error: 'RATE_LIMIT_EXHAUSTED', message: err.message });
      return;
    }
    if (err instanceof GeminiError) {
      res.status(502).json({ error: 'GEMINI_ERROR', message: err.message });
      return;
    }
    console.error('[/api/impact/evaluate]', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Impact analysis failed.' });
  }
});

export default router;

// ── Prompt builder ────────────────────────────────────────────────────────────

interface PromptArgs {
  filePath: string;
  lineNumber: number;
  proposedChange: string;
  blockSource: string;
  callSiteBlocks: string[];
  risk: {
    riskIndex: number;
    isBottleneck: boolean;
    incomingImportCount: number;
    hasTestCoverage: boolean;
  };
}

function buildPrompt(args: PromptArgs): string {
  const { filePath, lineNumber, proposedChange, blockSource, callSiteBlocks, risk } = args;

  const dependentsSection = callSiteBlocks.length > 0
    ? callSiteBlocks.join('\n\n')
    : '(No dependents found — this file is not imported by any other file in the repo.)';

  return `You are an expert code impact analyst. Analyse the blast radius of a proposed change to a codebase.

## Target File
Path: ${filePath}
Line: ${lineNumber}
Risk Index: ${risk.riskIndex}/100 (imported by ${risk.incomingImportCount} files, ${risk.hasTestCoverage ? 'has' : 'NO'} test coverage${risk.isBottleneck ? ', HIGH-RISK BOTTLENECK' : ''})

## Enclosing Code Block
\`\`\`
${blockSource}
\`\`\`

## Proposed Change
${proposedChange}

## Top Dependent Files (call-site snippets)
${dependentsSection}

## Your Task
Return a JSON object with:
- severity: CRITICAL / HIGH / MEDIUM / LOW (overall impact)
- severityScore: 1–100 numeric score
- summary: plain-English paragraph explaining what breaks and why
- affectedFiles: array of objects per dependent — filePath, callSite (the relevant code snippet), breakageReason, isBreakingChange (boolean)
- suggestedSafeFix: a unified diff or detailed code block showing a safe migration

Be precise, concise, and technical. Do not speculate beyond the provided context.`;
}
