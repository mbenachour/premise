import type { Node } from "@xyflow/react"

export type GeneratedLayer = string

export type DiagramType = "component" | "deployment" | "composite"

export const DIAGRAM_TYPES: { value: DiagramType; label: string }[] = [
  { value: "component", label: "Component" },
  { value: "deployment", label: "Deployment" },
  { value: "composite", label: "Composite Structure" },
]

export function archFilePath(type: DiagramType): string {
  if (type === "component") return ".premise/architecture.json"
  if (type === "deployment") return ".premise/architecture-deployment.json"
  return ".premise/architecture-composite.json"
}

export type GeneratedGraph = {
  nodes: Array<{ id: string; label: string; layer: GeneratedLayer; description?: string }>
  edges: Array<{ source: string; target: string; label?: string }>
}

const ARCH_SCHEMA = `{
  "nodes": [{ "id": "slug", "label": "Display Name", "layer": "group-name" }],
  "edges": [{ "source": "slug-a", "target": "slug-b", "label": "optional" }]
}`

export function buildUserMessage(type: DiagramType = "component"): string {
  if (type === "deployment") return "Analyzing deployment topology and generating deployment diagram..."
  if (type === "composite") return "Analyzing internal structure of major components and generating composite structure diagram..."
  return "Analyzing codebase and generating architecture..."
}

function componentInstructions(filePath: string) {
  return `Analyze the project and produce a Component Diagram — write ONLY a JSON file to exactly this path: ${filePath}

Use this schema:
${ARCH_SCHEMA}

Identify 3–7 logical groups that reflect this project's actual structure (features, services, packages, modules).
Use 5–15 nodes. Group related files into a single node. Node IDs are short slugs. Edges show data flow (source calls/depends on target).
Write ONLY valid JSON, no other output.`
}

function deploymentInstructions(filePath: string) {
  return `Analyze the project and produce a Deployment Diagram — write ONLY a JSON file to exactly this path: ${filePath}

Use this schema:
${ARCH_SCHEMA}

Focus on the physical and logical deployment topology:
- Nodes represent deployment units: servers, containers, cloud services, databases, load balancers, CDNs, workers, queues
- The "layer" field is the deployment group: "load-balancer", "web-server", "database", "cache", "storage", "external", "cdn", "worker", "queue", "cloud" (pick what fits)
- Edges represent network connections, data flows, or deployment relationships (label with protocol where relevant: "HTTPS", "TCP", "JDBC", "S3 API", etc.)
- Use 5–15 nodes. Infer deployment topology from config files, docker-compose, Dockerfiles, package.json scripts, cloud config, README.
Write ONLY valid JSON, no other output.`
}

function compositeInstructions(filePath: string) {
  return `Analyze the project and produce a Composite Structure Diagram — write ONLY a JSON file to exactly this path: ${filePath}

Use this schema:
${ARCH_SCHEMA}

Focus on the internal structure of the major classifiers/components in the codebase:
- Identify 3–6 major classifiers (classes, modules, or services that have significant internal structure)
- Nodes represent the PARTS inside each classifier (sub-components, collaborators, internal managers)
- The "layer" field is the parent classifier name (e.g. "AuthService", "SessionManager", "ApiGateway")
- Edges represent connectors between parts: how they collaborate internally
- Use 5–15 nodes total across all classifiers.
Write ONLY valid JSON, no other output.`
}

export function buildSystemPrompt(paths: string[], readme: string, type: DiagramType = "component"): string {
  const tree = paths.slice(0, 800).join("\n")
  const filePath = archFilePath(type)
  const instructions =
    type === "deployment" ? deploymentInstructions(filePath)
    : type === "composite" ? compositeInstructions(filePath)
    : componentInstructions(filePath)
  return [
    readme ? `README:\n${readme.slice(0, 2000)}\n` : "",
    `Project file tree:\n${tree}`,
    instructions,
  ]
    .filter(Boolean)
    .join("\n")
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
      layer: c.type ?? "other",
      description: c.description,
    }))
    const edges: GeneratedGraph["edges"] = ((raw.relationships ?? []) as RawRelationship[])
      .filter((r) => r.from && r.to)
      .map((r) => ({ source: r.from!, target: r.to!, label: r.type ?? r.description }))
    return { nodes, edges }
  }

  return null
}

const ROW_Y_START = 60
const ROW_GAP = 180
const NODE_X_START = 80
const NODE_X_GAP = 200

export function assignPositions(rawNodes: GeneratedGraph["nodes"] = []): Node[] {
  if (!Array.isArray(rawNodes)) return []

  const groupOrder: string[] = []
  const countByGroup: Record<string, number> = {}
  for (const n of rawNodes) {
    if (!groupOrder.includes(n.layer)) {
      groupOrder.push(n.layer)
      countByGroup[n.layer] = 0
    }
  }

  return rawNodes.map((n) => {
    const groupIndex = groupOrder.indexOf(n.layer)
    const slot = countByGroup[n.layer]++
    return {
      id: n.id,
      type: "component",
      position: {
        x: NODE_X_START + slot * NODE_X_GAP,
        y: ROW_Y_START + groupIndex * ROW_GAP,
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
