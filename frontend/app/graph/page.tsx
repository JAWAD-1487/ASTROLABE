'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  NodeMouseHandler,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AnimatePresence } from 'framer-motion';

import { AnalyzeResponse, GraphEdge, GraphNode, PulseState } from '@/types/graph';
import AstroNode, { AstroNodeData } from '@/components/graph/AstroNode';
import NodeContextMenu from '@/components/graph/NodeContextMenu';
import { BlastWaveProvider, useBlastWave } from '@/context/BlastWaveContext';
import FileInspectorPanel from '@/components/inspector/FileInspectorPanel';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';

// ── Custom node types ──────────────────────────────────────────────────────────
const nodeTypes = { astroNode: AstroNode };

// ── Edge style helpers ─────────────────────────────────────────────────────────
function makeEdgeStyle(type: 'import' | 'export'): Partial<Edge> {
  const color = type === 'export' ? '#4ade80' : '#f87171';
  return {
    animated: true,
    style: { stroke: color, strokeWidth: 2, filter: `drop-shadow(0 0 4px ${color})` },
    markerEnd: { type: MarkerType.ArrowClosed, color },
    type: 'smoothstep',
  };
}

// ── Layout: simple grid layout ─────────────────────────────────────────────────
function gridLayout(count: number, _index: number): { x: number; y: number } {
  const cols = Math.ceil(Math.sqrt(count));
  const row = Math.floor(_index / cols);
  const col = _index % cols;
  return { x: col * 220, y: row * 120 };
}

// ── Context menu state ─────────────────────────────────────────────────────────
interface ContextMenu {
  x: number;
  y: number;
  nodeId: string;
}

// ── Inner canvas (has access to BlastWaveContext) ──────────────────────────────
function GraphCanvas({
  graphData,
  onInspectNode,
  authButton,
}: {
  graphData: AnalyzeResponse;
  onInspectNode: (nodeId: string) => void;
  authButton: React.ReactNode;
}) {
  const router = useRouter();
  const { targetId, level1Ids, level2Ids, dimmedIds, triggerWave, clearWave } = useBlastWave();

  // Build pulse state map
  const pulseMap = useMemo<Map<string, PulseState>>(() => {
    const m = new Map<string, PulseState>();
    if (!targetId) return m;
    m.set(targetId, 'target');
    level1Ids.forEach((id) => m.set(id, 'level1'));
    level2Ids.forEach((id) => m.set(id, 'level2'));
    dimmedIds.forEach((id) => m.set(id, 'dimmed'));
    return m;
  }, [targetId, level1Ids, level2Ids, dimmedIds]);

  // ── Build RF nodes ─────────────────────────────────────────────────────────
  const initialNodes: Node[] = useMemo(
    () =>
      graphData.nodes.map((n, i) => ({
        id: n.id,
        type: 'astroNode',
        position: gridLayout(graphData.nodes.length, i),
        data: {
          label: n.path.split('/').pop() ?? n.path,
          fileType: n.fileType,
          lineCount: n.lineCount,
          fullPath: n.path,
          pulseState: null,
        } satisfies AstroNodeData,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graphData.nodes]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // All raw edges (stored for filtering)
  const allEdges = useRef<GraphEdge[]>(graphData.edges);

  // Active edge category
  const [activeEdgeType, setActiveEdgeType] = useState<null | 'import' | 'export'>(null);

  // ── Sync pulse state into nodes ────────────────────────────────────────────
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, pulseState: pulseMap.get(n.id) ?? null },
      }))
    );
  }, [pulseMap, setNodes]);

  // ── Edge visibility ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeEdgeType) {
      setEdges([]);
      return;
    }
    const visible = allEdges.current
      .filter((e) => e.type === 'import') // all raw edges are 'import'
      .map((e, i) => ({
        id: `e-${i}`,
        source: activeEdgeType === 'import' ? e.from : e.to,
        target: activeEdgeType === 'import' ? e.to   : e.from,
        ...makeEdgeStyle(activeEdgeType),
      }));
    setEdges(visible);
  }, [activeEdgeType, setEdges]);

  // ── Context menu ───────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    event.stopPropagation();
    setSelectedNodeId(node.id);
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);

  const onPaneClick = useCallback(() => {
    setContextMenu(null);
    setSelectedNodeId(null);
    setActiveEdgeType(null);
    clearWave();
  }, [clearWave]);

  const allNodeIds = useMemo(() => graphData.nodes.map((n) => n.id), [graphData.nodes]);

  return (
    <div className="w-screen h-screen bg-slate-950 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={24} />
        <Controls className="!bg-slate-800 !border-slate-600 !text-white" />
        <MiniMap
          className="!bg-slate-900 !border-slate-700"
          nodeColor="#4f46e5"
          maskColor="rgba(2,6,23,0.7)"
        />
      </ReactFlow>

      {/* Header bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-700 rounded-xl px-5 py-2 flex items-center gap-3 text-sm text-slate-300 backdrop-blur-sm shadow-xl z-10">
        <span className="font-semibold text-white">Astrolabe</span>
        <span className="text-slate-500">·</span>
        <span>{graphData.nodes.length} files</span>
        <span className="text-slate-500">·</span>
        <span>{graphData.edges.length} imports</span>
        <button
          onClick={() => router.push('/')}
          className="ml-4 text-slate-400 hover:text-white text-xs underline"
        >
          ← New repo
        </button>
      </div>

      {/* GitHub auth button — top-right corner */}
      <div className="absolute top-4 right-4 z-10">
        {authButton}
      </div>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <NodeContextMenu
            key="ctx"
            x={contextMenu.x}
            y={contextMenu.y}
            nodeId={contextMenu.nodeId}
            onShowExports={() => setActiveEdgeType('export')}
            onShowImports={() => setActiveEdgeType('import')}
            onInspect={() => onInspectNode(contextMenu.nodeId)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </AnimatePresence>

      {/* Edge type legend */}
      {activeEdgeType && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-700 rounded-lg px-4 py-2 text-xs text-slate-300 flex items-center gap-3 backdrop-blur-sm z-10">
          <span
            className="w-3 h-0.5 rounded"
            style={{ background: activeEdgeType === 'export' ? '#4ade80' : '#f87171' }}
          />
          Showing {activeEdgeType === 'export' ? 'export' : 'import'} edges
          <button
            onClick={() => setActiveEdgeType(null)}
            className="text-slate-500 hover:text-white ml-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Blast-wave info banner */}
      {targetId && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-950/80 border border-red-700 rounded-lg px-4 py-2 text-xs text-red-300 backdrop-blur-sm z-10 flex items-center gap-3">
          <span className="animate-ping w-2 h-2 rounded-full bg-red-500 inline-block" />
          Simulating removal — click canvas to clear
        </div>
      )}
    </div>
  );
}

