import { isBuiltin } from "node:module"
import { dirname, isAbsolute } from "node:path"
import { pathToFileURL } from "node:url"
import type { Plugin } from "esbuild"

/** Whether filename indicates TypeScript. */
export function isTypeScriptFile(filename: string): boolean {
  return /\.tsx?$/i.test(filename)
}

/**
 * Directory used for esbuild package resolution.
 * Absolute filenames resolve from their parent directory (consumer project layout);
 * relative / in-memory names fall back to `process.cwd()`.
 * @category Compile
 */
export function resolveBundleDir(filename: string): string {
  if (isAbsolute(filename)) return dirname(filename)
  if (typeof process !== "undefined" && typeof process.cwd === "function") {
    return process.cwd()
  }
  return "."
}

async function loadEsbuild(): Promise<typeof import("esbuild")> {
  try {
    return await import("esbuild")
  } catch {
    throw new Error(
      "esbuild is required to compile TypeScript workflow sources. Run: npm install esbuild"
    )
  }
}

/**
 * Mark npm packages external with absolute `file:` URLs so a temp-dir `import()`
 * still resolves the consumer's `node_modules` (linked packages and CJS SDKs).
 * Uses esbuild's own resolver (respects ESM package `exports`).
 */
function createAbsoluteExternalsPlugin(resolveDir: string): Plugin {
  return {
    name: "ecp-absolute-externals",
    setup(build) {
      build.onResolve({ filter: /^[^./]/ }, async (args) => {
        if (args.pluginData?.ecpAbsoluteExternal) return undefined

        if (args.path.startsWith("node:") || isBuiltin(args.path)) {
          return { path: args.path, external: true }
        }
        if (/^[A-Za-z]:/.test(args.path)) {
          return { path: args.path, external: true }
        }

        const result = await build.resolve(args.path, {
          kind: args.kind,
          resolveDir: args.resolveDir || resolveDir,
          importer: args.importer,
          namespace: args.namespace,
          pluginData: { ...args.pluginData, ecpAbsoluteExternal: true },
        })
        if (result.errors.length > 0) {
          return {
            errors: [
              {
                text: `Could not resolve "${args.path}" from ${args.resolveDir || resolveDir}`,
              },
            ],
          }
        }
        if (!result.path) {
          return {
            errors: [
              {
                text: `Could not resolve "${args.path}" from ${args.resolveDir || resolveDir}`,
              },
            ],
          }
        }
        return {
          path: pathToFileURL(result.path).href,
          external: true,
        }
      })
    },
  }
}

/** Transpile TS to ESM using esbuild (Node host). */
export async function transpileWorkflowSource(
  source: string,
  filename: string
): Promise<string> {
  if (!isTypeScriptFile(filename)) return source

  const esbuild = await loadEsbuild()
  const result = await esbuild.transform(source, {
    loader: filename.endsWith(".tsx") ? "tsx" : "ts",
    format: "esm",
    target: "es2022",
  })
  return result.code
}

/**
 * Bundle workflow module with dependencies (Node host).
 * Resolves `@executioncontrolprotocol/*` and other imports from {@link resolveDir}
 * via normal `node_modules` lookup (no monorepo path aliases).
 * npm packages are left external as absolute paths so CJS SDKs (dynamic `require`)
 * load under Node instead of being inlined into ESM.
 */
export async function bundleWorkflowSource(
  source: string,
  filename: string,
  resolveDir: string
): Promise<string> {
  const esbuild = await loadEsbuild()
  const loader = filename.endsWith(".tsx")
    ? "tsx"
    : filename.endsWith(".ts")
      ? "ts"
      : "js"
  const result = await esbuild.build({
    stdin: {
      contents: source,
      loader,
      resolveDir,
      sourcefile: filename,
    },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    write: false,
    // Packages are externalized as absolute file: URLs by ecp-absolute-externals
    // (not packages:"external", which would leave bare names unusable from tmpdir).
    plugins: [createAbsoluteExternalsPlugin(resolveDir)],
  })
  const file = result.outputFiles?.[0]
  if (!file) throw new Error("esbuild produced no output")
  return file.text
}
