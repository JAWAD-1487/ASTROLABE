'use client';

import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Props {
  diff: string;
  onDownloadPatch: () => void;
  onCopyPRComment: () => void;
}

export default function SafeFixBlock({ diff, onDownloadPatch, onCopyPRComment }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Suggested Safe Fix</p>

      <div className="rounded-lg overflow-hidden border border-slate-700 text-[11px]">
        <SyntaxHighlighter
          language="diff"
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '10px 12px',
            background: '#0f172a',
            fontSize: '11px',
            maxHeight: '220px',
            overflowY: 'auto',
          }}
          wrapLongLines
        >
          {diff || '(no diff provided)'}
        </SyntaxHighlighter>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={onDownloadPatch}
          className="flex-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          ↓ Download .patch
        </button>
        <button
          onClick={onCopyPRComment}
          className="flex-1 text-xs bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg px-3 py-1.5 transition-colors"
        >
          📋 Copy PR Comment
        </button>
      </div>
    </div>
  );
}
