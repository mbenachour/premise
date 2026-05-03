import { createQuery, useQueryClient } from "@tanstack/solid-query"
import { createEffect, createMemo, createSignal, For, Match, on, Show, Switch } from "solid-js"
import type { Part, PromptFileChange, PromptRecord } from "@opencode-ai/sdk/v2"
import { Collapsible } from "@opencode-ai/ui/collapsible"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  const sec = Math.floor(diff / 1000)
  if (sec < 5) return "just now"
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  return `${d}d ago`
}

function promptTextFromParts(parts: Part[]): string {
  const text = parts
    .filter((p): p is Extract<Part, { type: "text" }> => p.type === "text" && !("synthetic" in p && p.synthetic))
    .map((p) => p.text)
    .join(" ")
    .trim()
  return text || "…"
}

// ── Inline diff stats (shown after message text) ──────────────────────────────

function InlineDiff(props: { add: number; del: number }) {
  return (
    <Show when={props.add > 0 || props.del > 0}>
      <span class="ml-2 shrink-0 inline-flex items-center gap-1 text-11-regular opacity-60">
        <Show when={props.add > 0}>
          <span class="text-[var(--icon-diff-add-base)]">+{props.add}</span>
        </Show>
        <Show when={props.del > 0}>
          <span class="text-[var(--icon-diff-delete-base)]">-{props.del}</span>
        </Show>
      </span>
    </Show>
  )
}

// ── File change row (expanded) ────────────────────────────────────────────────

function FileChangeRow(props: { change: PromptFileChange }) {
  const shortPath = () => {
    const p = props.change.path
    return p.length > 52 ? "…" + p.slice(p.length - 51) : p
  }
  const statusClass = () =>
    props.change.status === "added"
      ? "text-[var(--icon-diff-add-base)]"
      : props.change.status === "deleted"
        ? "text-[var(--icon-diff-delete-base)]"
        : "text-[var(--color-warning,#e8a74b)]"

  return (
    <div class="flex items-center gap-2 px-2 py-0.5 text-11-regular text-text-weak">
      <span class={`font-mono w-3 text-center shrink-0 ${statusClass()}`}>
        {props.change.status === "added" ? "A" : props.change.status === "deleted" ? "D" : "M"}
      </span>
      <span class="flex-1 min-w-0 truncate font-mono text-text-weaker">{shortPath()}</span>
      <span class="shrink-0 tabular-nums flex gap-1">
        <Show when={props.change.additions > 0}>
          <span class="text-[var(--icon-diff-add-base)]">+{props.change.additions}</span>
        </Show>
        <Show when={props.change.deletions > 0}>
          <span class="text-[var(--icon-diff-delete-base)]">-{props.change.deletions}</span>
        </Show>
      </span>
    </div>
  )
}

// ── Single graph row ──────────────────────────────────────────────────────────

