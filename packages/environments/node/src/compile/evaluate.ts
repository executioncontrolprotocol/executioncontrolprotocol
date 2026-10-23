import type { WorkflowManifest } from "@executioncontrolprotocol/core/types"
import { extractWorkflowFromModule } from "@executioncontrolprotocol/core"

export { extractWorkflowFromModule }

/** Evaluate ESM workflow module code (Node host: temp file + dynamic import). */
export async function evaluateWorkflowModule(
  code: string,
  _filename = "workflow.js"
): Promise<WorkflowManifest> {
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { pathToFileURL } = await import("node:url")

  const dir = await mkdtemp(join(tmpdir(), "ecp-compile-"))
  const file = join(dir, "workflow.mjs")
  try {
    await writeFile(file, code, "utf8")
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>
    return extractWorkflowFromModule(mod)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
