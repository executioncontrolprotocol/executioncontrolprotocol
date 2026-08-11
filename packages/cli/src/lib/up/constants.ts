import { createRequire } from "node:module"

/** Default loopback port for `ecp up` (ECP leet: E=3, C=0, P=9). @category CLI */
export const DEFAULT_ECP_UP_PORT = 3090

/** Default bind host (loopback only). @category CLI */
export const DEFAULT_ECP_UP_HOST = "127.0.0.1"

/** Default Ollama HTTP API base URL. @category CLI */
export const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"

/** Default browser demo URL opened by `ecp up`. @category CLI */
export const DEFAULT_DEMO_OPEN_URL = "https://executioncontrolprotocol.github.io/browser-demo/"

/** Built-in CORS origins for local Vite + hosted demo. @category CLI */
export const DEFAULT_CORS_ORIGINS: readonly string[] = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://executioncontrolprotocol.github.io",
]

/** JSON MIME type for daemon responses. @category CLI */
export const JSON_MIME = "application/json"

const require = createRequire(import.meta.url)

/** Daemon package version string for /health (from `@executioncontrolprotocol/cli` package.json). @category CLI */
export const ECP_UP_VERSION = (require("../../../package.json") as { version: string }).version
