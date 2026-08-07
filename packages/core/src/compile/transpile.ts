/** Whether filename indicates TypeScript. */
export function isTypeScriptFile(filename: string): boolean {
  return /\.tsx?$/i.test(filename)
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

/**
 * Bundle workflow module with dependencies (Node host).
 * Resolves `@executioncontrolprotocol/core` and extension imports.
 */
export async function bundleWorkflowSource(
  source: string,
  filename: string,
  resolveDir: string
): Promise<string> {
  const { dirname, join } = await import("node:path")
  const { fileURLToPath } = await import("node:url")
  const esbuild = await loadEsbuild()
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..")
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
    packages: "bundle",
    alias: {
      "@executioncontrolprotocol/core/compile": join(repoRoot, "packages/core/dist/compile/entry.js"),
      "@executioncontrolprotocol/core/loaders": join(repoRoot, "packages/core/dist/loaders/index.js"),
      "@executioncontrolprotocol/core/browser": join(repoRoot, "packages/core/dist/browser.js"),
      "@executioncontrolprotocol/core": join(repoRoot, "packages/core/dist/index.js"),
      "@executioncontrolprotocol/core/testing": join(repoRoot, "packages/core/dist/testing/index.js"),
      "@executioncontrolprotocol/node": join(repoRoot, "packages/runtimes/node/dist/index.js"),
      "@executioncontrolprotocol/browser": join(repoRoot, "packages/runtimes/browser/dist/index.js"),
      "@executioncontrolprotocol/types": join(repoRoot, "packages/types/dist/index.js"),
      "@executioncontrolprotocol/policies": join(repoRoot, "packages/policies/dist/index.js"),
      "@executioncontrolprotocol/format-toon": join(repoRoot, "packages/extensions/format-toon/dist/index.js"),
      "@executioncontrolprotocol/secrets": join(repoRoot, "packages/extensions/secrets/dist/index.js"),
      "@executioncontrolprotocol/browser-secrets": join(repoRoot, "packages/extensions/browser-secrets/dist/index.js"),
      "@executioncontrolprotocol/process-env": join(repoRoot, "packages/extensions/process-env/dist/index.js"),
    },
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
