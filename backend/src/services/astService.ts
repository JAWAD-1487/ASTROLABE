import path from 'path';
import fs from 'fs';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

export interface ParseResult {
  imports: string[];   // resolved absolute paths within the repo (or empty if unresolvable)
  exports: string[];   // exported identifier names
}

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const INDEX_FILES = EXTENSIONS.map((e) => `index${e}`);

/**
 * Tries to resolve a relative import specifier to an absolute file path that
 * actually exists on disk within the repo root. Returns null if it cannot be
 * resolved (e.g. npm package, or file not found).
 */
function resolveImport(specifier: string, currentFile: string, repoRoot: string): string | null {
  // Skip non-relative specifiers (npm packages, Node built-ins, etc.)
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;

  const base = path.resolve(path.dirname(currentFile), specifier);

  // Keep only paths inside the repo
  if (!base.startsWith(repoRoot)) return null;

  // 1. Exact match
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;

  // 2. Try appending each extension
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate)) return candidate;
  }

  // 3. Try as a directory → index file
  for (const idx of INDEX_FILES) {
    const candidate = path.join(base, idx);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Parses a single JS/TS file and extracts its imports and exports.
 *
 * @param filePath  Absolute path to the file on disk.
 * @param content   Source text of the file.
 * @param repoRoot  Absolute path to the root of the cloned repo.
 */
export function parseFile(filePath: string, content: string, repoRoot: string): ParseResult {
  const imports: string[] = [];
  const exports: string[] = [];

  let ast: ReturnType<typeof parser.parse>;
  try {
    ast = parser.parse(content, {
      sourceType: 'module',
      strictMode: false,
      plugins: ['typescript', 'jsx', 'decorators-legacy'],
    });
  } catch {
    // Unparseable file — return empty result rather than crashing the whole run
    return { imports: [], exports: [] };
  }

  traverse(ast, {
    // ── import declarations ──────────────────────────────────────────────────
    ImportDeclaration({ node }) {
      const resolved = resolveImport(node.source.value, filePath, repoRoot);
      if (resolved) imports.push(resolved);
    },

    // ── export named/default ────────────────────────────────────────────────
    ExportNamedDeclaration({ node }) {
      // export { foo, bar }
      for (const spec of node.specifiers) {
        if (t.isExportSpecifier(spec) && t.isIdentifier(spec.exported)) {
          exports.push(spec.exported.name);
        }
      }
      // export const foo = …  /  export function foo  /  export class Foo
      if (node.declaration) {
        if (
          t.isVariableDeclaration(node.declaration)
        ) {
          for (const decl of node.declaration.declarations) {
            if (t.isIdentifier(decl.id)) exports.push(decl.id.name);
          }
        } else if (
          t.isFunctionDeclaration(node.declaration) ||
          t.isClassDeclaration(node.declaration)
        ) {
          if (node.declaration.id) exports.push(node.declaration.id.name);
        }
      }
    },

    ExportDefaultDeclaration({ node }) {
      if (
        (t.isFunctionDeclaration(node.declaration) ||
          t.isClassDeclaration(node.declaration)) &&
        node.declaration.id
      ) {
        exports.push(node.declaration.id.name);
      } else {
        exports.push('default');
      }
    },

    // ── require() calls ──────────────────────────────────────────────────────
    CallExpression({ node }) {
      if (
        t.isIdentifier(node.callee, { name: 'require' }) &&
        node.arguments.length === 1 &&
        t.isStringLiteral(node.arguments[0])
      ) {
        const resolved = resolveImport(node.arguments[0].value, filePath, repoRoot);
        if (resolved) imports.push(resolved);
      }
    },
  });

  return {
    imports: [...new Set(imports)],
    exports: [...new Set(exports)],
  };
}
