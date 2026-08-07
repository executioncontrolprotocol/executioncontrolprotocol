import { describe, expect, it } from "vitest"
import { workflow, step } from "../src/index.js"
import { initTestEcp } from "./helpers.js"

describe("node runtime", () => {
  it("runs echo workflow", async () => {
    const ecp = await initTestEcp("test", "Test")
    const manifest = workflow("Echo run")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hello" }).as("echo")])
      .toManifest()

    const result = await ecp.run(manifest)
    expect(result.run.status).toBe("completed")
    expect(result.state?.echo).toEqual({ echo: "hello" })
  })
})
