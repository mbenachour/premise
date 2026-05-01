import { readFileSync } from "node:fs"
import solidPlugin from "vite-plugin-solid"
import reactPlugin from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "url"

// React files use .react.tsx extension to avoid conflict with vite-plugin-solid
const REACT_FILE_RE = /\.react\.[jt]sx?$/

const theme = fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))

/**
 * @type {import("vite").PluginOption}
 */
export default [
  {
    name: "opencode-desktop:config",
    config() {
      return {
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
          },
        },
        worker: {
          format: "es",
        },
      }
    },
  },
  {
    name: "opencode-desktop:theme-preload",
    transformIndexHtml(html) {
      return html.replace(
        '<script id="oc-theme-preload-script" src="/oc-theme-preload.js"></script>',
        `<script id="oc-theme-preload-script">${readFileSync(theme, "utf8")}</script>`,
      )
    },
  },
  reactPlugin({ include: REACT_FILE_RE }),
  tailwindcss(),
  (() => {
    const solid = solidPlugin()
    return {
      ...solid,
      transform(code, id, opts) {
        if (REACT_FILE_RE.test(id)) return null
        return solid.transform?.call(this, code, id, opts)
      },
    }
  })(),
]
