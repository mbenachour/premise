import { createEffect, createSignal, on, onCleanup, onMount } from "solid-js"
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"
import { ArchitectureCanvas } from "./architecture-canvas.react"
import type { ArchitectureCanvasProps } from "./architecture-canvas.react"
import { collectFileTree, buildUserMessage, buildSystemPrompt, parseArchitectureJSON } from "./arch-generate"
import type { GeneratedGraph } from "./arch-generate"

export function ArchitectureTab() {
  const sdk = useSDK()
  const sync = useSync()
  const { params } = useSessionLayout()
  const sessionID = () => params.id as string | undefined
  const sessionStatus = () => sync.data.session_status[sessionID() ?? ""]?.type ?? "idle"

  const [generating, setGenerating] = createSignal(false)
  const [generatedGraph, setGeneratedGraph] = createSignal<GeneratedGraph | null>(null)

  const generate = async () => {
    const id = sessionID()
    if (!id || generating()) return
    setGenerating(true)
    try {
      const paths = await collectFileTree(sdk.client, "")
      let readme = ""
      try {
        const r = await sdk.client.file.read({ path: "README.md" })
        readme = r.data?.content ?? ""
      } catch {}
      await sdk.client.session.promptAsync({
        sessionID: id,
        system: buildSystemPrompt(paths, readme),
        parts: [{ type: "text", text: buildUserMessage() }],
      })
    } catch {
      setGenerating(false)
    }
  }

  createEffect(
    on(sessionStatus, (status, prev) => {
      if (!generating()) return
      if (prev !== undefined && prev !== "idle" && status === "idle") {
        void sdk.client.file
          .read({ path: ".intent/architecture.json" })
          .then((r) => {
            if (r.data?.content) {
              const g = parseArchitectureJSON(r.data.content)
              if (g) setGeneratedGraph(g)
            }
          })
          .finally(() => setGenerating(false))
      }
    }),
  )

  let containerRef!: HTMLDivElement
  let reactRoot: ReturnType<typeof createRoot> | undefined
  const [mounted, setMounted] = createSignal(false)

  onMount(() => {
    reactRoot = createRoot(containerRef)
    setMounted(true)

    // Load any previously generated architecture.json
    void sdk.client.file
      .read({ path: ".intent/architecture.json" })
      .then((result) => {
        if (result.data?.content) {
          const g = parseArchitectureJSON(result.data.content)
          if (g) setGeneratedGraph(g)
        }
      })
      .catch(() => {})

    onCleanup(() => reactRoot?.unmount())
  })

  // Re-render React canvas whenever any prop signal changes (fires after mount)
  createEffect(() => {
    if (!mounted()) return
    const props: ArchitectureCanvasProps = {
      sessionId: sessionID(),
      generating: generating(),
      generatedGraph: generatedGraph(),
      onGenerate: () => { void generate() },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reactRoot!.render(createElement(ArchitectureCanvas as any, props))
  })

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
}
