import { createSignal, For } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"

type Requirement = { id: string; text: string }

export function RequirementsTab() {
  const [summary, setSummary] = createSignal("")
  const [reqs, setReqs] = createStore<Requirement[]>([])
  let newInputRef: HTMLInputElement | undefined

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
        <div class="text-12-medium text-text-weak uppercase tracking-wide">App Summary</div>
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
