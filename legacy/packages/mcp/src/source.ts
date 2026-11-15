import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { LoadedWorkflow } from "@executioncontrolprotocol/core"
import { ECP_INPUT_INVALID, EcpError } from "@executioncontrolprotocol/core/types"
import { loadWorkflowFile, readTextFile } from "@executioncontrolprotocol/node"

/**
 * Workflow loaded from a path or inlined Fluent source.
 * @category MCP
 */
export interface LoadedWorkflowSource {
  /** Compiled workflow plus requirements. */
  loaded: LoadedWorkflow
  /** Path passed to the loader (temp file when `source` was inlined). */
  workflowPath: string
  /** Original file or inlined text. */
  sourceText: string
  /** Remove the temp directory when the caller inlined source. */
  cleanup: () => Promise<void>
}

async function noopCleanup(): Promise<void> {
  /* path-based loads have nothing to delete */
}

/**
 * Load a workflow from `path` or write `source` to a temp `*.ecp.ts` and load it.
 * @category MCP
 */
export async function loadWorkflowPathOrSource(options: {
  path?: string
  source?: string
}): Promise<LoadedWorkflowSource> {
  const path = options.path?.trim()
  const source = options.source
  if (path && source) {
    throw new EcpError(
      ECP_INPUT_INVALID,
      "Provide path or source, not both",
      { suggestions: ["Pass only path", "Pass only source"] }
    )
  }
  if (!path && (source === undefined || source === "")) {
    throw new EcpError(
      ECP_INPUT_INVALID,
      "Provide a workflow file path or Fluent source",
      { suggestions: ["Set path to a *.ecp.ts file", "Set source to Fluent TypeScript"] }
    )
  }
  if (path) {
    const sourceText = await readTextFile(path)
    const loaded = await loadWorkflowFile(path)
    return { loaded, workflowPath: path, sourceText, cleanup: noopCleanup }
  }

  // Write under the process cwd so esbuild can walk up to the project's node_modules.
  const root = join(process.cwd(), ".ecp")
  await mkdir(root, { recursive: true })
  const dir = await mkdtemp(join(root, "mcp-"))
  const workflowPath = join(dir, "workflow.ecp.ts")
  const sourceText = source as string
  await writeFile(workflowPath, sourceText, "utf8")
  try {
    const loaded = await loadWorkflowFile(workflowPath)
    return {
      loaded,
      workflowPath,
      sourceText,
      cleanup: async () => {
        await rm(dir, { recursive: true, force: true })
      },
    }
  } catch (err) {
    await rm(dir, { recursive: true, force: true })
    throw err
  }
}
