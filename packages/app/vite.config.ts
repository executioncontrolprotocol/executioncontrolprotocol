import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))
const appOrigin = process.env.ECP_APP_ORIGIN ?? "http://127.0.0.1:8787"
const proxy = {
  "/api": { target: appOrigin, ws: true, changeOrigin: true },
  "/v1": { target: appOrigin, changeOrigin: true },
}

export default defineConfig({
  root,
  plugins: [react()],
  build: {
    outDir: "dist/web",
    emptyOutDir: false,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy,
  },
  preview: {
    host: "127.0.0.1",
    proxy,
  },
  resolve: {
    alias: {
      "@executioncontrolprotocol/core/types": path.resolve(root, "../core/src/types/index.ts"),
      "@executioncontrolprotocol/core": path.resolve(root, "../core/src/index.ts"),
    },
  },
})