function HistoryRow(props: {
  record: PromptRecord
  promptText: string
  isFirst: boolean
  isLast: boolean
  showAgentBadge: boolean
  fileChanges: () => PromptFileChange[] | undefined
  onExpand: () => void
}) {
  const [open, setOpen] = createSignal(false)

  const totalAdd = () => (props.fileChanges() ?? []).reduce((s, f) => s + f.additions, 0)
  const totalDel = () => (props.fileChanges() ?? []).reduce((s, f) => s + f.deletions, 0)

  const handleOpen = (v: boolean) => {
    if (v && !props.fileChanges()) props.onExpand()
    setOpen(v)
  }

  const isRunning = () => props.record.status === "running"
  const isInterrupted = () => props.record.status === "interrupted"

  return (
    <Collapsible variant="ghost" open={open()} onOpenChange={handleOpen}>
      <Collapsible.Trigger
        class="w-full grid items-start text-left cursor-pointer group hover:bg-[color-mix(in_srgb,var(--background-base)_92%,white_8%)] transition-colors"
        style={{ "grid-template-columns": "96px 28px 1fr auto" }}
      >
        {/* Col 1 — agent badge */}
        <div class="flex items-start justify-end pr-3 pt-2.5">
          <Show when={props.showAgentBadge}>
            <span
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-10-medium border shrink-0 max-w-full truncate"
              classList={{
                "border-[var(--color-accent)] text-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]":
                  !isInterrupted(),
                "border-[var(--text-weak)] text-[var(--text-weak)] bg-transparent": isInterrupted(),
              }}
            >
              <span class="shrink-0 text-[9px]">✓</span>
              <span class="truncate">{props.record.agentName}</span>
            </span>
          </Show>
        </div>

        {/* Col 2 — graph spine + node */}
        <div class="relative flex flex-col items-center self-stretch">
          {/* top connector */}
          <Show when={!props.isFirst}>
            <div class="w-px flex-none h-2.5 bg-[var(--color-accent)] opacity-40" />
          </Show>
          <Show when={props.isFirst}>
            <div class="h-2.5 shrink-0" />
          </Show>

          {/* node */}
          <div
            class="relative z-10 shrink-0 rounded-full border-2 size-3"
            classList={{
              "bg-[var(--color-accent)] border-[var(--color-accent)]": !isRunning() && !isInterrupted(),
              "border-[var(--color-accent)] bg-transparent animate-pulse": isRunning(),
              "border-[var(--text-weak)] bg-transparent": isInterrupted(),
            }}
          />

          {/* bottom connector */}
          <Show when={!props.isLast}>
            <div class="w-px flex-1 bg-[var(--color-accent)] opacity-40 min-h-2" />
          </Show>
        </div>

        {/* Col 3 — message + inline diff */}
        <div class="px-3 py-2 min-w-0 flex items-baseline gap-0 flex-wrap">
          <span
            class="text-13-regular truncate max-w-full"
            classList={{
              "text-text-base": !isInterrupted() && !isRunning(),
              "text-text-weak italic": isRunning(),
              "text-text-weaker": isInterrupted(),
            }}
          >
            {props.promptText}
            <Show when={isRunning()}>
              <span class="text-text-weaker"> running…</span>
            </Show>
          </span>
          <InlineDiff add={totalAdd()} del={totalDel()} />
        </div>

        {/* Col 4 — date */}
        <div class="pr-3 py-2.5 shrink-0 text-11-regular text-text-weaker tabular-nums whitespace-nowrap">
          {relativeTime(props.record.timeStarted)}
        </div>
      </Collapsible.Trigger>

      {/* Expanded file list */}
      <Collapsible.Content>
        <div
          class="grid py-1"
          style={{ "grid-template-columns": "96px 28px 1fr" }}
        >
          <div />
          <div class="relative flex justify-center">
            <div class="w-px absolute inset-0 bg-[var(--color-accent)] opacity-40" />
          </div>
          <div class="py-0.5 flex flex-col gap-0.5">
            <Switch>
              <Match when={!props.fileChanges()}>
                <div class="text-11-regular text-text-weaker px-2 py-1">Loading…</div>
              </Match>
              <Match when={props.fileChanges()?.length === 0}>
                <div class="text-11-regular text-text-weaker px-2 py-1">No file changes</div>
              </Match>
              <Match when={true}>
                <For each={props.fileChanges()}>{(fc) => <FileChangeRow change={fc} />}</For>
              </Match>
            </Switch>
          </div>
        </div>
      </Collapsible.Content>
    </Collapsible>
  )
}

// ── History tab ───────────────────────────────────────────────────────────────

