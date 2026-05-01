import { onCleanup, onMount } from "solid-js"
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { ArchitectureCanvas } from "./architecture-canvas.react"

export function ArchitectureTab() {
  let containerRef!: HTMLDivElement

  onMount(() => {
    const root = createRoot(containerRef)
    root.render(createElement(ArchitectureCanvas))
    onCleanup(() => root.unmount())
  })

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
}
