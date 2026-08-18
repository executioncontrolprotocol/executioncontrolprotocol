import { prepareBrowserWorkflowSource } from "./prepare-browser-source.js"

/** Global key for esbuild-wasm init state (survives Vite HMR module reload). */
const ESBUILD_WASM_INIT_KEY = "__ecpEsbuildWasmInit"

/** Optional browser override for esbuild.wasm URL (e.g. Vite `?url` import). */
export const ESBUILD_WASM_URL_KEY = "__ecpEsbuildWasmUrl"

/** Preferred ESM entry — Vite's CJS interop for `lib/browser.js` yields an empty module. */
const ESBUILD_WASM_ESM_BROWSER = "esbuild-wasm/esm/browser.js"

/** Minimal esbuild-wasm API used by browser compile. */
interface EsbuildWasmApi {
  /** Package version string when present. */
  version?: string
  /** Load the wasm binary (must be awaited before transform). */
  initialize: (options: { wasmURL: string | URL }) => Promise<void>
  /** Transpile a single in-memory source string. */
  transform: (
    input: string,
    options: { loader: "ts" | "tsx"; format: "esm"; target: string }
  ) => Promise<{ code: string }>
}

/** Whether filename indicates TypeScript. */
export function isTypeScriptFile(filename: string): boolean {
  return /\.tsx?$/i.test(filename)
}

/** Unpkg URL for esbuild.wasm matching a published esbuild-wasm version. */
export function unpkgEsbuildWasmUrl(version: string): string {
  return `https://unpkg.com/esbuild-wasm@${version}/esbuild.wasm`
}

/** Resolve wasm URL: app override, else unpkg at the installed host version. */
export function resolveEsbuildWasmInitializeUrl(esbuild: EsbuildWasmApi): string {
  const globalRecord = globalThis as typeof globalThis & {
    [ESBUILD_WASM_URL_KEY]?: string
  }
  if (globalRecord[ESBUILD_WASM_URL_KEY]) {
    return globalRecord[ESBUILD_WASM_URL_KEY]
  }
  const version = esbuild.version || "0.25.12"
  return unpkgEsbuildWasmUrl(version)
}

interface EsbuildWasmGlobalState {
  /** In-flight or settled init promise shared across callers and HMR reloads. */
  initPromise: Promise<EsbuildWasmApi> | null
}

function getEsbuildGlobalState(): EsbuildWasmGlobalState {
  const globalRecord = globalThis as typeof globalThis & {
    [ESBUILD_WASM_INIT_KEY]?: EsbuildWasmGlobalState
  }
  if (!globalRecord[ESBUILD_WASM_INIT_KEY]) {
    globalRecord[ESBUILD_WASM_INIT_KEY] = { initPromise: null }
  }
  return globalRecord[ESBUILD_WASM_INIT_KEY]
}

/**
 * Whether an error indicates esbuild-wasm was already initialized in this VM.
 * Must not match missing-API errors such as `initialize is not a function`.
 */
export function isEsbuildAlreadyInitializedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  if (/is not a function/i.test(message)) return false
  return /initialize can only be called once|already been initialized|already initialized/i.test(
    message
  )
}

/** Pick initialize/transform from a module namespace or its default export. */
export function resolveEsbuildWasmApi(mod: unknown): EsbuildWasmApi {
  const record = mod as Record<string, unknown> | null
  const candidates: unknown[] = [record, record?.default]
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue
    const api = candidate as Partial<EsbuildWasmApi>
    if (typeof api.initialize === "function" && typeof api.transform === "function") {
      return api as EsbuildWasmApi
    }
  }
  throw new Error(
    "esbuild-wasm module loaded without initialize/transform APIs (use the ESM browser build)"
  )
}

async function loadEsbuildWasmModule(): Promise<EsbuildWasmApi> {
  try {
    return resolveEsbuildWasmApi(await import("esbuild-wasm"))
  } catch {
    try {
      // Vite CJS interop for lib/browser.js can yield `{}`; the ESM build is reliable.
      return resolveEsbuildWasmApi(await import(/* @vite-ignore */ ESBUILD_WASM_ESM_BROWSER))
    } catch {
      throw new Error(
        "esbuild-wasm is required to compile TypeScript workflow sources in the browser. " +
          "Run: npm install esbuild-wasm"
      )
    }
  }
}

async function ensureEsbuildWasm(): Promise<EsbuildWasmApi> {
  const state = getEsbuildGlobalState()
  if (!state.initPromise) {
    state.initPromise = (async () => {
      const esbuild = await loadEsbuildWasmModule()
      const wasmURL = resolveEsbuildWasmInitializeUrl(esbuild)
      try {
        await esbuild.initialize({
          wasmURL,
        })
      } catch (err) {
        if (!isEsbuildAlreadyInitializedError(err)) {
          state.initPromise = null
          throw err
        }
      }
      return esbuild
    })()
  }
  return state.initPromise
}

/**
 * Pre-initialize esbuild-wasm for browser workflow compile (idempotent).
 * No-op outside a browser (e.g. Vitest in Node).
 * @category Compile
 */
export async function warmBrowserWorkflowCompile(): Promise<void> {
  if (typeof window === "undefined") return
  await ensureEsbuildWasm()
}

/** Transpile TS to ESM using esbuild-wasm. */
export async function transpileWorkflowSource(
  source: string,
  filename: string
): Promise<string> {
  if (!isTypeScriptFile(filename)) return source

  const esbuild = await ensureEsbuildWasm()
  const result = await esbuild.transform(source, {
    loader: filename.endsWith(".tsx") ? "tsx" : "ts",
    format: "esm",
    target: "es2022",
  })
  return result.code
}

/** Browser compile path: prepare globals shim then transpile. */
export async function bundleWorkflowSource(
  source: string,
  filename: string,
  _resolveDir: string,
  resolveImports?: "browser-global"
): Promise<string> {
  const prepared =
    resolveImports === "browser-global" ? prepareBrowserWorkflowSource(source) : source
  return transpileWorkflowSource(prepared, filename)
}
