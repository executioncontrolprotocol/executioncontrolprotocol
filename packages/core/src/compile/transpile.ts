import { dirname, isAbsolute } from "node:path"

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

type BundlePackagesMode = "bundle" | "external"

async function bundleModuleSource(
  source: string,
  filename: string,
  resolveDir: string,
  packages: BundlePackagesMode
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
    packages,
    external: ["@napi-rs/keyring"],
    plugins: [
      {
        name: "ecp-keyring-external",
        setup(build) {
          build.onResolve({ filter: /^@napi-rs\/keyring/ }, (args) => ({
            path: args.path,
            external: true,
          }))
        },
      },
    ],
  })
  const file = result.outputFiles?.[0]
  if (!file) throw new Error("esbuild produced no output")
  return file.text
}

/**
 * Bundle workflow module with dependencies (Node host).
 * Resolves `@executioncontrolprotocol/*` and other imports from {@link resolveDir}
 * via normal `node_modules` lookup (no monorepo path aliases).
 */
export async function bundleWorkflowSource(
  source: string,
  filename: string,
  resolveDir: string
): Promise<string> {
  return bundleModuleSource(source, filename, resolveDir, "bundle")
}

/**
 * Bundle an environment module for Node, keeping `node_modules` as runtime imports.
 * Native packages (e.g. `sharp`) cannot be inlined; environments must load them live.
 * @category Compile
 */
export async function bundleEnvironmentSource(
  source: string,
  filename: string,
  resolveDir: string
): Promise<string> {
  return bundleModuleSource(source, filename, resolveDir, "external")
}
