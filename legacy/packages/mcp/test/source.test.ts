import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ECP_INPUT_INVALID, isEcpError } from "@executioncontrolprotocol/core/types"
import { loadWorkflowPathOrSource } from "../src/source.js"
import { ECHO_SOURCE } from "./host.js"

describe("loadWorkflowPathOrSource", () => {
  it("loads inlined Fluent source through a temp *.ecp.ts", async () => {
    const loaded = await loadWorkflowPathOrSource({ source: ECHO_SOURCE })
    try {
      expect(loaded.workflowPath.endsWith(".ecp.ts")).toBe(true)
      expect(loaded.loaded.manifest.workflow.id).toMatch(/echo/i)
      expect(loaded.loaded.manifest.steps.length).toBeGreaterThan(0)
    } finally {
      await loaded.cleanup()
    }
  })

  it("loads a workflow file from path", async () => {
    const root = join(process.cwd(), ".ecp")
    await mkdir(root, { recursive: true })
    const dir = await mkdtemp(join(root, "mcp-path-"))
    const path = join(dir, "workflow.ecp.ts")
    await writeFile(path, ECHO_SOURCE, "utf8")
    const loaded = await loadWorkflowPathOrSource({ path })
    expect(loaded.workflowPath).toBe(path)
    expect(loaded.loaded.manifest.steps.length).toBeGreaterThan(0)
  })

  it("rejects both path and source", async () => {
    await expect(loadWorkflowPathOrSource({ path: "a.ecp.ts", source: ECHO_SOURCE })).rejects.toSatisfy(
      (err: unknown) => isEcpError(err) && err.code === ECP_INPUT_INVALID
    )
  })

  it("rejects neither path nor source", async () => {
    await expect(loadWorkflowPathOrSource({})).rejects.toSatisfy(
      (err: unknown) => isEcpError(err) && err.code === ECP_INPUT_INVALID
    )
  })
})
