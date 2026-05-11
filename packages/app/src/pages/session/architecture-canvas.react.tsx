/** @jsxImportSource react */
import { useCallback, useEffect, useRef, useState } from "react"
import type { GeneratedGraph, DiagramType } from "./arch-generate"
import { assignPositions, DIAGRAM_TYPES } from "./arch-generate"
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  Panel,
  Handle,
  Position,
  MiniMap,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

// ─── Dynamic group color palette ──────────────────────────────────────────────

const PALETTE = [
  { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af", miniBg: "#3b82f6" },
  { bg: "#dcfce7", border: "#16a34a", text: "#14532d", miniBg: "#16a34a" },
  { bg: "#fef3c7", border: "#d97706", text: "#78350f", miniBg: "#d97706" },
  { bg: "#f3e8ff", border: "#9333ea", text: "#581c87", miniBg: "#9333ea" },
  { bg: "#fee2e2", border: "#dc2626", text: "#7f1d1d", miniBg: "#dc2626" },
  { bg: "#e0f2fe", border: "#0284c7", text: "#0c4a6e", miniBg: "#0284c7" },
  { bg: "#f0fdf4", border: "#15803d", text: "#14532d", miniBg: "#15803d" },
  { bg: "#f3f4f6", border: "#6b7280", text: "#1f2937", miniBg: "#6b7280" },
]

function groupColorIndex(group: string): number {
  let h = 0
  for (let i = 0; i < group.length; i++) h = (h * 31 + group.charCodeAt(i)) & 0xffff
  return h % (PALETTE.length - 1) // reserve grey as fallback for unknowns
}

function groupConfig(group: string) {
  return PALETTE[groupColorIndex(group)] ?? PALETTE[PALETTE.length - 1]
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const storageKey = (sessionId?: string, diagramType?: string) =>
  `arch-canvas-v2:${diagramType ?? "component"}:${sessionId ?? ""}`

function loadState(sessionId?: string, diagramType?: string): { nodes: Node[]; edges: Edge[] } {
  try {
    const raw = localStorage.getItem(storageKey(sessionId, diagramType))
    if (raw) return JSON.parse(raw)
  } catch {}
  return { nodes: [], edges: [] }
}

function saveState(nodes: Node[], edges: Edge[], sessionId?: string, diagramType?: string) {
  try {
    localStorage.setItem(storageKey(sessionId, diagramType), JSON.stringify({ nodes, edges }))
  } catch {}
}

// ─── Custom node ──────────────────────────────────────────────────────────────

function ComponentNode({ data, selected }: NodeProps) {
  const group = (data.layer as string) || "other"
  const cfg = groupConfig(group)

  return (
    <div
      style={{
        background: cfg.bg,
        border: `2px solid ${selected ? cfg.text : cfg.border}`,
        borderRadius: 8,
        padding: "8px 14px",
        minWidth: 130,
        boxShadow: selected ? `0 0 0 2px ${cfg.border}` : "0 1px 4px rgba(0,0,0,0.1)",
        cursor: "grab",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: cfg.border }} />
      <div style={{ fontSize: 13, fontWeight: 600, color: cfg.text, lineHeight: 1.3 }}>
        {data.label as string}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: cfg.border,
          marginTop: 3,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {cfg.label}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: cfg.border }} />
    </div>
  )
}

const nodeTypes = { component: ComponentNode }

// ─── Main canvas ──────────────────────────────────────────────────────────────

export type ArchitectureCanvasProps = {
  sessionId?: string
  generating?: boolean
  onGenerate?: () => void
  generatedGraph?: GeneratedGraph | null
  diagramType?: DiagramType
  onDiagramTypeChange?: (type: DiagramType) => void
}

