import { describe, expect, it } from "vitest"
import { workflow, step, expr } from "../src/index.js"
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

  it("applies accepts defaults into run input and when predicates", async () => {
    const ecp = await initTestEcp("defaults", "Defaults")
    const manifest = workflow("Expand default")
      .accepts({
        type: "object",
        properties: {
          expand: { type: "boolean", default: true },
        },
      })
      .run([
        step("@executioncontrolprotocol/test.echo", "Maybe")
          .with({ value: "expanded" })
          .when(expr((state) => state.expand === true))
          .as("maybe"),
      ])
      .toManifest()

    const dry = await ecp.run(manifest, { input: {}, dryRun: true })
    expect(dry.state).toEqual({ expand: true })

    const withDefault = await ecp.run(manifest, { input: {} })
    expect(withDefault.run.status).toBe("completed")
    expect(withDefault.state?.expand).toBe(true)
    expect(withDefault.state?.maybe).toEqual({ echo: "expanded" })

    const explicitFalse = await ecp.run(manifest, { input: { expand: false } })
    expect(explicitFalse.run.status).toBe("completed")
    expect(explicitFalse.state?.expand).toBe(false)
    expect(explicitFalse.state?.maybe).toBeUndefined()
  })
})
