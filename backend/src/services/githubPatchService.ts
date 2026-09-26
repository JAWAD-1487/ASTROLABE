import { Octokit } from '@octokit/rest';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FileChange {
  path: string;
  content: string; // full new content of the file
}

export interface CreateBranchResult {
  prUrl: string;
  branchName: string;
}

// ── Unified-diff parser ───────────────────────────────────────────────────────
// Parses a unified diff string into a map of { filePath → newContent }.
// If the diff is not parseable we return the raw text as a single fallback file.

function parseDiff(diff: string): FileChange[] {
  const changes: FileChange[] = [];

  // Split on "diff --git" or "+++ b/" file markers
  // Strategy: collect all lines per file section, then reconstruct new content
  // by applying hunks.  This is a best-effort parser — complex renames / binary
  // diffs gracefully fall through to the raw-content fallback.

  const fileHeaderRe = /^\+\+\+ b\/(.+)$/;
  const hunkHeaderRe = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/;

  const sections = diff.split(/^diff --git /m).filter(Boolean);

  for (const section of sections) {
    const lines = section.split('\n');
    let filePath: string | null = null;
    const newLines: string[] = [];
    let inHunk = false;
    let lineNo = 0;

    for (const line of lines) {
      // Extract target file path
      if (!filePath) {
        const m = fileHeaderRe.exec(line);
        if (m) {
          filePath = m[1];
          continue;
        }
      }

      // Hunk header
      const hunkMatch = hunkHeaderRe.exec(line);
      if (hunkMatch) {
        inHunk = true;
        lineNo = parseInt(hunkMatch[1], 10) - 1; // will be incremented for first + line
        continue;
      }

      if (!inHunk) continue;

      if (line.startsWith('+') && !line.startsWith('+++')) {
        newLines.push(line.slice(1));
        lineNo++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        // removed line — skip
      } else if (line.startsWith(' ')) {
        newLines.push(line.slice(1));
        lineNo++;
      }
    }

    if (filePath && newLines.length > 0) {
      changes.push({ path: filePath, content: newLines.join('\n') });
    }
  }

  return changes;
}

// ── Main service function ─────────────────────────────────────────────────────

export async function createBranchAndPR(
  accessToken: string,
  repoFullName: string, // e.g. "owner/repo"
  suggestedSafeFix: string
): Promise<CreateBranchResult> {
  const octokit = new Octokit({ auth: accessToken });

  const [owner, repo] = repoFullName.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid repoFullName: ${repoFullName}`);
  }

  // 1. Get the default branch SHA
  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;

  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  const baseSha = refData.object.sha;

  // 2. Create a new branch
  const branchName = `astrolabe/fix-${Date.now()}`;
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });

  // 3. Parse the diff and determine files to commit
  let fileChanges = parseDiff(suggestedSafeFix);

  // Fallback: if the diff was not parseable, create a single markdown file
  // with the raw content so the PR is still meaningful.
  if (fileChanges.length === 0) {
    fileChanges = [
      {
        path: 'astrolabe-fix.md',
        content: `# Astrolabe Suggested Fix\n\n\`\`\`\n${suggestedSafeFix}\n\`\`\`\n`,
      },
    ];
  }

  // 4. Get the current tree SHA for the branch tip
  const { data: commitData } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: baseSha,
  });
  const baseTreeSha = commitData.tree.sha;

  // 5. Create blobs for each changed file and build tree entries
  const treeEntries = await Promise.all(
    fileChanges.map(async (fc) => {
      const { data: blobData } = await octokit.git.createBlob({
        owner,
        repo,
        content: fc.content,
        encoding: 'utf-8',
      });
      return {
        path: fc.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blobData.sha,
      };
    })
  );

  // 6. Create a new tree
  const { data: newTree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeEntries,
  });

  // 7. Create a commit
  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message: 'fix: apply Astrolabe suggested safe fix',
    tree: newTree.sha,
    parents: [baseSha],
  });

  // 8. Update the branch ref to the new commit
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${branchName}`,
    sha: newCommit.sha,
  });

  // 9. Open a PR
  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title: '🔭 Astrolabe: apply suggested safe fix',
    body: [
      '## Astrolabe Suggested Fix',
      '',
      'This PR was automatically generated by [Astrolabe](https://github.com) based on a blast-radius analysis.',
      '',
      '**Review carefully before merging.**',
    ].join('\n'),
    head: branchName,
    base: defaultBranch,
  });

  return { prUrl: pr.html_url, branchName };
}
