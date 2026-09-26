'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { AnalyzeResponse } from '@/types/graph';

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_URL: 'Please enter a valid public GitHub HTTPS URL.',
  FILE_CAP_EXCEEDED: 'Repository has too many JS/TS files (500 max).',
  CLONE_FAILED: 'Could not clone the repository. Make sure it is public.',
};

export default function HomePage() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data } = await axios.post<AnalyzeResponse>('/api/repo/analyze', { repoUrl });
      // Store graph data in sessionStorage so the graph page can access it
      sessionStorage.setItem('astrolabe_graph', JSON.stringify(data));
      router.push(`/graph?repoId=${data.repoId}`);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const code = err.response?.data?.error as string;
        const msg = err.response?.data?.message as string;
        setError(ERROR_MESSAGES[code] ?? msg ?? 'Something went wrong. Please try again.');
      } else {
        setError('Network error. Is the backend running?');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      {/* Logo / title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10 text-center"
      >
        <h1 className="text-5xl font-bold text-white tracking-tight">
          Astro<span className="text-indigo-400">labe</span>
        </h1>
        <p className="mt-3 text-slate-400 text-lg">
          Interactive codebase visualiser &amp; AI blast-radius engine
        </p>
      </motion.div>

      {/* Input card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl p-8 shadow-2xl"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="text-slate-300 text-sm font-medium">
            GitHub Repository URL
          </label>
          <input
            type="url"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            disabled={loading}
            required
            className="
              w-full bg-slate-800 text-white placeholder-slate-500
              border border-slate-600 rounded-lg px-4 py-3 text-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
              disabled:opacity-50
            "
          />

          {/* Error toast */}
          <AnimatePresence>
            {error && (
              <motion.p
                key="error"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-red-400 text-sm bg-red-950/40 border border-red-800 rounded-lg px-3 py-2"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading || !repoUrl.trim()}
            className="
              relative mt-1 w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900
              text-white font-semibold rounded-lg py-3 text-sm transition-colors
              disabled:cursor-not-allowed overflow-hidden
            "
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                {/* Pulsing dot */}
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                Analysing repository…
              </span>
            ) : (
              'Analyse Repository'
            )}
          </button>
        </form>

        <p className="mt-5 text-center text-slate-500 text-xs">
          Supports public GitHub repos · JS / TS files only · max 500 files
        </p>
      </motion.div>
    </main>
  );
}
