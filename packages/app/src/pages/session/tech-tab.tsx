import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"

// ─── Data ─────────────────────────────────────────────────────────────────────

type Option = {
  id: string
  name: string
  fitScore: number
  implication: string
}

type Category = {
  id: string
  label: string
  options: Option[]
}

const CATEGORIES: Category[] = [
  {
    id: "ui-framework",
    label: "UI Framework",
    options: [
      { id: "react", name: "React", fitScore: 92, implication: "Strong TypeScript support enforces contract types at component boundaries. JSX tree maps cleanly to Presentation layer." },
      { id: "vue", name: "Vue", fitScore: 74, implication: "Lighter setup, but weaker TypeScript inference makes Domain contract enforcement harder at scale." },
      { id: "solid", name: "Solid", fitScore: 81, implication: "Fine-grained reactivity reduces render overhead. Smaller ecosystem may limit Infrastructure adapter options." },
    ],
  },
  {
    id: "data-layer",
    label: "Data Layer",
    options: [
      { id: "drizzle", name: "Drizzle ORM", fitScore: 88, implication: "Type-safe queries align with Domain layer contracts. Lightweight — no runtime overhead added to Infrastructure adapter." },
      { id: "prisma", name: "Prisma", fitScore: 76, implication: "Strong DX and migrations, but generated client adds abstraction that can obscure boundary violations." },
      { id: "raw-sql", name: "Raw SQL", fitScore: 65, implication: "Maximum control but no compile-time safety. Increases risk of contract drift in Infrastructure layer." },
    ],
  },
  {
    id: "runtime",
    label: "Runtime",
    options: [
      { id: "node", name: "Node.js", fitScore: 85, implication: "Largest ecosystem — most Infrastructure adapters available off the shelf. Proven for Server surface." },
      { id: "bun", name: "Bun", fitScore: 79, implication: "Faster startup and built-in bundler. Smaller ecosystem may require custom Infrastructure adapters." },
      { id: "deno", name: "Deno", fitScore: 68, implication: "Secure by default, good for Regulated stakes. npm compatibility gaps may affect Infrastructure layer." },
    ],
  },
  {
    id: "styling",
    label: "Styling",
    options: [
      { id: "tailwind", name: "Tailwind CSS", fitScore: 90, implication: "Utility classes keep styling in Presentation layer. No runtime CSS-in-JS crossing layer boundaries." },
      { id: "css-modules", name: "CSS Modules", fitScore: 80, implication: "Scoped styles with zero runtime. Slight friction for dynamic theming tied to Domain state." },
      { id: "styled-components", name: "Styled Components", fitScore: 62, implication: "Runtime CSS generation can couple Presentation and Domain concerns if component props carry business logic." },
    ],
  },
  {
    id: "testing",
    label: "Testing",
    options: [
      { id: "vitest", name: "Vitest", fitScore: 91, implication: "Native ESM, shares Vite config. Fast unit tests for Domain layer pure functions — no build step." },
      { id: "jest", name: "Jest", fitScore: 72, implication: "Mature ecosystem but CommonJS default requires extra config for ESM modules in Domain layer." },
      { id: "playwright", name: "Playwright", fitScore: 78, implication: "Best for Presentation layer E2E testing. Overkill as primary unit test runner for Domain logic." },
    ],
  },
  {
    id: "deployment",
    label: "Deployment",
    options: [
      { id: "docker", name: "Docker", fitScore: 87, implication: "Full control over runtime environment. Matches Server surface target — reproducible Infrastructure layer." },
      { id: "railway", name: "Railway", fitScore: 75, implication: "Zero-config deploys. Less control over Infrastructure layer configuration for Regulated stakes projects." },
      { id: "vercel", name: "Vercel", fitScore: 70, implication: "Best for Browser surface with serverless functions. Less suited if Server surface requires persistent connections." },
    ],
  },
]

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "tech-choices-v1"

type SavedState = {
  locked: Record<string, string>  // categoryId → optionId
  approved: boolean
}

function loadState(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { locked: {}, approved: false }
}

