import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const root = path.dirname(fileURLToPath(import.meta.url))
// The host port is random per supervisor; read it from `~/.ecp/host.json` when developing.
const hostOrigin = process.env.ECP_HOST_ORIGIN

export default defineConfig({
  root,
  base: "/app/",
  plugins: [react()],
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    ...(hostOrigin ? { proxy: { "/v1": { target: hostOrigin, changeOrigin: true } } } : {}),
  },
})
