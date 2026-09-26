'use client';

import React, { useState } from 'react';
import axios from 'axios';

interface Props {
  suggestedSafeFix: string;
  repoId: string;
  isAuthenticated: boolean;
}

export default function PatchButton({ suggestedSafeFix, repoId, isAuthenticated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Unauthenticated: browser .patch download ───────────────────────────────
  const handleDownload = () => {
    const blob = new Blob([suggestedSafeFix], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `astrolabe-fix-${Date.now()}.patch`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Authenticated: call backend to create branch + PR ─────────────────────
  const handleCreateBranch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post<{ prUrl: string }>(
        '/api/patch/create-branch',
        { repoId, suggestedSafeFix },
        { withCredentials: true }
      );
      window.open(res.data.prUrl, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      let msg = 'Failed to create branch.';
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { message?: string } | undefined;
        msg = data?.message ?? msg;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    return (
      <div className="space-y-1">
        <button
          onClick={handleCreateBranch}
          disabled={loading}
          className={`w-full text-xs rounded-lg px-3 py-1.5 transition-colors font-medium ${
            loading
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-green-700 hover:bg-green-600 text-white'
          }`}
        >
          {loading ? '⏳ Creating branch…' : '🌿 Create Branch & PR'}
        </button>
        {error && <p className="text-[10px] text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <button
      onClick={handleDownload}
      className="w-full text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg px-3 py-1.5 transition-colors"
    >
      ↓ Download .patch
    </button>
  );
}
