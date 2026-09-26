import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

// ── findEnclosingBlock ────────────────────────────────────────────────────────

export interface EnclosingBlock {
  source: string;      // raw source text of the enclosing node
  startLine: number;
  endLine: number;
  name: string | null; // function/method name if available
}

/**
 * Finds the smallest function/arrow/method/class node that contains the given
 * 1-based line number. Returns null if the line is at module-top-level.
 */
export function findEnclosingBlock(
  fileContent: string,
  lineNumber: number,
): EnclosingBlock | null {
  let ast: ReturnType<typeof parser.parse>;
  try {
    ast = parser.parse(fileContent, {
      sourceType: 'module',
      strictMode: false,
      plugins: ['typescript', 'jsx', 'decorators-legacy'],
    });
  } catch {
    return null;
  }

  const lines = fileContent.split('\n');
  let best: EnclosingBlock | null = null;
  let bestSize = Infinity;

  const checkNode = (node: t.Node, name: string | null) => {
    const loc = node.loc;
    if (!loc) return;
    const start = loc.start.line;
    const end = loc.end.line;
    if (start <= lineNumber && lineNumber <= end) {
      const size = end - start;
      if (size < bestSize) {
        bestSize = size;
        best = {
          source: lines.slice(start - 1, end).join('\n'),
          startLine: start,
          endLine: end,
          name,
        };
      }
    }
  };

  traverse(ast, {
    FunctionDeclaration(path) {
      checkNode(path.node, path.node.id?.name ?? null);
    },
    FunctionExpression(path) {
      const parent = path.parent;
      let name: string | null = null;
      if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
        name = parent.id.name;
      } else if (t.isObjectProperty(parent) && t.isIdentifier(parent.key)) {
        name = parent.key.name;
      }
      checkNode(path.node, name);
    },
    ArrowFunctionExpression(path) {
      const parent = path.parent;
      let name: string | null = null;
      if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
        name = parent.id.name;
      }
      checkNode(path.node, name);
    },
    ClassDeclaration(path) {
      checkNode(path.node, path.node.id?.name ?? null);
    },
    ClassMethod(path) {
      const key = path.node.key;
      checkNode(path.node, t.isIdentifier(key) ? key.name : null);
    },
    ObjectMethod(path) {
      const key = path.node.key;
      checkNode(path.node, t.isIdentifier(key) ? key.name : null);
    },
  });

  return best;
}

// ── extractCallSites ──────────────────────────────────────────────────────────

export interface CallSite {
  symbol: string;
  lineNumber: number;
  snippet: string;   // ±3 lines of context around the reference
}

/**
 * Scans `dependentContent` for any references to the given `targetSymbols`
 * and returns a snippet of ±3 lines around each match.
 */
export function extractCallSites(
  dependentContent: string,
  targetSymbols: string[],
): CallSite[] {
  if (targetSymbols.length === 0) return [];

  const lines = dependentContent.split('\n');
  const results: CallSite[] = [];
  const seen = new Set<string>(); // dedupe by symbol+line

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const sym of targetSymbols) {
      // Match whole-word references to the symbol
      const re = new RegExp(`\\b${sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (re.test(line)) {
        const key = `${sym}:${i}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const from = Math.max(0, i - 3);
        const to = Math.min(lines.length - 1, i + 3);
        results.push({
          symbol: sym,
          lineNumber: i + 1,
          snippet: lines.slice(from, to + 1).join('\n'),
        });
      }
    }
  }

  return results;
}
