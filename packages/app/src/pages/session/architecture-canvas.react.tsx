/** @jsxImportSource react */
import React, { useCallback, useEffect, useRef, useState } from "react"
import type { GeneratedGraph } from "./arch-generate"
import { assignPositions } from "./arch-generate"
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

// ─── Layer config ─────────────────────────────────────────────────────────────

type Layer = "presentation" | "domain" | "infrastructure" | "external"

const LAYERS: { id: Layer; label: string; bg: string; border: string; text: string; miniBg: string }[] = [
  { id: "presentation", label: "Presentation", bg: "#dbeafe", border: "#3b82f6", text: "#1e40af", miniBg: "#3b82f6" },
  { id: "domain", label: "Domain", bg: "#dcfce7", border: "#16a34a", text: "#14532d", miniBg: "#16a34a" },
  { id: "infrastructure", label: "Infrastructure", bg: "#fef3c7", border: "#d97706", text: "#78350f", miniBg: "#d97706" },
  { id: "external", label: "External", bg: "#f3f4f6", border: "#6b7280", text: "#1f2937", miniBg: "#6b7280" },
]

const layerConfig = (layer: Layer) => LAYERS.find((l) => l.id === layer) ?? LAYERS[3]

// ─── Persistence ──────────────────────────────────────────────────────────────

const storageKey = (sessionId?: string) =>
  sessionId ? `arch-canvas-v1:${sessionId}` : "arch-canvas-v1"

function loadState(sessionId?: string): { nodes: Node[]; edges: Edge[] } {
  try {
    const raw = localStorage.getItem(storageKey(sessionId))
    if (raw) return JSON.parse(raw)
  } catch {}
  return { nodes: [], edges: [] }
}

function saveState(nodes: Node[], edges: Edge[], sessionId?: string) {
  try {
    localStorage.setItem(storageKey(sessionId), JSON.stringify({ nodes, edges }))
  } catch {}
}

// ─── Custom node ──────────────────────────────────────────────────────────────

function ComponentNode({ data, selected }: NodeProps) {
  const layer = (data.layer as Layer) ?? "domain"
  const cfg = layerConfig(layer)

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

// ─── Add-node form ────────────────────────────────────────────────────────────

function AddNodeForm({ onAdd, onClose }: { onAdd: (name: string, layer: Layer) => void; onClose: () => void }) {
  const [name, setName] = useState("")
  const [layer, setLayer] = useState<Layer>("domain")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onAdd(name.trim(), layer)
    onClose()
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "var(--background-base, #fff)",
          borderRadius: 10,
          padding: "20px 24px",
          minWidth: 280,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          border: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-strong, #111)" }}>
          Add Component
        </div>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Component name"
          style={{
            border: "1px solid rgba(0,0,0,0.15)",
            borderRadius: 6,
            padding: "7px 10px",
            fontSize: 13,
            outline: "none",
            color: "var(--text-base, #222)",
            background: "var(--surface-panel, #f9f9f9)",
            width: "100%",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-weak, #888)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Layer</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {LAYERS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLayer(l.id)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: `2px solid ${layer === l.id ? l.border : "rgba(0,0,0,0.1)"}`,
                  background: layer === l.id ? l.bg : "transparent",
                  color: layer === l.id ? l.text : "var(--text-base, #444)",
                  fontSize: 12,
                  fontWeight: layer === l.id ? 600 : 400,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "7px 14px",
              borderRadius: 6,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "transparent",
              fontSize: 13,
              cursor: "pointer",
              color: "var(--text-base, #444)",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            style={{
              padding: "7px 16px",
              borderRadius: 6,
              border: "none",
              background: name.trim() ? "#2563eb" : "rgba(0,0,0,0.1)",
              color: name.trim() ? "#fff" : "rgba(0,0,0,0.3)",
              fontSize: 13,
              fontWeight: 600,
              cursor: name.trim() ? "pointer" : "default",
            }}
          >
            Add
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Main canvas ──────────────────────────────────────────────────────────────

export type ArchitectureCanvasProps = {
  sessionId?: string
  generating?: boolean
  onGenerate?: () => void
  generatedGraph?: GeneratedGraph | null
}

let nodeIdCounter = Date.now()
const nextId = () => `node_${nodeIdCounter++}`

export function ArchitectureCanvas(props: ArchitectureCanvasProps = {}) {
  const initial = loadState(props.sessionId)
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)
  const [showForm, setShowForm] = useState(false)
  const [approved, setApproved] = useState(false)

  // Persist on every change
  useEffect(() => { saveState(nodes, edges, props.sessionId) }, [nodes, edges, props.sessionId])

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

  const addNode = (name: string, layer: Layer) => {
    const cfg = layerConfig(layer)
    const id = nextId()
    // Spread new nodes across the canvas based on layer index
    const layerIndex = LAYERS.findIndex((l) => l.id === layer)
    const existingInLayer = nodes.filter((n) => n.data.layer === layer).length
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "component",
        position: { x: 80 + existingInLayer * 160, y: 60 + layerIndex * 160 },
        data: { label: name, layer },
      },
    ])
    setApproved(false)
  }

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
          nodeColor={(n) => layerConfig((n.data?.layer as Layer) ?? "domain").miniBg}
          style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8 }}
        />

        {/* Toolbar */}
        <Panel position="top-left">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
              {props.generating ? "Generating…" : "Generate"}
            </button>
            <button
              onClick={() => setShowForm(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "var(--background-base, #fff)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                color: "var(--text-base, #222)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
              Add Component
            </button>
          </div>
        </Panel>

        {/* Layer legend */}
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
            {LAYERS.map((l) => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: l.miniBg, flexShrink: 0 }} />
                <span style={{ color: "var(--text-base, #444)", fontWeight: 500 }}>{l.label}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Approve */}
        <Panel position="bottom-center">
          {nodeCount === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-weak, #999)", padding: "4px 0" }}>
              Add components to start designing your architecture
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

      {showForm && (
        <AddNodeForm onAdd={addNode} onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}
