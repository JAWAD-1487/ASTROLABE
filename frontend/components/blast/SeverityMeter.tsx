'use client';

import React, { useEffect, useState } from 'react';

interface Props {
  score: number; // 0–100
}

function scoreColor(score: number): string {
  if (score >= 75) return '#ef4444'; // red — CRITICAL
  if (score >= 50) return '#f97316'; // orange — HIGH
  if (score >= 25) return '#f59e0b'; // amber — MEDIUM
  return '#4ade80';                  // green — LOW
}

function scoreLabel(score: number): string {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

export default function SeverityMeter({ score }: Props) {
  const [displayed, setDisplayed] = useState(0);

  // Count up from 0 to score on mount / score change
  useEffect(() => {
    setDisplayed(0);
    let current = 0;
    const target = Math.min(100, Math.max(0, score));
    const step = Math.ceil(target / 40); // ~40 frames
    const interval = setInterval(() => {
      current = Math.min(current + step, target);
      setDisplayed(current);
      if (current >= target) clearInterval(interval);
    }, 20);
    return () => clearInterval(interval);
  }, [score]);

  const color = scoreColor(score);
  const label = scoreLabel(score);
  const pct = displayed; // 0-100 mapped to bar width

  return (
    <div className="space-y-1">
      {/* Label row */}
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-slate-400 uppercase tracking-wide">Severity Score</span>
        <span className="text-lg font-bold tabular-nums" style={{ color }}>
          {displayed}
          <span className="text-xs text-slate-500 font-normal">/100</span>
        </span>
      </div>

      {/* Bar track */}
      <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full transition-none"
          style={{
            width: `${pct}%`,
            background: color,
            boxShadow: `0 0 8px 1px ${color}80`,
          }}
        />
      </div>

      {/* Severity label */}
      <p className="text-xs font-semibold" style={{ color }}>
        {label}
      </p>
    </div>
  );
}
