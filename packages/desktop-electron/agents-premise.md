# Premise Agents — Spec

Three built-in agents that power the Intent → Architecture → Tech phases of the premise workflow. Each agent is a first-class built-in (defined in `packages/opencode/src/agent/agent.ts` alongside `build` and `plan`), with a dedicated system prompt `.txt` file and a scoped permission ruleset.

---

## Agent 1: `requirements_agent`

**Phase:** Intent (Phase 1)
**Artifact written:** `.intent/requirements.md`

### Responsibility

Translates raw user prompts and freeform session conversation into a structured requirements document. The agent reads the session history, infers intent, classifies the project across 5 axes, and writes `.intent/requirements.md` to disk. It does not write code, modify existing files, or touch anything outside `.intent/`.

### Trigger

Called when user clicks "Analyze Intent" in the Requirements tab. Invoked via `session.promptAsync({ agent: "requirements_agent", ... })`.

### System Prompt (`prompt/requirements-agent.txt`)

```
You are the requirements_agent for premise. Your sole job is to read the current session conversation and produce a structured requirements document.

You MUST:
1. Read the full session conversation to understand what the user wants to build.
2. Write exactly ONE file: .intent/requirements.md — in the format specified below.
3. End your response with a single confirmation sentence (e.g. "Requirements written to .intent/requirements.md").
4. Write NO other files. Write NO code. Make NO other changes.

## Output Format

# Intent: <3-6 word project title>

## Description
<2-3 sentence plain-language description of what is being built>

## Classification

| Axis          | Value        |
|---------------|--------------|
| Scope         | <Module \| Application \| Platform \| Service> |
| Surface       | <Browser \| CLI \| Desktop \| Mobile \| API>   |
| Stakes        | <Internal \| External \| Regulated>            |
| Novelty       | <Standard \| Novel \| Experimental>            |
| Reversibility | <Reversible \| Append-Only \| Destructive>     |

## Mode
**<Sketch \| Build \| Design>**

## Assumptions

- [low] <assumption>
- [medium] <assumption>
- [high] <assumption>

(max 5 assumptions, tagged low / medium / high by confidence risk)

## Scope

### In scope
- <item>

### Out of scope
- <item>

## Requirements

- REQ-001: <requirement>
- REQ-002: <requirement>

(each requirement is one sentence, actionable, testable)
```

### Permissions

| Tool | Access |
|---|---|
| `read` | allow — reads session context and existing `.intent/` files |
| `grep` / `glob` | allow — searches project for context |
| `bash` | deny — no shell execution |
| `edit.*` | deny for `*`, **allow** for `.intent/requirements.md` only |
| all other write tools | deny |

### Agent Definition Shape

```typescript
requirements_agent: {
  name: "requirements_agent",
  description: "Analyzes the session conversation and writes a structured requirements document to .intent/requirements.md.",
  mode: "primary",
  native: true,
  prompt: PROMPT_REQUIREMENTS_AGENT,
  permission: Permission.merge(
    defaults,
    Permission.fromConfig({
      bash: "deny",
      edit: {
        "*": "deny",
        ".intent/requirements.md": "allow",
      },
    }),
    user,
  ),
  options: {},
}
```

---

## Agent 2: `architecture_agent`

**Phase:** Architecture (Phase 2)
**Artifact written:** `.intent/architecture.json`

### Responsibility

Analyzes the live codebase at any point in time and generates a ReactFlow-compatible node/edge graph representing the actual component architecture. The output is a JSON file that the Architecture tab can load directly into the React Flow canvas. The agent derives layers (Presentation / Domain / Infrastructure / External) by reading the codebase structure — not from what the user tells it.

### Trigger

Called when user clicks "Analyze Codebase" in the Architecture tab. Can be re-run at any time (output overwrites `.intent/architecture.json`).

### System Prompt (`prompt/architecture-agent.txt`)