export function ArchitectureCanvas(props: ArchitectureCanvasProps = {}) {
  const initial = loadState(props.sessionId, props.diagramType)
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)
  const [approved, setApproved] = useState(false)

  // Track current diagramType in a ref so saveState always targets the right key
  // without being triggered by a type change (which would save the old type's nodes into the new key)
  const diagramTypeRef = useRef(props.diagramType)
  diagramTypeRef.current = props.diagramType

  // Persist on node/edge/session change — deliberately excludes diagramType from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { saveState(nodes, edges, props.sessionId, diagramTypeRef.current) }, [nodes, edges, props.sessionId])

  // Reload canvas when diagram type switches
  useEffect(() => {
    const saved = loadState(props.sessionId, props.diagramType)
    setNodes(saved.nodes)
    setEdges(saved.edges)
  }, [props.diagramType, props.sessionId])

  // Apply generated graph when it arrives
  useEffect(() => {
    if (!props.generatedGraph) return
    try {
      const positioned = assignPositions(props.generatedGraph.nodes ?? [])
      const rfEdges: Edge[] = (props.generatedGraph.edges ?? []).map((e, i) => ({
        id: `gen_edge_${i}`,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: false,
      }))
      setNodes(positioned)
      setEdges(rfEdges)
      setApproved(false)
    } catch (err) {
      console.error("[ArchitectureCanvas] failed to apply generated graph:", err)
    }
  }, [props.generatedGraph])

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, animated: false }, eds)),
    [setEdges],
  )

  const nodeCount = nodes.length

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView={nodeCount > 0}
        deleteKeyCode="Backspace"
        style={{ background: "var(--background-stronger, #f8f9fa)" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(0,0,0,0.08)" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => groupConfig((n.data?.layer as string) || "other").miniBg}
          style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8 }}
        />

        {/* Toolbar */}
        <Panel position="top-left">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <select
              value={props.diagramType ?? "component"}
              onChange={(e) => props.onDiagramTypeChange?.(e.target.value as DiagramType)}
              disabled={props.generating}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "var(--background-base, #fff)",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-base, #222)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                cursor: props.generating ? "default" : "pointer",
                appearance: "auto",
              }}
            >
              {DIAGRAM_TYPES.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            <button
              onClick={() => props.onGenerate?.()}
              disabled={props.generating}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid rgba(0,0,0,0.12)",
                background: props.generating ? "rgba(0,0,0,0.04)" : "var(--background-base, #fff)",
                fontSize: 12,
                fontWeight: 500,
                cursor: props.generating ? "default" : "pointer",
                color: props.generating ? "rgba(0,0,0,0.4)" : "var(--text-base, #222)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                opacity: props.generating ? 0.7 : 1,
              }}
            >
              <span style={{ fontSize: 13, lineHeight: 1 }}>✦</span>
              {props.generating ? "Generating…" : nodeCount > 0 ? "Re-generate" : "Generate"}
            </button>
          </div>
        </Panel>

        {/* Group legend — derived from current nodes */}
        {nodes.length > 0 && (
          <Panel position="top-right">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "8px 10px",
                background: "var(--background-base, #fff)",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              {[...new Set(nodes.map((n) => (n.data?.layer as string) || "other"))].map((g) => (
                <div key={g} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: groupConfig(g).miniBg, flexShrink: 0 }} />
                  <span style={{ color: "var(--text-base, #444)", fontWeight: 500 }}>{g}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Approve */}
        <Panel position="bottom-center">
          {nodeCount === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-weak, #999)", padding: "4px 0" }}>
              Click Generate to create your architecture
            </div>
          ) : approved ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                borderRadius: 8,
                background: "#dcfce7",
                border: "1.5px solid #16a34a",
                color: "#14532d",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <span>✓</span> Architecture Approved
              <button
                onClick={() => setApproved(false)}
                style={{
                  marginLeft: 8,
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: "1px solid #16a34a",
                  background: "transparent",
                  fontSize: 11,
                  cursor: "pointer",
                  color: "#14532d",
                }}
              >
                Re-open
              </button>
            </div>
          ) : (
            <button
              onClick={() => setApproved(true)}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                border: "none",
                background: "#2563eb",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
              }}
            >
              Approve Architecture →
            </button>
          )}
        </Panel>
      </ReactFlow>

    </div>
  )
}