// ── GitHub auth button component ───────────────────────────────────────────────
function GitHubAuthButton() {
  const { user, isAuthenticated, isLoading, login, logout } = useGitHubAuth();

  if (isLoading) return null;

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 backdrop-blur-sm shadow-xl">
        <img
          src={user.avatarUrl}
          alt={user.login}
          className="w-5 h-5 rounded-full"
        />
        <span className="text-slate-200 font-medium">{user.login}</span>
        <button
          onClick={logout}
          className="text-slate-500 hover:text-white transition-colors ml-1"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className="flex items-center gap-2 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 backdrop-blur-sm shadow-xl hover:border-slate-500 hover:text-white transition-colors"
    >
      <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      Sign in with GitHub
    </button>
  );
}

// ── Inner page (uses useSearchParams — must be inside Suspense) ────────────────
function GraphPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const repoId = searchParams.get('repoId');

  const { isAuthenticated } = useGitHubAuth();
  const [graphData, setGraphData] = useState<AnalyzeResponse | null>(null);
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('astrolabe_graph');
    if (!raw) {
      router.replace('/');
      return;
    }
    const parsed: AnalyzeResponse = JSON.parse(raw);
    if (parsed.repoId !== repoId) {
      router.replace('/');
      return;
    }
    setGraphData(parsed);
  }, [repoId, router]);

  if (!graphData) {
    return (
      <div className="w-screen h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Loading graph…
      </div>
    );
  }

  const inspectedNode: GraphNode | undefined = graphData.nodes.find(
    (n) => n.id === inspectedNodeId
  );

  return (
    <ReactFlowProvider>
      <BlastWaveProvider>
        <GraphCanvas
          graphData={graphData}
          onInspectNode={setInspectedNodeId}
          authButton={<GitHubAuthButton />}
        />

        <AnimatePresence>
          {inspectedNode && repoId && (
            <FileInspectorPanel
              key={inspectedNode.id}
              node={inspectedNode}
              repoId={repoId}
              allEdges={graphData.edges}
              allNodeIds={graphData.nodes.map((n) => n.id)}
              onClose={() => setInspectedNodeId(null)}
              isAuthenticated={isAuthenticated}
            />
          )}
        </AnimatePresence>
      </BlastWaveProvider>
    </ReactFlowProvider>
  );
}

// ── Page export (wraps inner in Suspense for useSearchParams) ──────────────────
export default function GraphPage() {
  return (
    <Suspense fallback={
      <div className="w-screen h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Loading…
      </div>
    }>
      <GraphPageInner />
    </Suspense>
  );
}
