import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"
import type { CapabilityCall, ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine } from "../../quickjs/src/index.js"
import { runExecution, validateExecution } from "../src/index.js"

const patternsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../examples/patterns")
const files = readdirSync(patternsDir).filter((name) => name.endsWith(".ecp.json"))
const engine = new QuickJsExpressionEngine()

const echo = {
  id: "@executioncontrolprotocol/test.echo",
  plugin: "@executioncontrolprotocol/test",
  package: "@executioncontrolprotocol/test",
  pluginVersion: "0.0.0",
  summary: "",
  description: "",
  useCases: [],
  projections: [],
  accepts: { type: "object", properties: { value: {} } },
  returns: { type: "object", properties: { echo: {} } },
}

async function call(request: CapabilityCall): Promise<unknown> {
  return { echo: (request.input as { value?: unknown }).value }
}

function defaults(manifest: ExecutionManifest): Record<string, unknown> {
  const properties = (manifest.execution?.accepts as { properties?: Record<string, { default?: unknown }> } | undefined)
    ?.properties
  return Object.fromEntries(
    Object.entries(properties ?? {})
      .filter(([, schema]) => schema.default !== undefined)
      .map(([key, schema]) => [key, schema.default]),
  )
}

beforeAll(async () => {
  await engine.start()
})

describe("examples/patterns", () => {
  it("has the pattern examples", () => {
    expect(files.length).toBeGreaterThanOrEqual(7)
  })

  for (const file of files) {
    it(`${file} validates and runs to completion with the accepts defaults`, async () => {
      const manifest = JSON.parse(readFileSync(path.join(patternsDir, file), "utf8")) as ExecutionManifest
      const report = await validateExecution(manifest, { capabilities: [echo] })
      expect(report.issues.filter((issue) => issue.severity === "error")).toEqual([])
      const outcome = await runExecution(manifest, defaults(manifest), { capabilities: [echo], expression: engine, call })
      expect(outcome.error).toBeUndefined()
      expect(outcome.status).toBe("completed")
    })
  }

  it("branch.ecp.json picks the side from the tier input", async () => {
    const manifest = JSON.parse(readFileSync(path.join(patternsDir, "branch.ecp.json"), "utf8")) as ExecutionManifest
    const deps = { capabilities: [echo], expression: engine, call }
    const ran = async (tier: string) => (await runExecution(manifest, { tier }, deps)).steps.map((step) => step.nodeId)
    expect(await ran("gold")).toContain("gold-offer")
    expect(await ran("silver")).toContain("silver-offer")
    expect(await ran("bronze")).toContain("default-offer")
    expect(await ran("bronze")).not.toContain("gold-offer")
  })
})
