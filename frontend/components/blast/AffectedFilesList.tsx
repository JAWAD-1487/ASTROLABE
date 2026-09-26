'use client';

import React, { useState } from 'react';
import { AffectedFile } from '@/types/graph';

interface Props {
  files: AffectedFile[];
}

export default function AffectedFilesList({ files }: Props) {
  const [open, setOpen] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="space-y-1">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-xs font-semibold text-slate-300 uppercase tracking-wide py-1"
      >
        <span>Affected Files ({files.length})</span>
        <span className="text-slate-500">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-1">
          {files.length === 0 && (
            <p className="text-slate-500 text-xs py-2 text-center">No affected files detected.</p>
          )}
          {files.map((f, i) => (
            <div
              key={i}
              className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden"
            >
              {/* Row header */}
              <button
                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-750"
              >
                {/* Breaking change badge */}
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                    f.isBreakingChange
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-600 text-slate-300'
                  }`}
                >
                  {f.isBreakingChange ? 'BREAK' : 'WARN'}
                </span>
                <span className="text-xs text-slate-300 truncate min-w-0 flex-1 font-mono">
                  {f.filePath.split('/').pop()}
                </span>
                <span className="text-slate-600 text-xs flex-shrink-0">{expandedIdx === i ? '▲' : '▼'}</span>
              </button>

              {/* Expanded details */}
              {expandedIdx === i && (
                <div className="border-t border-slate-700 px-3 py-2 space-y-2">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Full Path</p>
                    <p className="text-xs text-slate-400 font-mono break-all">{f.filePath}</p>
                  </div>
                  {f.callSite && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Call Site</p>
                      <pre className="text-[11px] text-slate-300 bg-slate-900 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                        {f.callSite}
                      </pre>
                    </div>
                  )}
                  {f.breakageReason && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Breakage Reason</p>
                      <p className="text-xs text-slate-300">{f.breakageReason}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
