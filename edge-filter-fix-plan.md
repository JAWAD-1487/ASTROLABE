# Edge Filter Fix Plan

## Overview

When a user right-clicks a node on the graph canvas and selects "Show Imports" or "Show Exports" from the context menu, the canvas currently displays **all** import/export edges across the entire graph. The expected behaviour is that only edges **connected to the selected node** should be visible.

**Root Cause:** The `useEffect` that builds the visible edges array (line 120 of `frontend/app/graph/page.tsx`) filters by edge *type* only. It does not filter by the currently selected node's ID. The `selectedNodeId` state variable exists but is never referenced inside this effect.

**Scope:** One file, one `useEffect`, two extra filter conditions. No new components, no new state, no new API calls.

---

## Sub-Tasks

### Sub-Task 1 — Add `selectedNodeId` as a filter in the edge-visibility `useEffect`

**Status:** `[x] done`

**Intent**

Limit visible edges to only those that are connected to the node the user right-clicked on, while preserving the existing direction-reversal logic for exports.

**Expected Outcomes**

- "Show Imports" displays only edges where `edge.to === selectedNodeId` (files *this* file imports from).
- "Show Exports" displays only edges where `edge.from === selectedNodeId` (files that import *this* file, i.e. its dependents).
- Selecting a different node and choosing an edge type shows only that node's edges.
- Clearing the edge type (clicking the canvas or the legend close button) still hides all edges.

**Todo List**

1. Open `frontend/app/graph/page.tsx`.
2. In the `useEffect` at line 120, add a guard: if `selectedNodeId` is `null`, clear edges and return early (same as the `!activeEdgeType` guard).
3. Add a per-node filter to the `.filter()` chain:
   - For **import**: keep edges where `e.to === selectedNodeId` (this file imports those files).
   - For **export**: keep edges where `e.from === selectedNodeId` (those files import this file).
   - Since both directions are derived from the same raw `'import'` edge type, the condition `e.from === selectedNodeId || e.to === selectedNodeId` covers both cases before the direction-reversal map.
4. Add `selectedNodeId` to the `useEffect` dependency array.
5. Verify the `setActiveEdgeType` call in `onShowExports` / `onShowImports` callbacks (lines 208–209) does not need changes — the new filter will handle scoping automatically.

**Relevant Context**

- `frontend/app/graph/page.tsx` — lines 107–134 (state + effect), lines 140–144 (node click handler), lines 200–213 (context menu render)
- `selectedNodeId` is already set in `onNodeClick` (line 142) — it just needs to be wired into the effect.
- `allEdges` ref holds raw `GraphEdge[]` where every edge has `type: 'import'`, `from: string`, `to: string`.
- The direction-reversal for exports (line 129–130) must be preserved — only the filter predicate changes.
