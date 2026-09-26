'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ImpactResponse } from '@/types/graph';
import SeverityMeter from './SeverityMeter';
import RiskIndexBadge from './RiskIndexBadge';
import AffectedFilesList from './AffectedFilesList';
import PRCommentButton from './PRCommentButton';
import PatchButton from './PatchButton';

// ── Severity badge color helpers ───────────────────────────────────────────────
const SEVERITY_CLASSES: Record<string, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH:     'bg-orange-500 text-white',
  MEDIUM:   'bg-amber-400 text-black',
  LOW:      'bg-green-600 text-white',
};

// ── Loading skeleton ───────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {/* Scanning beam */}
      <div className="relative h-1 rounded-full bg-slate-700 overflow-hidden">
        <motion.div
          className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-indigo-400 to-transparent"
          animate={{ x: ['-100%', '400%'] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <div className="h-4 bg-slate-800 rounded w-3/4" />
      <div className="h-4 bg-slate-800 rounded w-1/2" />
      <div className="h-20 bg-slate-800 rounded" />
      <div className="h-10 bg-slate-800 rounded" />
    </div>
  );
}

// ── Error state ────────────────────────────────────────────────────────────────
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <div className="bg-red-950/60 border border-red-700 rounded-lg px-3 py-3 text-xs text-red-300">
        <p className="font-semibold text-red-200 mb-1">Analysis failed</p>
        <p>{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="w-full text-xs bg-red-700 hover:bg-red-600 text-white rounded-lg px-3 py-2 transition-colors"
      >
        ↺ Retry
      </button>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────
type CardState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: ImpactResponse };

interface Props {
  state: CardState;
  onClose: () => void;
  onRetry: () => void;
  repoId: string;
  isAuthenticated: boolean;
}

// ── Main card ──────────────────────────────────────────────────────────────────
export default function BlastRadiusCard({ state, onClose, onRetry, repoId, isAuthenticated }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.97 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="fixed bottom-6 right-6 w-80 max-h-[80vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-30 flex flex-col overflow-hidden"
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">Blast Radius</span>
          {state.status === 'success' && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SEVERITY_CLASSES[state.data.severity] ?? 'bg-slate-600 text-white'}`}>
              {state.data.severity}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-white text-sm leading-none transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
        {state.status === 'loading' && <LoadingSkeleton />}

        {state.status === 'error' && (
          <ErrorState message={state.message} onRetry={onRetry} />
        )}

        {state.status === 'success' && (() => {
          const d = state.data;

          const handleDownloadPatch = () => {
            const blob = new Blob([d.suggestedSafeFix], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `astrolabe-fix-${Date.now()}.patch`;
            a.click();
            URL.revokeObjectURL(url);
          };

          // Copy PR comment handled inside PRCommentButton

          return (
            <div className="space-y-4">
              {/* Severity meter */}
              <SeverityMeter score={d.severityScore} />

              {/* Summary */}
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Summary</p>
                <p className="text-xs text-slate-300 leading-relaxed">{d.summary}</p>
              </div>

              {/* Risk index */}
              <RiskIndexBadge
                riskIndex={d.riskIndex}
                incomingImportCount={d.incomingImportCount}
                hasTestCoverage={d.hasTestCoverage}
                isBottleneck={d.isBottleneck}
                bottleneckReason={d.bottleneckReason}
              />

              {/* Affected files */}
              <AffectedFilesList files={d.affectedFiles} />

              {/* Safe fix diff */}
              <div className="space-y-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Suggested Safe Fix</p>
                <div className="rounded-lg overflow-hidden border border-slate-700">
                  <pre className="text-[10px] text-slate-300 bg-slate-950 px-3 py-2 overflow-x-auto max-h-40 font-mono whitespace-pre-wrap break-all">
                    {d.suggestedSafeFix || '(none)'}
                  </pre>
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-2">
                <PRCommentButton result={d} />
                <PatchButton
                  suggestedSafeFix={d.suggestedSafeFix}
                  repoId={repoId}
                  isAuthenticated={isAuthenticated}
                />
              </div>
            </div>
          );
        })()}
      </div>
    </motion.div>
  );
}

export type { CardState };
