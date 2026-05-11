import { createEffect, createSignal, on, onCleanup, onMount } from "solid-js"
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"
import { ArchitectureCanvas } from "./architecture-canvas.react"
import type { ArchitectureCanvasProps } from "./architecture-canvas.react"
import {
  collectFileTree,
  buildUserMessage,
  buildSystemPrompt,
  parseArchitectureJSON,
  archFilePath,
} from "./arch-generate"
import type { GeneratedGraph, DiagramType } from "./arch-generate"

export function ArchitectureTab() {
  const sdk = useSDK()
  const sync = useSync()
  const { params } = useSessionLayout()
  const sessionID = () => params.id as string | undefined
  const sessionStatus = () => sync.data.session_status[sessionID() ?? ""]?.type ?? "idle"

  const [diagramType, setDiagramType] = createSignal<DiagramType>("component")
  const [generating, setGenerating] = createSignal(false)
  const [generatedGraph, setGeneratedGraph] = createSignal<GeneratedGraph | null>(null)

  const loadGraph = async (type: DiagramType, retries = 1) => {
    for (let i = 0; i < retries; i++) {
      try {
        const r = await sdk.client.file.read({ path: archFilePath(type) })
        if (r.data?.content) {
          const g = parseArchitectureJSON(r.data.content)
          if (g) { setGeneratedGraph(g); return true }
        }
      } catch {}
      if (i < retries - 1) await new Promise((res) => setTimeout(res, 500))
    }
    setGeneratedGraph(null)
    return false
  }

  const generate = async () => {
    const id = sessionID()
    if (!id || generating()) return
    setGenerating(true)
    const type = diagramType()
    try {
      const paths = await collectFileTree(sdk.client, "")
      let readme = ""
      try {
        const r = await sdk.client.file.read({ path: "README.md" })
        readme = r.data?.content ?? ""
      } catch {}
      await sdk.client.session.promptAsync({
        sessionID: id,
        system: buildSystemPrompt(paths, readme, type),
        parts: [{ type: "text", text: buildUserMessage(type) }],
      })
    } catch {
      setGenerating(false)
    }
  }

  createEffect(
    on(sessionStatus, (status, prev) => {
      if (!generating()) return
      if (prev !== undefined && prev !== "idle" && status === "idle") {
        const type = diagramType()
        void (async () => {
          await loadGraph(type, 5)
          setGenerating(false)
        })()
      }
    }),
  )

  // When diagram type changes, load its previously generated file
  createEffect(on(diagramType, (type) => {
    void loadGraph(type)
  }))

  let containerRef!: HTMLDivElement
  let reactRoot: ReturnType<typeof createRoot> | undefined
  const [mounted, setMounted] = createSignal(false)

  onMount(() => {
    reactRoot = createRoot(containerRef)
    setMounted(true)
    void loadGraph(diagramType())
    onCleanup(() => reactRoot?.unmount())
  })

  createEffect(() => {
    if (!mounted()) return
    const props: ArchitectureCanvasProps = {
      sessionId: sessionID(),
      generating: generating(),
      generatedGraph: generatedGraph(),
      diagramType: diagramType(),
      onGenerate: () => { void generate() },
      onDiagramTypeChange: (t) => setDiagramType(t),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reactRoot!.render(createElement(ArchitectureCanvas as any, props))
  })

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
}
