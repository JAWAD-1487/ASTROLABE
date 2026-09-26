'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { PulseState } from '@/types/graph';
import path from 'path';

// ── Extension badge colours ───────────────────────────────────────────────────
const EXT_COLORS: Record<string, string> = {
  ts:  'bg-blue-600 text-white',
  tsx: 'bg-cyan-600 text-white',
  js:  'bg-yellow-500 text-black',
  jsx: 'bg-orange-500 text-white',
};

function extColor(ext: string): string {
  return EXT_COLORS[ext] ?? 'bg-slate-600 text-white';
}

// ── Pulse variants ────────────────────────────────────────────────────────────
const variants = {
  target: {
    boxShadow: [
      '0 0 0px 0px rgba(239,68,68,0)',
      '0 0 16px 6px rgba(239,68,68,0.85)',
      '0 0 0px 0px rgba(239,68,68,0)',
    ] as string[],
    borderColor: '#ef4444',
    transition: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' as const },
  },
  level1: { borderColor: '#ef4444', transition: { duration: 0.3 } },
  level2: { borderColor: '#f59e0b', transition: { duration: 0.3, delay: 0.4 } },
  dimmed: { opacity: 0.2, transition: { duration: 0.3 } },
  normal: { borderColor: '#334155', opacity: 1, boxShadow: 'none', transition: { duration: 0.3 } },
} as const;

// ── Node data shape ───────────────────────────────────────────────────────────
export interface AstroNodeData {
  label: string;       // file name (basename)
  fileType: string;
  lineCount: number;
  fullPath: string;
  pulseState: PulseState;
  [key: string]: unknown;
}

// ── Component ─────────────────────────────────────────────────────────────────
function AstroNode({ data, selected }: NodeProps) {
  const d = data as AstroNodeData;
  const pulse = d.pulseState ?? 'normal';
  const variant = variants[pulse] ?? variants.normal;
  const fileName = path.basename(d.fullPath);

  return (
    <motion.div
      animate={variant}
      className={`
        relative rounded-lg border-2 bg-slate-800 px-3 py-2 min-w-[140px] max-w-[200px]
        cursor-pointer select-none shadow-lg
        ${selected ? 'ring-2 ring-indigo-400' : ''}
      `}
      style={{ borderColor: '#334155' }}
    >
      {/* Handles */}
      <Handle type="target" position={Position.Top}    className="!bg-slate-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-2 !h-2" />

      {/* Extension badge */}
      <span className={`absolute -top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${extColor(d.fileType)}`}>
        .{d.fileType}
      </span>

      {/* File name */}
      <p className="text-white text-xs font-semibold truncate pr-2" title={d.fullPath}>
        {fileName}
      </p>

      {/* Line count */}
      <p className="text-slate-400 text-[10px] mt-0.5">{d.lineCount} lines</p>
    </motion.div>
  );
}

export default memo(AstroNode);
