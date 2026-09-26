'use client';

import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface Props {
  x: number;
  y: number;
  nodeId: string;
  onShowExports: () => void;
  onShowImports: () => void;
  onInspect: () => void;
  onClose: () => void;
}

export default function NodeContextMenu({
  x, y, onShowExports, onShowImports, onInspect, onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.12 }}
      className="absolute z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden"
      style={{ left: x, top: y, minWidth: 160 }}
    >
      <button
        onClick={() => { onShowExports(); onClose(); }}
        className="w-full text-left px-4 py-2.5 text-sm text-green-400 hover:bg-slate-700 flex items-center gap-2"
      >
        <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
        Show Exports
      </button>
      <button
        onClick={() => { onShowImports(); onClose(); }}
        className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
      >
        <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
        Show Imports
      </button>
      <div className="border-t border-slate-600" />
      <button
        onClick={() => { onInspect(); onClose(); }}
        className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
      >
        <span className="text-indigo-400">⬡</span>
        Inspect File
      </button>
    </motion.div>
  );
}
