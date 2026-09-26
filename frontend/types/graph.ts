export interface GraphNode {
  id: string;
  path: string;
  lineCount: number;
  fileType: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: 'import';
}

export interface AnalyzeResponse {
  repoId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type PulseState = null | 'target' | 'level1' | 'level2' | 'dimmed';

// ── Impact Analysis ────────────────────────────────────────────────────────────

export interface AffectedFile {
  filePath: string;
  callSite: string;
  breakageReason: string;
  isBreakingChange: boolean;
}

export interface ImpactResponse {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  severityScore: number;
  summary: string;
  affectedFiles: AffectedFile[];
  suggestedSafeFix: string;
  // Risk Index fields (computed locally, merged in)
  riskIndex: number;
  isBottleneck: boolean;
  bottleneckReason: string | null;
  incomingImportCount: number;
  hasTestCoverage: boolean;
}
