import path from 'path';
import fs from 'fs/promises';
import { glob } from 'glob';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import { cloneRepo, removeClone } from './gitService';
import { parseFile } from './astService';

const prisma = new PrismaClient();

const FILE_CAP = 500;
const EXCLUDED_DIRS = ['node_modules', 'dist', '.git', 'build', '.next', 'coverage', 'out'];
const INCLUDED_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];

// ── types ─────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  path: string;       // repo-relative path (e.g. "src/utils/helpers.ts")
  lineCount: number;
  fileType: string;   // extension without dot (e.g. "ts")
}

export interface GraphEdge {
  from: string;   // File.id
  to: string;     // File.id
  type: 'import';
}

export interface IngestionResult {
  repoId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Discover all JS/TS source files under clonePath, honouring exclusions. */
async function discoverFiles(clonePath: string): Promise<string[]> {
  const excludePatterns = EXCLUDED_DIRS.map((d) => `**/${d}/**`);

  const files = await glob('**/*.{js,jsx,ts,tsx}', {
    cwd: clonePath,
    absolute: true,
    ignore: excludePatterns,
    nodir: true,
  });

  return files;
}

// ── main export ───────────────────────────────────────────────────────────────

/**
 * Full ingestion pipeline:
 *   clone → discover → parse → db write → cleanup → return graph
 *
 * Throws on validation errors (file cap) or fatal failures.
 * Always cleans up the temp clone directory.
 */
export async function ingestRepo(
  repoUrl: string,
  sessionId: string,
): Promise<IngestionResult> {
  const repoId = uuidv4();

  // 1. Delete any previous repo for this session (replace strategy)
  await prisma.repository.deleteMany({ where: { sessionId } });

  // 2. Create the Repository record in PROCESSING state
  await prisma.repository.create({
    data: {
      id: repoId,
      sessionId,
      repoUrl,
      status: 'PROCESSING',
    },
  });

  let clonePath: string | null = null;

  try {
    // 3. Clone
    clonePath = await cloneRepo(repoUrl, repoId);

    // 4. Discover files
    const filePaths = await discoverFiles(clonePath);

    // 5. File-cap check
    if (filePaths.length > FILE_CAP) {
      await removeClone(repoId);
      await prisma.repository.update({
        where: { id: repoId },
        data: { status: 'FAILED', errorMessage: `Repository exceeds the ${FILE_CAP}-file limit (found ${filePaths.length} JS/TS files).` },
      });
      const err = new Error(`Repository exceeds the ${FILE_CAP}-file limit (found ${filePaths.length} JS/TS files).`);
      (err as NodeJS.ErrnoException).code = 'FILE_CAP_EXCEEDED';
      throw err;
    }

    // 6. Parse each file and collect results
    type FileDraft = {
      id: string;
      repoId: string;
      path: string;         // absolute path (used during edge building)
      relativePath: string; // stored in DB
      lineCount: number;
      content: string;
      imports: string[];    // absolute paths
      exports: string[];
    };

    const drafts: FileDraft[] = [];

    for (const absPath of filePaths) {
      const content = await fs.readFile(absPath, 'utf-8');
      const lineCount = content.split('\n').length;
      const { imports, exports } = parseFile(absPath, content, clonePath);
      const relativePath = path.relative(clonePath, absPath);

      drafts.push({
        id: uuidv4(),
        repoId,
        path: absPath,
        relativePath,
        lineCount,
        content,
        imports,
        exports,
      });
    }

    // 7. Build absolute-path → id lookup for edge resolution
    const pathToId = new Map<string, string>(drafts.map((d) => [d.path, d.id]));

    // 8. Write all files to DB in a single transaction
    await prisma.$transaction(
      drafts.map((d) =>
        prisma.file.create({
          data: {
            id: d.id,
            repoId: d.repoId,
            path: d.relativePath,
            lineCount: d.lineCount,
            content: d.content,
            imports: d.imports.map((absImp) => path.relative(clonePath!, absImp)),
            exports: d.exports,
          },
        }),
      ),
    );

    // 9. Mark READY
    await prisma.repository.update({
      where: { id: repoId },
      data: { status: 'READY' },
    });

    // 10. Build graph response
    const nodes: GraphNode[] = drafts.map((d) => ({
      id: d.id,
      path: d.relativePath,
      lineCount: d.lineCount,
      fileType: path.extname(d.relativePath).replace('.', ''),
    }));

    const edges: GraphEdge[] = [];
    for (const d of drafts) {
      for (const absImp of d.imports) {
        const toId = pathToId.get(absImp);
        if (toId) {
          edges.push({ from: d.id, to: toId, type: 'import' });
        }
      }
    }

    return { repoId, nodes, edges };

  } finally {
    // Always clean up clone
    if (clonePath) await removeClone(repoId);
  }
}
