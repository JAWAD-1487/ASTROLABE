'use client';

import React from 'react';

interface Props {
  riskIndex: number;
  incomingImportCount: number;
  hasTestCoverage: boolean;
  isBottleneck: boolean;
  bottleneckReason: string | null;
}

export default function RiskIndexBadge({
  riskIndex,
  incomingImportCount,
  hasTestCoverage,
  isBottleneck,
  bottleneckReason,
}: Props) {
  const color =
    riskIndex >= 75 ? '#ef4444' :
    riskIndex >= 50 ? '#f97316' :
    riskIndex >= 25 ? '#f59e0b' :
    '#4ade80';

  return (
    <div className="space-y-2">
      {/* Bottleneck banner */}
      {isBottleneck && (
        <div className="flex items-center gap-2 bg-red-950/60 border border-red-700 rounded-lg px-3 py-2 text-xs text-red-300">
          <span className="text-base">⚠️</span>
          <div>
            <span className="font-semibold text-red-200">High-Risk Bottleneck</span>
            {bottleneckReason && (
              <p className="text-red-400 mt-0.5">{bottleneckReason}</p>
            )}
          </div>
        </div>
      )}

      {/* Score row */}
      <div className="flex items-center gap-3 bg-slate-800 rounded-lg px-3 py-2">
        {/* Risk index circle */}
        <div
          className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{ borderColor: color, color }}
        >
          {riskIndex}
        </div>

        {/* Details */}
        <div className="text-xs space-y-0.5 min-w-0">
          <p className="text-slate-300 font-medium">Risk Index</p>
          <p className="text-slate-400">
            <span className="text-white">{incomingImportCount}</span> incoming imports
          </p>
          <p className="text-slate-400">
            Test coverage:{' '}
            {hasTestCoverage ? (
              <span className="text-green-400 font-medium">✓ covered</span>
            ) : (
              <span className="text-red-400 font-medium">✗ none</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
