import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { Environment, EnvironmentBinding, LoadedWorkflow } from "@executioncontrolprotocol/core"
import {
  extractLoadedWorkflowFromModule,
  inferRequirementsFromManifest,
  isConfigBuilder,
} from "@executioncontrolprotocol/core"
import { ECP_WORKFLOW_LOAD, EcpError } from "@executioncontrolprotocol/core/types"
import type { WorkflowManifest } from "@executioncontrolprotocol/core/types"
import { bundleWorkflowSource, bundleEnvironmentSource } from "../compile/transpile.js"

/** Read file as utf-8. */
export async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf8")
}

/** Load JSON workflow manifest from disk. */
export async function loadWorkflowJson(path: string): Promise<WorkflowManifest> {
  const text = await readTextFile(path)
  return JSON.parse(text) as WorkflowManifest
}

/**
 * Load a workflow file: `{ manifest, requirements, builder? }`.
 * `.json` manifests have no builder; TypeScript/JavaScript must default-export a WorkflowBuilder.
 */
export async function loadWorkflowFile(path: string): Promise<LoadedWorkflow> {
  if (path.endsWith(".json")) {
    const manifest = await loadWorkflowJson(path)
    return {
      manifest,
      requirements: inferRequirementsFromManifest(manifest.steps),
    }
  }
  const abs = resolve(path)
  const source = await readTextFile(abs)
  const dir = await mkdtemp(join(tmpdir(), "ecp-wf-"))
  const file = join(dir, "module.mjs")
  try {
    const code = await bundleWorkflowSource(source, abs, dirname(abs))
    await writeFile(file, code, "utf8")
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>
    const loaded = extractLoadedWorkflowFromModule(mod)
    if (!loaded.builder) {
      throw new EcpError(
        ECP_WORKFLOW_LOAD,
        "Workflow files must default-export a WorkflowBuilder (workflow(...)). Raw JSON manifests use the .json extension."
      )
    }
    return loaded
  } catch (err) {
    if (err instanceof EcpError) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new EcpError(ECP_WORKFLOW_LOAD, message, { cause: err })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function loadBundledModule<T extends Record<string, unknown>>(
  source: string,
  filename: string,
  resolveDir?: string
): Promise<T> {
  const abs = resolve(filename)
  const code = await bundleEnvironmentSource(source, abs, resolveDir ?? dirname(abs))
  // Absolute file: externals let this temp module load from os.tmpdir()
  // while native deps (sharp) and linked packages stay as runtime imports.
  const dir = await mkdtemp(join(tmpdir(), "ecp-bundle-"))
  const file = join(dir, "module.mjs")
  try {
    await writeFile(file, code, "utf8")
    return (await import(pathToFileURL(file).href)) as T
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Load environment module default export. */
export async function loadEnvironmentModule(path: string): Promise<Environment> {
  const abs = resolve(path)
  const source = await readFile(abs, "utf8")
  const mod = await loadBundledModule<Record<string, unknown>>(source, abs)
  const exp = mod.default ?? mod.environment
  if (!exp) throw new Error(`Environment module must export default or 'environment'`)
  const raw =
    typeof exp === "function"
      ? (exp as () => Environment | Promise<Environment>)()
      : (exp as Environment | Promise<Environment>)
  const value = await Promise.resolve(raw)
  if (!value || typeof value.init !== "function") {
    throw new Error("Environment export must be an Environment instance")
  }
  return value
}

function isEnvironmentExport(value: unknown): value is Environment {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Environment).init === "function" &&
    typeof (value as Environment).getBindings === "function"
  )
}

/**
 * Load a `config.ecp.ts` module and return its bindings.
 * Accepts `config()` or, undocumented, a legacy `environment()` default export
 * (bindings only; the host id is ignored). Protocol imports resolve from
 * `process.cwd()` so a file in `~/.ecp/config` still sees project packages.
 *
 * @category Config
 */
export async function loadConfigModule(path: string): Promise<EnvironmentBinding[]> {
  const abs = resolve(path)
  const source = await readFile(abs, "utf8")
  // Resolve protocol imports from the process cwd (project), not ~/.ecp/config.
  const mod = await loadBundledModule<Record<string, unknown>>(source, abs, process.cwd())
  const exp = mod.default ?? mod.config
  if (!exp) {
    throw new Error("Config file must default-export config() (or a legacy environment())")
  }
  const raw =
    typeof exp === "function" ? (exp as () => unknown)() : exp
  const value = await Promise.resolve(raw)
  if (isConfigBuilder(value)) return value.getBindings()
  if (isEnvironmentExport(value)) return value.getBindings()
  throw new Error(
    "Config file must default-export config().with([...]); it is not an environment and cannot init()"
  )
}

/** Load workflow module and return the loaded file. */
export async function loadWorkflowModule(path: string): Promise<LoadedWorkflow> {
  return loadWorkflowFile(path)
}
