import { createEffect, createSignal, For, on, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { Part } from "@opencode-ai/sdk/v2/client"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"

type Requirement = { id: string; text: string; committed: boolean; planPath?: string; implemented?: boolean }

function extractDescription(md: string): string {
  const match = md.match(/##\s*Description\s*\n([\s\S]*?)(?=\n##|\n#|$)/)
  if (match?.[1].trim()) return match[1].trim()
  const titleMatch = md.match(/#\s*Intent:\s*([^\n]+)/)
  if (titleMatch) return titleMatch[1].trim()
  return md.trim()
}

export function RequirementsTab() {
  const sdk = useSDK()
  const sync = useSync()
  const { params } = useSessionLayout()
  const sessionID = () => params.id as string | undefined
  const sessionStatus = () => sync.data.session_status[sessionID() ?? ""]?.type ?? "idle"

  const storageKey = () => `requirements-summary-v1:${sessionID() ?? ""}`
  const reqsStorageKey = () => `requirements-list-v1:${sessionID() ?? ""}`

  const loadFromStorage = () => {
    try {
      const raw = localStorage.getItem(storageKey())
      if (raw) return JSON.parse(raw) as { summary: string; generated: boolean }
    } catch {}
    return null
  }

  const loadReqsFromStorage = (): Requirement[] => {
    try {
      const raw = localStorage.getItem(reqsStorageKey())
      if (raw) return JSON.parse(raw) as Requirement[]
    } catch {}
    return []
  }

  const initial = loadFromStorage()
  const [summary, setSummary] = createSignal(initial?.summary ?? "")
  const [generated, setGenerated] = createSignal(initial?.generated ?? false)
  const [generating, setGenerating] = createSignal(false)
  const [planningReqId, setPlanningReqId] = createSignal<string | null>(null)
  const [implementingReqId, setImplementingReqId] = createSignal<string | null>(null)
  const [viewingPlanId, setViewingPlanId] = createSignal<string | null>(null)
  const [planContent, setPlanContent] = createSignal("")
  const [reqs, setReqs] = createStore<Requirement[]>(loadReqsFromStorage())
  let newInputRef: HTMLInputElement | undefined

  createEffect(() => {
    const key = storageKey()
    if (!key.endsWith(":")) {
      try { localStorage.setItem(key, JSON.stringify({ summary: summary(), generated: generated() })) } catch {}
    }
  })

  createEffect(() => {
    const key = reqsStorageKey()
    if (!key.endsWith(":")) {
      try { localStorage.setItem(key, JSON.stringify(reqs)) } catch {}
    }
  })

  const generate = async () => {
    const id = sessionID()
    if (!id || generating()) return
    setGenerating(true)
    try {
      await sdk.client.session.promptAsync({
        sessionID: id,
        agent: "requirements",
        parts: [{ type: "text", text: "Analyze the current project and create a paragraph summary of this application." }],
      })
    } catch {
      setGenerating(false)
    }
  }

  const loadRequirementsFile = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const r = await sdk.client.file.read({ path: ".intent/requirements.md" })
        if (r.data?.content) {
          setSummary(extractDescription(r.data.content))
          setGenerated(true)
          return true
        }
      } catch {}
      if (i < retries - 1) await new Promise((res) => setTimeout(res, 500))
    }
    return false
  }

  const loadPlanFile = async (reqId: string, planPath: string, retries = 5) => {
    for (let i = 0; i < retries; i++) {
      try {
        const r = await sdk.client.file.read({ path: planPath })
        if (r.data?.content) {
          const idx = reqs.findIndex((r) => r.id === reqId)
          if (idx !== -1) setReqs(idx, "planPath", planPath)
          return true
        }
      } catch {}
      if (i < retries - 1) await new Promise((res) => setTimeout(res, 500))
    }
    return false
  }

  const extractFromMessages = () => {
    const id = sessionID()
    if (!id) return false
    const messages = sync.data.message[id] ?? []
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
    if (!lastAssistant) return false
    const parts = sync.data.part[lastAssistant.id] ?? []
    const textParts = parts.filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
    const text = textParts.map((p) => p.text).join("").trim()
    if (!text) return false
    setSummary(text)
    setGenerated(true)
    return true
  }

  // When session goes idle after summary generation, read the output file
  createEffect(
    on(sessionStatus, (status, prev) => {
      if (!generating()) return
      if (prev !== undefined && prev !== "idle" && status === "idle") {
        void (async () => {
          const loaded = await loadRequirementsFile(5)
          if (!loaded) extractFromMessages()
          setGenerating(false)
        })()
      }
    }),
  )

  onMount(() => {
    void loadRequirementsFile()
  })

  const addReq = () => {
    const id = crypto.randomUUID()
    setReqs(reqs.length, { id, text: "", committed: false })
    queueMicrotask(() => newInputRef?.focus())
  }

  const commitReq = (id: string) => {
    const idx = reqs.findIndex((r) => r.id === id)
    if (idx === -1) return
    if (reqs[idx].text.trim()) {
      setReqs(idx, "committed", true)
    }
  }

  const uncommitReq = (id: string) => {
    const idx = reqs.findIndex((r) => r.id === id)
    if (idx === -1) return
    setReqs(idx, "committed", false)
  }

  const updateReq = (id: string, text: string) => {
    const idx = reqs.findIndex((r) => r.id === id)
    if (idx === -1) return
    setReqs(idx, "text", text)
    setReqs(idx, "committed", false)
  }

  const deleteReq = (id: string) => {
    setReqs(reqs.filter((r) => r.id !== id))
  }

  const handleKeyDown = (id: string, e: KeyboardEvent) => {
    if (e.key === "Enter") {
      const req = reqs.find((r) => r.id === id)
      if (req?.text.trim()) {
        commitReq(id)
        addReq()
      }
    }
    if (e.key === "Backspace") {
      const req = reqs.find((r) => r.id === id)
      if (req?.text === "") {
        e.preventDefault()
        deleteReq(id)
      }
    }
  }

  const waitForSessionDone = (id: string) =>
    new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout>
      const done = () => { clearTimeout(timer); unsubIdle(); unsubErr(); resolve() }
      const unsubIdle = sdk.event.on("session.idle", (event: { properties: { sessionID: string } }) => {
        if (event.properties.sessionID === id) done()
      })
      const unsubErr = sdk.event.on("session.error", (event: { properties: { sessionID?: string } }) => {
        if (event.properties.sessionID === id) done()
      })
      timer = setTimeout(done, 120_000)
    })

  const planReq = async (req: Requirement) => {
    const id = sessionID()
    if (!id || planningReqId()) return
    setPlanningReqId(req.id)
    try {
      await sdk.client.session.promptAsync({
        sessionID: id,
        agent: "requirement-plan",
        system: `Save the implementation plan to exactly this path: .intent/plans/${req.id}.md`,
        parts: [{ type: "text", text: `Plan: ${req.text}` }],
      })
      await waitForSessionDone(id)
      const planPath = `.intent/plans/${req.id}.md`
      await loadPlanFile(req.id, planPath)
    } finally {
      setPlanningReqId(null)
    }
  }

  const implementReq = async (req: Requirement) => {
    const id = sessionID()
    if (!id || implementingReqId()) return
    setImplementingReqId(req.id)
    try {
      await sdk.client.session.promptAsync({
        sessionID: id,
        parts: [{ type: "text", text: `Implement: ${req.text}` }],
      })
      await waitForSessionDone(id)
      const idx = reqs.findIndex((r) => r.id === req.id)
      if (idx !== -1) setReqs(idx, "implemented", true)
    } finally {
      setImplementingReqId(null)
    }
  }

  const viewPlan = async (req: Requirement) => {
    if (!req.planPath) return
    if (viewingPlanId() === req.id) {
      setViewingPlanId(null)
      setPlanContent("")
      return
    }
    try {
      const r = await sdk.client.file.read({ path: req.planPath })
      if (r.data?.content) {
        setPlanContent(r.data.content)
        setViewingPlanId(req.id)
      }
    } catch {}
  }

  return (
    <div class="h-full flex flex-col overflow-y-auto px-4 py-4 gap-5">
      {/* Summary */}
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <div class="text-12-medium text-text-weak uppercase tracking-wide">App Summary</div>
          <Button
            variant="ghost"
            size="small"
            class="text-text-weak hover:text-text-base"
            disabled={generating()}
            onClick={() => void generate()}
          >
            {generating() ? "Generating…" : generated() ? "Regenerate" : "Generate"}
          </Button>
        </div>
        <textarea
          value={summary()}
          onInput={(e) => setSummary(e.currentTarget.value)}
          placeholder="Describe what you're building..."
          rows={4}
          class="w-full resize-none rounded-md border border-border-weak-base bg-background-base px-3 py-2 text-14-regular text-text-base placeholder:text-text-weaker focus:outline-none focus:ring-1 focus:ring-border-interactive-base transition-colors"
        />
      </div>

      {/* Requirements list */}
      <div class="flex flex-col gap-2 flex-1">
        <div class="text-12-medium text-text-weak uppercase tracking-wide">Requirements</div>
        <div class="flex flex-col gap-1">
          <For each={reqs}>
            {(req, idx) => (
              <div class="flex flex-col gap-1">
                <div class="group flex items-center gap-2">
                  <div class="shrink-0 size-4 flex items-center justify-center">
                    <div class="size-1.5 rounded-full bg-text-weaker" />
                  </div>
                  <Show
                    when={req.implemented}
                    fallback={
                      <input
                        ref={(el) => {
                          if (idx() === reqs.length - 1) newInputRef = el
                        }}
                        type="text"
                        value={req.text}
                        onInput={(e) => updateReq(req.id, e.currentTarget.value)}
                        onKeyDown={(e) => handleKeyDown(req.id, e)}
                        onBlur={() => commitReq(req.id)}
                        placeholder="Add a requirement..."
                        class="flex-1 min-w-0 bg-transparent border-none text-14-regular text-text-base placeholder:text-text-weaker focus:outline-none py-1 px-1 rounded hover:bg-surface-base-hover focus:bg-surface-base-hover transition-colors"
                      />
                    }
                  >
                    <span class="flex-1 min-w-0 text-14-regular text-text-weaker line-through py-1 px-1">
                      {req.text}
                    </span>
                  </Show>
                  <Show when={req.committed && req.text.trim() && sessionID() && !req.implemented}>
                    <Show
                      when={req.planPath}
                      fallback={
                        <Button
                          variant="ghost"
                          size="small"
                          class="shrink-0 text-text-weak hover:text-text-base"
                          disabled={planningReqId() === req.id}
                          onClick={() => void planReq(req)}
                        >
                          {planningReqId() === req.id ? "Planning…" : "Plan"}
                        </Button>
                      }
                    >
                      <Button
                        variant="ghost"
                        size="small"
                        class="shrink-0 text-text-weak hover:text-text-base"
                        onClick={() => void viewPlan(req)}
                      >
                        {viewingPlanId() === req.id ? "Hide Plan" : "View Plan"}
                      </Button>
                    </Show>
                    <Button
                      variant="ghost"
                      size="small"
                      class="shrink-0 text-accent hover:text-accent/80"
                      disabled={implementingReqId() === req.id}
                      onClick={() => void implementReq(req)}
                    >
                      {implementingReqId() === req.id ? "Implementing…" : "Implement"}
                    </Button>
                  </Show>
                  <IconButton
                    icon="close-small"
                    variant="ghost"
                    size="small"
                    class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => deleteReq(req.id)}
                    aria-label="Delete requirement"
                  />
                </div>
                <Show when={viewingPlanId() === req.id && planContent()}>
                  <div class="ml-6 rounded-md border border-border-weak-base bg-surface-base p-3 text-12-regular text-text-base whitespace-pre-wrap font-mono overflow-x-auto max-h-96 overflow-y-auto">
                    {planContent()}
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
        <Button
          variant="ghost"
          size="small"
          class="self-start flex items-center gap-1.5 text-text-weak hover:text-text-base mt-1"
          onClick={addReq}
        >
          <Icon name="plus-small" size="small" />
          <span>Add requirement</span>
        </Button>
      </div>
    </div>
  )
}
