import type { Node } from "@xyflow/react"

export type GeneratedLayer = "presentation" | "domain" | "infrastructure" | "external"

export type GeneratedGraph = {
  nodes: Array<{ id: string; label: string; layer: GeneratedLayer; description?: string }>
  edges: Array<{ source: string; target: string; label?: string }>
}

const ARCH_SCHEMA = `{
  "nodes": [{ "id": "slug", "label": "Display Name", "layer": "domain|presentation|infrastructure|external" }],
  "edges": [{ "source": "slug-a", "target": "slug-b", "label": "optional" }]
}`

export function buildUserMessage(paths: string[], readme: string): string {
  const tree = paths.slice(0, 800).join("\n")
  return [
    readme ? `README:\n${readme.slice(0, 2000)}\n` : "",
    `Project file tree:\n${tree}`,
    `
Analyze the project and write ONLY a JSON file to .intent/architecture.json with this exact schema:
${ARCH_SCHEMA}

Layer rules:
- presentation: UI, output formatting, rendering, CLI output
- domain: core logic, entry points, orchestration, data models
- infrastructure: I/O, shell commands, API clients, system calls, DB adapters
- external: third-party tools or services the app calls (nvidia-smi, cloud APIs, etc.)

Rules: 5–15 nodes, group related files, node IDs are short slugs, edges show data flow (source calls/depends on target). Write ONLY valid JSON to the file, no other output.`,
  ]
    .filter(Boolean)
    .join("\n")
}

// Infer layer from component metadata when adapting legacy JSON schemas
function inferLayer(id: string, name: string, type: string, description: string): GeneratedLayer {
  const s = `${id} ${name} ${type} ${description}`.toLowerCase()
  if (/format|output|display|print|render|cli.*output|terminal/.test(s)) return "presentation"
  if (/main|entry|orchestrat|logic|model|store|domain|validat|use.?case/.test(s)) return "domain"
  if (/query|runner|command|exec|shell|adapter|client|db|database|file|io|config|detect/.test(s)) return "infrastructure"
  if (/external|third.?party|cloud|api|service|nvidia|rocm|lspci/.test(s)) return "external"
  return "infrastructure"
}

// Parse architecture.json regardless of which schema the agent used
export function parseArchitectureJSON(content: string): GeneratedGraph | null {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(content) as Record<string, unknown>
  } catch {
    return null
  }

  // Correct schema: { nodes, edges }
  if (Array.isArray(raw.nodes) && Array.isArray(raw.edges)) {
    return raw as unknown as GeneratedGraph
  }

  // Agent-invented schema: { components, relationships }
  if (Array.isArray(raw.components)) {
    type RawComponent = { id?: string; name?: string; type?: string; description?: string }
    type RawRelationship = { from?: string; to?: string; type?: string; description?: string }
    const nodes: GeneratedGraph["nodes"] = (raw.components as RawComponent[]).map((c) => ({
      id: c.id ?? crypto.randomUUID(),
      label: c.name ?? c.id ?? "Component",
      layer: inferLayer(c.id ?? "", c.name ?? "", c.type ?? "", c.description ?? ""),
      description: c.description,
    }))
    const edges: GeneratedGraph["edges"] = ((raw.relationships ?? []) as RawRelationship[])
      .filter((r) => r.from && r.to)
      .map((r) => ({ source: r.from!, target: r.to!, label: r.type ?? r.description }))
    return { nodes, edges }
  }

  return null
}

const LAYER_ORDER: GeneratedLayer[] = ["presentation", "domain", "infrastructure", "external"]
const ROW_Y_START = 60
const ROW_GAP = 180
const NODE_X_START = 80
const NODE_X_GAP = 200

export function assignPositions(rawNodes: GeneratedGraph["nodes"] = []): Node[] {
  if (!Array.isArray(rawNodes)) return []
  const countByLayer: Record<GeneratedLayer, number> = {
    presentation: 0,
    domain: 0,
    infrastructure: 0,
    external: 0,
  }
  return rawNodes.map((n) => {
    const layerIndex = LAYER_ORDER.indexOf(n.layer)
    const slot = countByLayer[n.layer]++
    return {
      id: n.id,
      type: "component",
      position: {
        x: NODE_X_START + slot * NODE_X_GAP,
        y: ROW_Y_START + layerIndex * ROW_GAP,
      },
      data: { label: n.label, layer: n.layer },
    }
  })
}

type FileClient = {
  file: {
    list(opts: { path: string }): Promise<{ data?: Array<{ name: string; path: string; type: string; ignored: boolean }> }>
  }
}

export async function collectFileTree(
  client: FileClient,
  dir: string = "",
  depth: number = 0,
  maxDepth: number = 4,
): Promise<string[]> {
  if (depth > maxDepth) return []
  try {
    const result = await client.file.list({ path: dir })
    const nodes = result.data ?? []
    const paths: string[] = []
    for (const node of nodes) {
      if (node.ignored) continue
      if (node.type === "file") {
        paths.push(node.path)
      } else if (node.type === "directory") {
        const children = await collectFileTree(client, node.path, depth + 1, maxDepth)
        paths.push(...children)
      }
    }
    return paths
  } catch {
    return []
  }
}
