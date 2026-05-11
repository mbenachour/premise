<p align="center">
  <img src="packages/desktop-electron/premise-icon.png" alt="Premise" width="120" />
</p>

<h1 align="center">Premise</h1>

<p align="center">An AI coding environment built for structured software development.</p>

<p align="center">Built on <a href="https://github.com/anomalyco/opencode">opencode</a>.</p>

---

Premise is a fork of [opencode](https://github.com/anomalyco/opencode) that adds structured product thinking to the AI coding workflow. Before writing code, Premise helps you define what you're building, architect how it fits together, and track what has changed.

## What Premise Adds

### Requirements Tab

Generate a structured app summary and requirements document from your session conversation. Each requirement moves through a lifecycle: **uncommitted → committed → planned → implemented**.

Writes to disk:
- `.premise/summary.md` — high-level app summary (2–3 sentences)
- `.premise/requirements.md` — full structured requirements document

### Architecture Tab

Generate and explore AI-produced architecture diagrams directly in the app. Diagrams are interactive (built on React Flow) and support three views: component, deployment, and composite structure.

Writes to disk:
- `.premise/architecture.json` — component graph
- `.premise/architecture-deployment.json` — deployment graph
- `.premise/architecture-composite.json` — composite graph

### History Tab

Browse the full history of prompt executions in your session — see which files changed for each prompt with addition/deletion stats.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) 1.3.13+
- [Node.js](https://nodejs.org) 22+ (for Electron)
- macOS, Linux, or Windows

### Install dependencies

```bash
bun install
```

### Run the desktop app

```bash
bun run dev:desktop
```

### Build

```bash
bun --cwd packages/desktop-electron build
bun --cwd packages/desktop-electron package:mac
```

## The `.premise/` Directory

Premise writes all generated artifacts to `.premise/` at the root of your project. These files are designed to be committed alongside your code.

```
.premise/
  summary.md                  # Short description of the project
  requirements.md             # Structured requirements with lifecycle status
  architecture.json           # Architecture graph data
  plans/
    <requirement-id>.md       # Detailed implementation plans per requirement
```

## Built-in Agents

| Agent | Purpose |
|---|---|
| `requirements` | Reads the session and produces `summary.md` + `requirements.md` |
| `requirement-plan` | Maps committed requirements to implementation plans |
| `architecture` | Analyses the codebase and produces the architecture graph |

## Contributing

For upstream fixes and provider additions, contribute to [opencode](https://github.com/anomalyco/opencode). For Premise-specific changes, open a PR in this repo.
