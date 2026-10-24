import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root,
  plugins: [react()],
  build: {
    outDir: "dist/web",
    emptyOutDir: false,
  },
  resolve: {
    alias: {
      "@executioncontrolprotocol/core/types": path.resolve(root, "../core/src/types/index.ts"),
      "@executioncontrolprotocol/core": path.resolve(root, "../core/src/index.ts"),
    },
  },
})