```
You are the architecture_agent for premise. Your job is to analyze the current codebase and produce a ReactFlow-compatible architecture graph.

You MUST:
1. Use grep, glob, read, and bash (read-only commands only: find, ls, cat) to explore the codebase structure.
2. Identify components, modules, services, and their relationships.
3. Assign each component to one of four layers: presentation, domain, infrastructure, external.
4. Write exactly ONE file: .intent/architecture.json — in the format specified below.
5. End your response with a short confirmation sentence.
6. Write NO other files. Write NO code.

## Layer Definitions

- presentation: UI components, views, pages, forms — anything the user directly interacts with
- domain: Business logic, calculations, pure functions, state machines — no UI, no I/O
- infrastructure: Adapters, API clients, database access, file system wrappers — I/O boundary
- external: Third-party services, databases, runtime environments — passive, no outbound calls from codebase

## Output Format (.intent/architecture.json)

{
  "version": "1",
  "generatedAt": "<ISO timestamp>",
  "nodes": [
    {
      "id": "<unique-id>",
      "data": { "label": "<ComponentName>", "layer": "<presentation|domain|infrastructure|external>" },
      "position": { "x": <number>, "y": <number> },
      "type": "default"
    }
  ],
  "edges": [
    {
      "id": "<unique-id>",
      "source": "<node-id>",
      "target": "<node-id>",
      "type": "smoothstep"
    }
  ]
}

## Layout Guidelines

Position nodes in swimlane bands (approximate Y ranges):
- presentation: y 0–200
- domain: y 250–450
- infrastructure: y 500–700
- external: y 750–950

Space nodes horizontally by 200px increments within each layer.
```

### Permissions

| Tool | Access |
|---|---|
| `read` | allow |
| `grep` / `glob` / `list` | allow |
| `bash` | allow — **read-only commands only** (find, ls, wc, cat); enforced by prompt |
| `edit.*` | deny for `*`, **allow** for `.intent/architecture.json` only |
| `webfetch` / `websearch` | deny |
| all other write tools | deny |

### Agent Definition Shape

```typescript
architecture_agent: {
  name: "architecture_agent",
  description: "Analyzes the codebase and writes a ReactFlow-compatible architecture graph to .intent/architecture.json.",
  mode: "primary",
  native: true,
  prompt: PROMPT_ARCHITECTURE_AGENT,
  permission: Permission.merge(
    defaults,
    Permission.fromConfig({
      webfetch: "deny",
      websearch: "deny",
      edit: {
        "*": "deny",
        ".intent/architecture.json": "allow",
      },
    }),
    user,
  ),
  options: {},
}
```

---

## Agent 3: `techstack_agent`

**Phase:** Tech (Phase 3)
**Artifact written:** `.intent/tech.json`

### Responsibility

Reads the codebase and identifies all technologies in use: languages, frameworks, libraries, runtimes, databases, deployment targets. For each detected technology, it computes a fit score against the architecture defined in `.intent/architecture.json` and writes `.intent/tech.json`. The agent re-runs on demand — it sources from actual `package.json`, lock files, config files, and import statements, not from what the user says.

### Trigger

