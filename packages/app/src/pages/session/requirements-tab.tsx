import { createEffect, createSignal, For, on, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import type { Part } from "@opencode-ai/sdk/v2/client"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"

type Requirement = { id: string; text: string }

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

  const loadFromStorage = () => {
    try {
      const raw = localStorage.getItem(storageKey())
      if (raw) return JSON.parse(raw) as { summary: string; generated: boolean }
    } catch {}
    return null
  }

  const initial = loadFromStorage()
  const [summary, setSummary] = createSignal(initial?.summary ?? "")
  const [generated, setGenerated] = createSignal(initial?.generated ?? false)
  const [generating, setGenerating] = createSignal(false)
  const [reqs, setReqs] = createStore<Requirement[]>([])
  let newInputRef: HTMLInputElement | undefined

  createEffect(() => {
    const key = storageKey()
    if (!key.endsWith(":")) {
      try { localStorage.setItem(key, JSON.stringify({ summary: summary(), generated: generated() })) } catch {}
    }
  })

  const generate = async () => {
    const id = sessionID()
    if (!id || generating()) return
    setGenerating(true)
    try {
      await sdk.client.session.promptAsync({
        sessionID: id,
        agent: "requirements_agent",
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

  // When session goes idle after generation, read the output file
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
    setReqs(reqs.length, { id, text: "" })
    // focus after DOM update
    queueMicrotask(() => newInputRef?.focus())
  }

  const updateReq = (id: string, text: string) => {
    const idx = reqs.findIndex((r) => r.id === id)
    if (idx === -1) return
    setReqs(idx, "text", text)
  }

  const deleteReq = (id: string) => {
    setReqs(reqs.filter((r) => r.id !== id))
  }

  const handleKeyDown = (id: string, e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addReq()
    }
    if (e.key === "Backspace") {
      const req = reqs.find((r) => r.id === id)
      if (req?.text === "") {
        e.preventDefault()
        deleteReq(id)
      }
    }
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
              <div class="group flex items-center gap-2">
                <div class="shrink-0 size-4 flex items-center justify-center">
                  <div class="size-1.5 rounded-full bg-text-weaker" />
                </div>
                <input
                  ref={(el) => {
                    if (idx() === reqs.length - 1) newInputRef = el
                  }}
                  type="text"
                  value={req.text}
                  onInput={(e) => updateReq(req.id, e.currentTarget.value)}
                  onKeyDown={(e) => handleKeyDown(req.id, e)}
                  placeholder="Add a requirement..."
                  class="flex-1 min-w-0 bg-transparent border-none text-14-regular text-text-base placeholder:text-text-weaker focus:outline-none py-1 px-1 rounded hover:bg-surface-base-hover focus:bg-surface-base-hover transition-colors"
                />
                <IconButton
                  icon="close-small"
                  variant="ghost"
                  size="small"
                  class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteReq(req.id)}
                  aria-label="Delete requirement"
                />
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
