'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { GraphEdge } from '@/types/graph';

interface BlastWaveState {
  targetId: string | null;
  level1Ids: Set<string>;
  level2Ids: Set<string>;
  dimmedIds: Set<string>;
}

interface BlastWaveContextValue extends BlastWaveState {
  triggerWave: (nodeId: string, edges: GraphEdge[], allNodeIds: string[]) => void;
  clearWave: () => void;
}

const EMPTY: BlastWaveState = {
  targetId: null,
  level1Ids: new Set(),
  level2Ids: new Set(),
  dimmedIds: new Set(),
};

const BlastWaveContext = createContext<BlastWaveContextValue>({
  ...EMPTY,
  triggerWave: () => {},
  clearWave: () => {},
});

export function BlastWaveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BlastWaveState>(EMPTY);

  const triggerWave = useCallback(
    (targetNodeId: string, edges: GraphEdge[], allNodeIds: string[]) => {
      // BFS inward: follow edges where `to === targetNodeId` (files that import the target)
      // level-1 = direct importers, level-2 = importers of level-1
      const level1 = new Set<string>();
      const level2 = new Set<string>();

      // direct importers of target
      for (const e of edges) {
        if (e.to === targetNodeId) level1.add(e.from);
      }

      // importers of level-1
      for (const e of edges) {
        if (level1.has(e.to) && e.from !== targetNodeId) level2.add(e.from);
      }

      // dimmed = everything not in target | level1 | level2
      const active = new Set([targetNodeId, ...level1, ...level2]);
      const dimmed = new Set(allNodeIds.filter((id) => !active.has(id)));

      setState({ targetId: targetNodeId, level1Ids: level1, level2Ids: level2, dimmedIds: dimmed });
    },
    []
  );

  const clearWave = useCallback(() => setState(EMPTY), []);

  return (
    <BlastWaveContext.Provider value={{ ...state, triggerWave, clearWave }}>
      {children}
    </BlastWaveContext.Provider>
  );
}

export function useBlastWave() {
  return useContext(BlastWaveContext);
}