export function HistoryTab() {
  const sdk = useSDK()
  const sync = useSync()
  const queryClient = useQueryClient()
  const { params } = useSessionLayout()

  const sessionID = () => params.id as string | undefined
  const sessionStatus = () => sync.data.session_status[sessionID() ?? ""]?.type ?? "idle"

  const queryKey = () => ["promptEngine", "session", sessionID()]

  // Refetch whenever the session transitions back to idle (agent just finished)
  createEffect(
    on(sessionStatus, (status, prev) => {
      if (prev !== undefined && prev !== "idle" && status === "idle") {
        void queryClient.invalidateQueries({ queryKey: queryKey() })
      }
    }),
  )

  const promptsQuery = createQuery(() => {
    const id = sessionID()
    return {
      queryKey: queryKey(),
      queryFn: id
        ? () => sdk.client.promptEngine.getPromptsForSession({ sessionID: id }).then((r) => r.data!)
        : undefined,
      enabled: !!id,
      // Poll while session is actively running; createEffect handles completion
      refetchInterval: () => (sessionStatus() !== "idle" ? 1500 : false),
    }
  })

  const [fileChangesCache, setFileChangesCache] = createSignal<Record<string, PromptFileChange[]>>({})

  const loadFileChanges = async (promptID: string) => {
    if (fileChangesCache()[promptID]) return
    try {
      const result = await sdk.client.promptEngine
        .getFileChangesForPrompt({ promptID })
        .then((r) => r.data!)
      setFileChangesCache((prev) => ({ ...prev, [promptID]: result }))
    } catch {
      setFileChangesCache((prev) => ({ ...prev, [promptID]: [] }))
    }
  }

  // newest-first, running prompts float to top
  const prompts = createMemo(() => {
    const list = [...(promptsQuery.data ?? [])]
    list.sort((a, b) => {
      if (a.status === "running" && b.status !== "running") return -1
      if (b.status === "running" && a.status !== "running") return 1
      return b.timeStarted - a.timeStarted
    })
    return list
  })

  return (
    <div class="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        class="grid shrink-0 border-b border-border-weaker-base bg-background-stronger"
        style={{ "grid-template-columns": "96px 28px 1fr auto" }}
      >
        <div class="px-3 py-1.5 text-10-medium text-text-weaker uppercase tracking-wider text-right">
          Agent
        </div>
        <div />
        <div class="px-3 py-1.5 text-10-medium text-text-weaker uppercase tracking-wider">
          Prompt
        </div>
        <div class="px-3 py-1.5 text-10-medium text-text-weaker uppercase tracking-wider whitespace-nowrap">
          Time
        </div>
      </div>

      {/* Body */}
      <div class="flex-1 overflow-y-auto">
        <Switch>
          <Match when={promptsQuery.isPending}>
            <div class="h-full flex items-center justify-center">
              <span class="text-12-regular text-text-weaker">Loading…</span>
            </div>
          </Match>

          <Match when={prompts().length === 0}>
            <div class="h-full flex flex-col items-center justify-center gap-4 pb-24 text-center">
              <div class="flex flex-col items-center gap-0">
                <div class="w-px h-8 bg-[var(--color-accent)] opacity-30" />
                <div class="size-3 rounded-full border-2 border-[var(--color-accent)] opacity-30" />
                <div class="w-px h-8 bg-[var(--color-accent)] opacity-30" />
              </div>
              <div class="text-12-regular text-text-weaker max-w-44">
                No prompt history yet.
                <br />
                Start chatting to track your changes here.
              </div>
            </div>
          </Match>

          <Match when={true}>
            <For each={prompts()}>
              {(record, idx) => {
                const prev = () => prompts()[idx() - 1]
                const showBadge = () => !prev() || prev().agentName !== record.agentName
                return (
                  <HistoryRow
                    record={record}
                    promptText={promptTextFromParts(sync.data.part[record.id] ?? [])}
                    isFirst={idx() === 0}
                    isLast={idx() === prompts().length - 1}
                    showAgentBadge={showBadge()}
                    fileChanges={() => fileChangesCache()[record.id]}
                    onExpand={() => void loadFileChanges(record.id)}
                  />
                )
              }}
            </For>
          </Match>
        </Switch>
      </div>
    </div>
  )
}