Called when user opens the Tech tab (if `.intent/tech.json` doesn't exist) or clicks "Re-analyze" explicitly.

### System Prompt (`prompt/techstack-agent.txt`)

```
You are the techstack_agent for premise. Your job is to analyze the codebase and identify all technologies in use, then score their fit against the approved architecture.

You MUST:
1. Read package.json, lock files (package-lock.json, bun.lockb, yarn.lock), and config files to identify dependencies.
2. Read .intent/architecture.json if it exists — use it to compute fit scores.
3. Scan import statements in source files to find actively used libraries (not just installed ones).
4. Write exactly ONE file: .intent/tech.json — in the format specified below.
5. End with a short confirmation sentence.
6. Write NO other files. Write NO code.

## Fit Score Guidelines

Score 0–100. Evaluate each technology against the layer model in architecture.json:
- 85–100: Strong fit — aligns with layer boundaries, TypeScript-native, minimal abstraction leakage
- 65–84: Acceptable — works but has tradeoffs against the architecture
- 0–64: Poor fit — couples layers, adds runtime overhead that crosses boundaries, or conflicts with detected surfaces

If no architecture.json exists, base fit scores on general best practices.

## Output Format (.intent/tech.json)

{
  "version": "1",
  "generatedAt": "<ISO timestamp>",
  "categories": [
    {
      "id": "<category-id>",
      "label": "<Category Label>",
      "detected": true,
      "options": [
        {
          "id": "<option-id>",
          "name": "<Technology Name>",
          "fitScore": <0-100>,
          "implication": "<one sentence: what choosing this means for this specific architecture>",
          "detected": <true if found in codebase, false if suggested alternative>,
          "version": "<detected version or null>"
        }
      ]
    }
  ]
}

## Categories to analyze

Always include these categories if relevant:
- UI Framework (React, Vue, Solid, Svelte, etc.)
- Data Layer (ORM, query builder, raw SQL)
- Runtime (Node.js, Bun, Deno, browser)
- Styling (Tailwind, CSS Modules, styled-components, etc.)
- Testing (Vitest, Jest, Playwright, etc.)
- Deployment (Docker, Vercel, Railway, etc.)
- Language (TypeScript, JavaScript, Python, etc.)
- Build Tool (Vite, Webpack, esbuild, Turbo, etc.)
```

### Permissions

| Tool | Access |
|---|---|
| `read` | allow |
| `grep` / `glob` / `list` | allow |
| `bash` | allow — **read-only** (find, cat, ls, jq on lock files) |
| `edit.*` | deny for `*`, **allow** for `.intent/tech.json` only |
| `webfetch` | allow — may fetch npm registry for version info |
| `websearch` | deny |
| all other write tools | deny |

### Agent Definition Shape

```typescript
techstack_agent: {
  name: "techstack_agent",
  description: "Analyzes the codebase dependencies and source imports, then writes a scored tech stack breakdown to .intent/tech.json.",
  mode: "primary",
  native: true,
  prompt: PROMPT_TECHSTACK_AGENT,
  permission: Permission.merge(
    defaults,
    Permission.fromConfig({
      websearch: "deny",
      edit: {
        "*": "deny",
        ".intent/tech.json": "allow",
      },
    }),
    user,
  ),
  options: {},
}
```

---

## Implementation Plan

### Files to create

| File | Content |
|---|---|
| `packages/opencode/src/session/prompt/requirements-agent.txt` | System prompt for requirements_agent |
| `packages/opencode/src/session/prompt/architecture-agent.txt` | System prompt for architecture_agent |
| `packages/opencode/src/session/prompt/techstack-agent.txt` | System prompt for techstack_agent |

### Files to modify

| File | Change |
|---|---|
| `packages/opencode/src/agent/agent.ts` | Import 3 new prompt .txt files, add 3 agent entries to the `agents` record |

### Import block addition (agent.ts)

```typescript
import PROMPT_REQUIREMENTS_AGENT from "../session/prompt/requirements-agent.txt"
import PROMPT_ARCHITECTURE_AGENT from "../session/prompt/architecture-agent.txt"
import PROMPT_TECHSTACK_AGENT from "../session/prompt/techstack-agent.txt"
```

---

## How the UI Calls Each Agent

Each phase tab calls `sdk.client.session.promptAsync()` with the agent name:

```typescript
// Requirements tab
sdk.client.session.promptAsync({
  sessionID,
  agent: "requirements_agent",
  parts: [{ type: "text", text: REQUIREMENTS_EXTRACTION_PROMPT }],
})

// Architecture tab
sdk.client.session.promptAsync({
  sessionID,
  agent: "architecture_agent",
  parts: [{ type: "text", text: "Analyze the codebase and generate the architecture graph." }],
})

// Tech tab
sdk.client.session.promptAsync({
  sessionID,
  agent: "techstack_agent",
  parts: [{ type: "text", text: "Analyze the codebase and generate the tech stack breakdown." }],
})
```

The UI then watches the SSE event stream for `message.part.delta` events on the session, detects when the agent's confirmation message arrives (triggering `messageVersion` increment), and re-fetches the output file via `sdk.client.file.read()`.

---

## Artifact Dependency Chain

```
session conversation
        ↓
requirements_agent → .intent/requirements.md
        ↓
architecture_agent → .intent/architecture.json  (reads requirements.md for context)
        ↓
techstack_agent → .intent/tech.json  (reads architecture.json for fit scoring)
        ↓
build_agent (existing) — reads all three
```

Each agent can be re-run independently at any time. Re-running architecture_agent with updated requirements overwrites `.intent/architecture.json` and implicitly invalidates `.intent/tech.json` (stale marker shown in UI).