function persist(state: SavedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

// ─── Fit score badge ──────────────────────────────────────────────────────────

function fitColor(score: number): { bg: string; text: string } {
  if (score >= 85) return { bg: "bg-green-100", text: "text-green-700" }
  if (score >= 65) return { bg: "bg-amber-100", text: "text-amber-700" }
  return { bg: "bg-surface-stronger", text: "text-text-weak" }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TechTab() {
  const initial = loadState()
  const [state, setState] = createStore<SavedState>(initial)

  const save = () => persist({ locked: state.locked, approved: state.approved })

  const lock = (categoryId: string, optionId: string) => {
    setState("locked", categoryId, optionId)
    setState("approved", false)
    save()
  }

  const approve = () => {
    setState("approved", true)
    save()
  }

  const reopen = () => {
    setState("approved", false)
    save()
  }

  const allLocked = createMemo(() => CATEGORIES.every((c) => !!state.locked[c.id]))
  const lockedCount = createMemo(() => Object.keys(state.locked).length)

  return (
    <div class="h-full flex flex-col overflow-hidden">
      <div class="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        <For each={CATEGORIES}>
          {(category) => {
            const lockedId = () => state.locked[category.id]
            const isLocked = () => !!lockedId()
            const lockedOption = () => category.options.find((o) => o.id === lockedId())

            return (
              <div class="flex flex-col gap-1.5">
                {/* Category header */}
                <div class="flex items-center justify-between px-1">
                  <span class="text-12-medium text-text-weak uppercase tracking-wide">
                    {category.label}
                  </span>
                  <Show when={isLocked()}>
                    <span class="flex items-center gap-1 text-11-medium text-green-600">
                      <span>✓</span>
                      <span>Locked</span>
                    </span>
                  </Show>
                </div>

                {/* Options */}
                <div class="flex flex-col rounded-lg border border-border-weaker-base overflow-hidden">
                  <Show
                    when={isLocked()}
                    fallback={
                      <For each={category.options}>
                        {(option, idx) => {
                          const fc = fitColor(option.fitScore)
                          return (
                            <div
                              classList={{
                                "flex flex-col gap-1 px-3 py-2.5 cursor-default": true,
                                "border-t border-border-weaker-base": idx() > 0,
                                "bg-background-base hover:bg-surface-base-hover transition-colors": true,
                              }}
                            >
                              <div class="flex items-center gap-2">
                                <span class="flex-1 text-13-medium text-text-base">{option.name}</span>
                                <span
                                  classList={{
                                    "text-11-medium px-1.5 py-0.5 rounded font-mono shrink-0": true,
                                    [fc.bg]: true,
                                    [fc.text]: true,
                                  }}
                                >
                                  {option.fitScore}
                                </span>
                                <button
                                  class="shrink-0 px-2.5 py-1 rounded text-11-medium font-medium border border-border-weak-base bg-background-base hover:bg-surface-base-hover text-text-base transition-colors"
                                  onClick={() => lock(category.id, option.id)}
                                >
                                  Lock
                                </button>
                              </div>
                              <p class="text-12-regular text-text-weak leading-relaxed">
                                {option.implication}
                              </p>
                            </div>
                          )
                        }}
                      </For>
                    }
                  >
                    {/* Locked state — show only chosen option */}
                    <Show when={lockedOption()}>
                      {(opt) => {
                        const fc = fitColor(opt().fitScore)
                        return (
                          <div class="flex flex-col gap-1 px-3 py-2.5 bg-surface-base">
                            <div class="flex items-center gap-2">
                              <span class="text-green-600 text-13-medium shrink-0">✓</span>
                              <span class="flex-1 text-13-medium text-text-base">{opt().name}</span>
                              <span
                                classList={{
                                  "text-11-medium px-1.5 py-0.5 rounded font-mono shrink-0": true,
                                  [fc.bg]: true,
                                  [fc.text]: true,
                                }}
                              >
                                {opt().fitScore}
                              </span>
                              <span class="shrink-0 px-2.5 py-1 rounded text-11-medium font-medium border border-green-200 bg-green-50 text-green-700">
                                Locked
                              </span>
                            </div>
                            <p class="text-12-regular text-text-weak leading-relaxed">
                              {opt().implication}
                            </p>
                          </div>
                        )
                      }}
                    </Show>
                  </Show>
                </div>
              </div>
            )
          }}
        </For>
      </div>

      {/* Bottom bar */}
      <div class="shrink-0 border-t border-border-weaker-base px-4 py-3">
        <Show
          when={state.approved}
          fallback={
            <button
              onClick={approve}
              disabled={!allLocked()}
              classList={{
                "w-full py-2 rounded-lg text-13-medium font-semibold transition-colors": true,
                "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer": allLocked(),
                "bg-surface-stronger text-text-weaker cursor-not-allowed": !allLocked(),
              }}
            >
              {allLocked()
                ? "Approve Tech Stack →"
                : `Lock all categories to approve (${lockedCount()}/${CATEGORIES.length})`}
            </button>
          }
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-13-medium text-green-700">
              <span>✓</span>
              <span>Tech stack approved — {lockedCount()} choices locked</span>
            </div>
            <button
              onClick={reopen}
              class="text-12-regular text-text-weak hover:text-text-base transition-colors"
            >
              Re-open
            </button>
          </div>
        </Show>
      </div>
    </div>
  )
}
