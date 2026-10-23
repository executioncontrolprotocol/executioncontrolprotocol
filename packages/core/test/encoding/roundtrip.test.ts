import { describe, expect, it } from "vitest"
import {
  extension,
  normalizeWorkflowManifest,
} from "../../src/index.js"
import { compileWorkflowSource } from "@executioncontrolprotocol/node"
import { formatToonExtension } from "@executioncontrolprotocol/format-toon"
import { initEncodingTestEcp } from "../helpers.js"

const fluentSource = `
import { workflow, step, ref } from "@executioncontrolprotocol/core";

export default workflow("Weekly Brief")
  .id("weekly-brief")
  .run([
    step("@executioncontrolprotocol/test.echo", "Collect Signals")
      .id("collect-signals")
      .with({ value: "weekly" })
      .as("signals"),
  ]);
`

describe("full format round trip", () => {
  it("round trips Fluent → JSON → TOON → JSON → Fluent", async () => {
    const ecp = await initEncodingTestEcp([extension(formatToonExtension).with({})])

    const compiledA = await compileWorkflowSource({
      source: fluentSource,
      filename: "workflow.ts",
    })
    expect(compiledA.ok).toBe(true)
    const manifestA = compiledA.manifest!

    const toon = await ecp.encode(manifestA).uses("@executioncontrolprotocol/format-toon").process()

    const decoded = await ecp.decode(toon.result).uses("@executioncontrolprotocol/format-toon").process()

    const manifestB = decoded.result

    const fluent = await ecp.encode(manifestB).uses("@executioncontrolprotocol/format-fluent").process()
    await ecp.terminate()

    const compiledB = await compileWorkflowSource({
      source: String(fluent.result),
      filename: "workflow.generated.ts",
    })

    expect(compiledB.ok).toBe(true)
    expect(normalizeWorkflowManifest(compiledB.manifest!)).toEqual(
      normalizeWorkflowManifest(manifestA)
    )
  })
})
