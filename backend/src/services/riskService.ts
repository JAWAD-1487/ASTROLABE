import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface RiskResult {
  riskIndex: number;
  isBottleneck: boolean;
  bottleneckReason: string | null;
  hasTestCoverage: boolean;
  incomingImportCount: number;
}

/**
 * Pure-static risk calculation — no LLM involved.
 *
 * Formula: min(100, incomingImportCount * 5 + (hasTestCoverage ? 0 : 20))
 * Bottleneck: incomingImportCount >= 15 AND hasTestCoverage === false
 *
 * @param filePath  Repo-relative path as stored in the DB (e.g. "src/utils/helpers.ts")
 * @param repoId    Repository UUID
 */
export async function calculateRiskIndex(
  filePath: string,
  repoId: string,
): Promise<RiskResult> {
  // Count files that list filePath in their imports JSON array
  const allFiles = await prisma.file.findMany({
    where: { repoId },
    select: { path: true, imports: true },
  });

  // Normalise path separators for cross-platform safety
  const normalised = filePath.replace(/\\/g, '/');

  let incomingImportCount = 0;
  for (const f of allFiles) {
    const imports = f.imports as string[];
    if (imports.some((imp) => imp.replace(/\\/g, '/') === normalised)) {
      incomingImportCount++;
    }
  }

  // Test coverage detection: look for a file whose base name (without extension)
  // matches the target file's base name AND whose path indicates it is a test file.
  const targetBase = path.basename(filePath, path.extname(filePath));
  const testPatterns = [
    // *.test.ts / *.test.tsx / *.test.js / *.test.jsx
    // *.spec.ts / *.spec.tsx / *.spec.js / *.spec.jsx
    new RegExp(`(^|/)${escapeRegex(targetBase)}\\.(test|spec)\\.(ts|tsx|js|jsx)$`),
    // __tests__/<targetBase>.*
    new RegExp(`__tests__/${escapeRegex(targetBase)}`),
  ];

  const hasTestCoverage = allFiles.some((f) => {
    const p = f.path.replace(/\\/g, '/');
    return testPatterns.some((re) => re.test(p));
  });

  const riskIndex = Math.min(100, incomingImportCount * 5 + (hasTestCoverage ? 0 : 20));
  const isBottleneck = incomingImportCount >= 15 && !hasTestCoverage;
  const bottleneckReason = isBottleneck
    ? `Imported by ${incomingImportCount} files with no test coverage — changes here break silently.`
    : null;

  return { riskIndex, isBottleneck, bottleneckReason, hasTestCoverage, incomingImportCount };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
