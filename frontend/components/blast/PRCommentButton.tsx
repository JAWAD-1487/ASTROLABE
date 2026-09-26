'use client';

import React, { useState } from 'react';
import { ImpactResponse } from '@/types/graph';

interface Props {
  result: ImpactResponse;
}

function buildPRComment(r: ImpactResponse): string {
  const firstBreaking = r.affectedFiles.find((f) => f.isBreakingChange);
  const breakingSummary = firstBreaking
    ? `${firstBreaking.filePath.split('/').pop()}: ${firstBreaking.breakageReason}`
    : 'None detected';

  return [
    '### ⚠️ BlastRadius Analysis',
    `- **Severity:** ${r.severity} (Score: ${r.severityScore}/100)`,
    `- **Risk Index:** ${r.riskIndex}/100${r.isBottleneck ? ' — ⚠️ High-Risk Bottleneck' : ''}`,
    `- **Blast Radius:** ${r.affectedFiles.length} dependent files impacted`,
    `- **Breaking Change:** ${breakingSummary}`,
  ].join('\n');
}

export default function PRCommentButton({ result }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = buildPRComment(result);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="w-full text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg px-3 py-1.5 transition-colors flex items-center justify-center gap-1.5"
    >
      {copied ? (
        <>
          <span className="text-green-400">✓</span> Copied!
        </>
      ) : (
        <>📋 Copy PR Comment</>
      )}
    </button>
  );
}

export { buildPRComment };
