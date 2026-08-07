import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { WorkflowManifest } from "@executioncontrolprotocol/types"
import type { Environment } from "../environment/environment.js"
import { compileWorkflowSource } from "../compile/index.js"
import { bundleWorkflowSource } from "../compile/transpile.js"

/** Read file as utf-8. */
export async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf8")
}

/** Load JSON workflow manifest from disk. */
export async function loadWorkflowJson(path: string): Promise<WorkflowManifest> {
  const text = await readTextFile(path)
  return JSON.parse(text) as WorkflowManifest
}

/** Load workflow from .json, .ts, or .js path. */
export async function loadWorkflowFile(path: string): Promise<WorkflowManifest> {
  if (path.endsWith(".json")) return loadWorkflowJson(path)
  const abs = resolve(path)
  const source = await readTextFile(abs)
  const result = await compileWorkflowSource({ source, filename: abs })
  if (!result.ok || !result.manifest) {
    throw new Error(
      result.compileErrors?.[0]?.message ??
        result.validation?.errors[0]?.message ??
        "Failed to compile workflow"
    )
  }
  return result.manifest
}

async function loadBundledModule<T extends Record<string, unknown>>(
  source: string,
  filename: string
): Promise<T> {
  const abs = resolve(filename)
  const code = await bundleWorkflowSource(source, abs, dirname(abs))
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

/** Load workflow module and return manifest. */
export async function loadWorkflowModule(path: string): Promise<WorkflowManifest> {
  return loadWorkflowFile(path)
}
