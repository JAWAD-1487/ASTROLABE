'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import axios from 'axios';

import { GraphNode, ImpactResponse } from '@/types/graph';
import { useBlastWave } from '@/context/BlastWaveContext';
import BlastRadiusCard, { CardState } from '@/components/blast/BlastRadiusCard';

// ── Language map ───────────────────────────────────────────────────────────────
const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
};

// ── Props ──────────────────────────────────────────────────────────────────────
interface Props {
  node: GraphNode;
  repoId: string;
  allEdges: { from: string; to: string; type: 'import' }[];
  allNodeIds: string[];
  onClose: () => void;
  isAuthenticated: boolean;
}

// ── Fetch file content from the backend ───────────────────────────────────────
async function fetchFileContent(repoId: string, filePath: string): Promise<string> {
  const res = await axios.get<{ content: string }>(
    `/api/repo/${repoId}/file`,
    { params: { path: filePath }, withCredentials: true }
  );
  return res.data.content;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function FileInspectorPanel({
  node,
  repoId,
  allEdges,
  allNodeIds,
  onClose,
  isAuthenticated,
}: Props) {
  const { triggerWave, clearWave } = useBlastWave();

  // File content
  const [content, setContent] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  // Line selection
  const [selectedLine, setSelectedLine] = useState<number | null>(null);

  // Proposed change input
  const [proposedChange, setProposedChange] = useState('');

  // Simulate removal toggle
  const [simulateRemoval, setSimulateRemoval] = useState(false);

  // Blast radius card state
  const [cardState, setCardState] = useState<CardState | null>(null);

  // Pending args for retry
  const lastArgsRef = useRef<{ lineNumber: number; proposedChange: string } | null>(null);

  // ── Fetch file content on mount ──────────────────────────────────────────────
  useEffect(() => {
    setContent(null);
    setContentError(null);
    setSelectedLine(null);
    setProposedChange('');
    setSimulateRemoval(false);
    setCardState(null);

    fetchFileContent(repoId, node.path)
      .then((c) => setContent(c))
      .catch(() => setContentError('Could not load file content.'));
  }, [repoId, node.path]);

  // ── Simulate removal toggle ──────────────────────────────────────────────────
  const handleSimulateToggle = useCallback(() => {
    setSimulateRemoval((prev) => {
      const next = !prev;
      if (next) {
        setProposedChange('Delete this function/block');
        triggerWave(node.id, allEdges, allNodeIds);
      } else {
        setProposedChange('');
        clearWave();
      }
      return next;
    });
  }, [triggerWave, clearWave, node.id, allEdges, allNodeIds]);

  // ── Run analysis ─────────────────────────────────────────────────────────────
  const runAnalysis = useCallback(async (lineNumber: number, change: string) => {
    lastArgsRef.current = { lineNumber, proposedChange: change };
    setCardState({ status: 'loading' });

    try {
      const res = await axios.post<ImpactResponse>(
        '/api/impact/evaluate',
        { repoId, filePath: node.path, lineNumber, proposedChange: change },
        { withCredentials: true }
      );
      setCardState({ status: 'success', data: res.data });
    } catch (err: unknown) {
      let message = 'Analysis failed. Please try again.';
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { message?: string; error?: string } | undefined;
        message = data?.message ?? data?.error ?? message;
      }
      setCardState({ status: 'error', message });
    }
  }, [repoId, node.path]);

  const handleAnalyze = useCallback(() => {
    if (!selectedLine || !proposedChange.trim()) return;
    runAnalysis(selectedLine, proposedChange.trim());
  }, [selectedLine, proposedChange, runAnalysis]);

  const handleRetry = useCallback(() => {
    if (lastArgsRef.current) {
      runAnalysis(lastArgsRef.current.lineNumber, lastArgsRef.current.proposedChange);
    }
  }, [runAnalysis]);

  const handleCloseCard = useCallback(() => setCardState(null), []);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const language = LANG_MAP[node.fileType] ?? 'text';
  const fileName = node.path.split('/').pop() ?? node.path;
  const canAnalyze = selectedLine !== null && proposedChange.trim().length > 0;

  // Count how many files import / are imported by this node
  const incomingCount = allEdges.filter((e) => e.to === node.id).length;
  const outgoingCount = allEdges.filter((e) => e.from === node.id).length;

  return (
    <>
      {/* ── Slide-over panel ── */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="fixed right-0 top-0 h-full w-96 bg-slate-900 border-l border-slate-700 z-20 flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-700 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-white truncate pr-4" title={node.path}>
              {fileName}
            </h2>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-white flex-shrink-0 text-sm transition-colors"
            >
              ✕
            </button>
          </div>

          {/* File meta */}
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="font-mono text-slate-500 truncate max-w-[180px]" title={node.path}>
              {node.path}
            </span>
            <span className="text-slate-600">·</span>
            <span>{node.lineCount} lines</span>
            <span className="text-slate-600">·</span>
            <span>{incomingCount} imports it</span>
            <span className="text-slate-600">·</span>
            <span>{outgoingCount} it imports</span>
          </div>
        </div>

        {/* Code viewer */}
        <div className="flex-1 overflow-y-auto text-[11px] min-h-0">
          {contentError && (
            <p className="text-red-400 text-xs p-4">{contentError}</p>
          )}
          {!content && !contentError && (
            <div className="p-4 text-slate-500 text-xs animate-pulse">Loading source…</div>
          )}
          {content && (
            <SyntaxHighlighter
              language={language}
              style={vscDarkPlus}
              showLineNumbers
              wrapLines
              lineProps={(lineNumber) => ({
                style: {
                  display: 'block',
                  cursor: 'pointer',
                  background:
                    selectedLine === lineNumber
                      ? 'rgba(99,102,241,0.25)'
                      : 'transparent',
                },
                onClick: () => setSelectedLine(lineNumber),
              })}
              customStyle={{
                margin: 0,
                background: 'transparent',
                fontSize: '11px',
                padding: '8px 0',
              }}
            >
              {content}
            </SyntaxHighlighter>
          )}
        </div>

        {/* Analysis controls */}
        <div className="flex-shrink-0 border-t border-slate-700 px-4 py-3 space-y-3 bg-slate-900">
          {/* Selected line indicator */}
          {selectedLine && (
            <p className="text-xs text-indigo-400">
              Line {selectedLine} selected — describe your proposed change below
            </p>
          )}
          {!selectedLine && (
            <p className="text-xs text-slate-500">Click a line to select it, then describe your change.</p>
          )}

          {/* Proposed change textarea */}
          <textarea
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-indigo-500 transition-colors"
            rows={2}
            placeholder="e.g. change return type from string to number"
            value={proposedChange}
            onChange={(e) => setProposedChange(e.target.value)}
          />

          {/* Simulate Removal toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleSimulateToggle}
              className={`flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 transition-colors ${
                simulateRemoval
                  ? 'bg-red-800 text-red-200 border border-red-600'
                  : 'bg-slate-800 text-slate-300 border border-slate-600 hover:border-slate-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${simulateRemoval ? 'bg-red-400 animate-ping' : 'bg-slate-500'}`} />
              Simulate Removal
            </button>

            {/* Analyze button */}
            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className={`text-xs rounded-lg px-4 py-1.5 font-semibold transition-colors ${
                canAnalyze
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              Analyze Blast Radius
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Blast radius card (overlays canvas at fixed position) ── */}
      {cardState && (
        <BlastRadiusCard
          state={cardState}
          onClose={handleCloseCard}
          onRetry={handleRetry}
          repoId={repoId}
          isAuthenticated={isAuthenticated}
        />
      )}
    </>
  );
}
