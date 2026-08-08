import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import type { Plugin } from "vite"

/**
 * Redirect harness / core prompt loaders to browser-safe modules.
 * Vite `resolve.alias` on absolute paths does not match relative `./load-*.js` imports in dev.
 *
 * - `load-harness-prompt` lives next to each harness (`browser-nano` / `browser-coding`)
 * - `load-schema-example` remains under core `harness/prompts`
 */
export function browserPromptLoaderPlugin(options: {
  corePromptsDir: string
  stubDir: string
}): Plugin {
  const { corePromptsDir, stubDir } = options

  function resolveBesideImporter(importer: string | undefined, base: string): string | undefined {
    if (!importer) return undefined
    const dir = dirname(importer.split("?")[0]!)
    const jsPath = join(dir, `${base}.browser.js`)
    if (existsSync(jsPath)) return jsPath
    const tsPath = join(dir, `${base}.browser.ts`)
    if (existsSync(tsPath)) return tsPath
    return undefined
  }

  function resolveInDir(dir: string, base: string): string {
    const jsPath = join(dir, `${base}.browser.js`)
    if (existsSync(jsPath)) return jsPath
    return join(dir, `${base}.browser.ts`)
  }

  function resolveFromAbsoluteLoader(source: string, base: string): string | undefined {
    const normalized = source.replace(/\\/g, "/")
    const suffixJs = `/${base}.js`
    const suffixTs = `/${base}.ts`
    if (!normalized.endsWith(suffixJs) && !normalized.endsWith(suffixTs)) return undefined
    return resolveInDir(dirname(source.split("?")[0]!), base)
  }

  function isPromptLoaderId(source: string): boolean {
    return (
      source === "./load-harness-prompt.js" ||
      source === "./load-harness-prompt.ts" ||
      source.endsWith("/load-harness-prompt.js") ||
      source.endsWith("/load-harness-prompt.ts")
    )
  }

  function isSchemaLoaderId(source: string): boolean {
    return (
      source === "./load-schema-example.js" ||
      source === "./load-schema-example.ts" ||
      source.endsWith("/load-schema-example.js") ||
      source.endsWith("/load-schema-example.ts")
    )
  }

  function isPromptNodeId(source: string): boolean {
    return source.includes("load-harness-prompt.node")
  }

  function isSchemaNodeId(source: string): boolean {
    return source.includes("load-schema-example.node")
  }

  return {
    name: "browser-prompt-loader",
    enforce: "pre",
    resolveId(source, importer) {
      if (isPromptLoaderId(source)) {
        return (
          resolveBesideImporter(importer, "load-harness-prompt") ??
          resolveFromAbsoluteLoader(source, "load-harness-prompt")
        )
      }
      if (isSchemaLoaderId(source)) {
        return (
          resolveBesideImporter(importer, "load-schema-example") ??
          resolveFromAbsoluteLoader(source, "load-schema-example") ??
          resolveInDir(corePromptsDir, "load-schema-example")
        )
      }
      if (isPromptNodeId(source)) {
        return join(stubDir, "load-harness-prompt-node-stub.ts")
      }
      if (isSchemaNodeId(source)) {
        return join(stubDir, "load-schema-example-node-stub.ts")
      }
      return undefined
    },
  }
}
