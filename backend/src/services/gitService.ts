import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Returns the temp directory path for a given repoId.
 */
export function getClonePath(repoId: string): string {
  return path.join(os.tmpdir(), 'astrolabe', repoId);
}

/**
 * Shallow-clones a public GitHub repo into a temp directory using the system
 * git binary directly (no simple-git env restrictions).
 *
 * GIT_TERMINAL_PROMPT=0 and GIT_ASKPASS=true prevent any interactive prompt
 * so the process fails fast on private/non-existent repos.
 */
export async function cloneRepo(repoUrl: string, repoId: string): Promise<string> {
  const clonePath = getClonePath(repoId);
  await fs.mkdir(clonePath, { recursive: true });

  await execFileAsync('git', ['clone', '--depth', '1', repoUrl, clonePath], {
    env: {
      HOME: process.env.HOME ?? '',
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: 'true',
    },
    timeout: 60_000,
  });

  return clonePath;
}

/**
 * Removes the temp clone directory. Silently ignores if it doesn't exist.
 */
export async function removeClone(repoId: string): Promise<void> {
  const clonePath = getClonePath(repoId);
  await fs.rm(clonePath, { recursive: true, force: true });
}
