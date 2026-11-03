import { isBuiltin } from "node:module"
import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { Plugin } from "esbuild"

/** Whether filename indicates TypeScript. */
export function isTypeScriptFile(filename: string): boolean {
  return /\.tsx?$/i.test(filename)
}

/**
 * Directory used for esbuild package resolution.
 * Absolute filenames resolve from their parent directory; relative paths walk up
 * to the nearest `node_modules` ancestor (consumer project layout).
 * Bare filenames use `process.cwd()` with the same walk-up.
 * @category Compile
 */
export function resolveBundleDir(filename: string): string {
  const cwd =
    typeof process !== "undefined" && typeof process.cwd === "function"
      ? process.cwd()
      : "."
  const startDir = isAbsolute(filename)
    ? dirname(filename)
    : resolve(cwd, dirname(filename) || ".")

  let dir = startDir
  while (true) {
    if (existsSync(join(dir, "node_modules"))) return dir
    const parent = dirname(dir)
    if (parent === dir) return startDir
    dir = parent
  }
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

/** Bare imports a workflow file may resolve (CLI/host copy). @category Compile */
const WORKFLOW_ALLOWED_BARE_IMPORTS = new Set([
  "@executioncontrolprotocol/core",
  "@executioncontrolprotocol/core/types",
])

/** Specifiers that fall back to the Node host / CLI install of core. @category Compile */
const CORE_FALLBACK_SPECIFIERS = new Set([
  "@executioncontrolprotocol/core",
  "@executioncontrolprotocol/core/types",
])

/**
 * Walk ancestors from this module for `node_modules/@executioncontrolprotocol/core`.
 * Avoids `createRequire`, which fails on packages that only declare ESM `exports`.
 */
function findHostCoreRoot(fromUrl: string = import.meta.url): string | undefined {
  let dir = dirname(fileURLToPath(fromUrl))
  while (true) {
    const candidate = join(dir, "node_modules", "@executioncontrolprotocol", "core")
    if (existsSync(join(candidate, "package.json"))) return candidate
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * Resolve a package from this Node host (and thus a global CLI) when the
 * project has no local copy.
 * @category Compile
 */
export function resolveCoreFromHost(specifier: string): string | undefined {
  const root = findHostCoreRoot()
  if (!root) return undefined
  if (specifier === "@executioncontrolprotocol/core") {
    const entry = join(root, "dist", "index.js")
    return existsSync(entry) ? entry : undefined
  }
  if (specifier === "@executioncontrolprotocol/core/types") {
    const entry = join(root, "dist", "types", "index.js")
    return existsSync(entry) ? entry : undefined
  }
  return undefined
}

function packageRootFromResolved(resolvedPath: string): string | undefined {
  let dir = dirname(resolvedPath)
  while (true) {
    const pkg = join(dir, "package.json")
    if (existsSync(pkg)) {
      try {
        const parsed = JSON.parse(readFileSync(pkg, "utf8")) as { name?: string }
        if (parsed.name === "@executioncontrolprotocol/core") return dir
      } catch {
        /* keep walking */
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

function packageMajor(root: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version?: string
    }
    const version = parsed.version
    if (!version) return undefined
    return version.split(".")[0]
  } catch {
    return undefined
  }
}

let warnedCoreMajorMismatch = false

/**
 * When a local core and the host core differ in major version, warn once.
 * The local copy still wins.
 * @category Compile
 */
export function warnIfCoreMajorMismatch(localPath: string, hostPath: string): void {
  if (warnedCoreMajorMismatch) return
  const localRoot = packageRootFromResolved(localPath)
  const hostRoot = packageRootFromResolved(hostPath)
  if (!localRoot || !hostRoot) return
  if (resolve(localRoot) === resolve(hostRoot)) return
  const localMajor = packageMajor(localRoot)
  const hostMajor = packageMajor(hostRoot)
  if (!localMajor || !hostMajor || localMajor === hostMajor) return
  warnedCoreMajorMismatch = true
  process.stderr.write(
    `Warning: local @executioncontrolprotocol/core major ${localMajor} differs from the CLI copy (major ${hostMajor}). Using the local copy.\n`
  )
}

/** Reset the one-shot core major warning (tests). @category Compile */
export function resetCoreMajorMismatchWarning(): void {
  warnedCoreMajorMismatch = false
}

/**
 * Mark npm packages external with absolute `file:` URLs so a temp-dir `import()`
 * still resolves the consumer's `node_modules` (linked packages and CJS SDKs).
 * Uses esbuild's own resolver (respects ESM package `exports`).
 * Workflow files may only import `@executioncontrolprotocol/core` and relative files.
 * When the project has no `core`, falls back to the Node host / CLI install.
 */
function createAbsoluteExternalsPlugin(
  resolveDir: string,
  mode: "environment" | "workflow" = "environment"
): Plugin {
  return {
    name: "ecp-absolute-externals",
    setup(build) {
      build.onResolve({ filter: /^[^./]/ }, async (args) => {
        if (args.pluginData?.ecpAbsoluteExternal) return undefined

        if (args.path.startsWith("node:") || isBuiltin(args.path)) {
          if (mode === "workflow") {
            return {
              errors: [
                {
                  text: `ECP_WORKFLOW_LOAD: workflow files may only import @executioncontrolprotocol/core and relative files. Found "${args.path}".`,
                },
              ],
            }
          }
          return { path: args.path, external: true }
        }
        if (/^[A-Za-z]:/.test(args.path)) {
          return { path: args.path, external: true }
        }
        if (mode === "workflow" && !WORKFLOW_ALLOWED_BARE_IMPORTS.has(args.path)) {
          return {
            errors: [
              {
                text: `ECP_WORKFLOW_LOAD: workflow files may only import @executioncontrolprotocol/core and relative files. Found "${args.path}".`,
              },
            ],
          }
        }

        const result = await build.resolve(args.path, {
          kind: args.kind,
          resolveDir: args.resolveDir || resolveDir,
          importer: args.importer,
          namespace: args.namespace,
          pluginData: { ...args.pluginData, ecpAbsoluteExternal: true },
        })
        if (result.errors.length === 0 && result.path) {
          if (CORE_FALLBACK_SPECIFIERS.has(args.path)) {
            const hostPath = resolveCoreFromHost(args.path)
            if (hostPath) warnIfCoreMajorMismatch(result.path, hostPath)
          }
          return {
            path: pathToFileURL(result.path).href,
            external: true,
          }
        }

        if (CORE_FALLBACK_SPECIFIERS.has(args.path)) {
          const hostPath = resolveCoreFromHost(args.path)
          if (hostPath) {
            return {
              path: pathToFileURL(hostPath).href,
              external: true,
            }
          }
        }

        return {
          errors: [
            {
              text: `Could not resolve "${args.path}" from ${args.resolveDir || resolveDir}`,
            },
          ],
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

async function bundleModuleSource(
  source: string,
  filename: string,
  resolveDir: string,
  mode: "environment" | "workflow"
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
    plugins: [createAbsoluteExternalsPlugin(resolveDir, mode)],
  })
  const file = result.outputFiles?.[0]
  if (!file) throw new Error("esbuild produced no output")
  return file.text
}

/**
 * Bundle workflow module with dependencies (Node host).
 * Resolves `@executioncontrolprotocol/*` and other imports from {@link resolveDir}
 * via normal `node_modules` lookup (no monorepo path aliases).
 * When `@executioncontrolprotocol/core` is missing from the project, falls back to
 * the Node host / CLI install.
 * npm packages are left external as absolute paths so CJS SDKs (dynamic `require`)
 * load under Node instead of being inlined into ESM.
 */
export async function bundleWorkflowSource(
  source: string,
  filename: string,
  resolveDir: string
): Promise<string> {
  return bundleModuleSource(source, filename, resolveDir, "workflow")
}

/**
 * Bundle an environment module for Node, keeping `node_modules` as runtime imports.
 * Native packages (e.g. `sharp`) cannot be inlined; they resolve to absolute `file:` URLs.
 * `@executioncontrolprotocol/core` falls back to the host / CLI copy when absent locally.
 * @category Compile
 */
export async function bundleEnvironmentSource(
  source: string,
  filename: string,
  resolveDir: string
): Promise<string> {
  return bundleModuleSource(source, filename, resolveDir, "environment")
}
