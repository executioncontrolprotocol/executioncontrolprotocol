import { describe, expect, it } from "vitest"
import { workflow, step } from "../../src/index.js"
import { createTestEnvironment } from "../helpers.js"

describe("ecp.test session", () => {
  it("runTo is inclusive and pauses before later steps", async () => {
    const ecp = await (await createTestEnvironment("test-run-to")).init()
    try {
      const manifest = workflow("two")
        .run([
          step("@executioncontrolprotocol/test.echo", "A")
            .id("step-a")
            .with({ value: "a" })
            .as("first"),
          step("@executioncontrolprotocol/test.echo", "B")
            .id("step-b")
            .with({ value: "b" })
            .as("second"),
        ])
        .toManifest()

      const session = await ecp.test(manifest).start()
      const after = await session.runTo("step-a")
      expect(after.status).toBe("paused")
      expect(after.cursor).toBe("step-a")
      expect(after.history["step-a"]?.status).toBe("completed")
      expect(after.history["step-b"]).toBeUndefined()
      expect(after.state.first).toEqual({ echo: "a" })
      expect(after.state.second).toBeUndefined()
    } finally {
      await ecp.terminate()
    }
  })

  it("rerun clears downstream and replaces state", async () => {
    const ecp = await (await createTestEnvironment("test-rerun")).init()
    try {
      const manifest = workflow("two")
        .run([
          step("@executioncontrolprotocol/test.echo", "A")
            .id("step-a")
            .with({ value: "a" })
            .as("first"),
          step("@executioncontrolprotocol/test.echo", "B")
            .id("step-b")
            .with({ value: "b" })
            .as("second"),
        ])
        .toManifest()

      const session = await ecp.test(manifest).start()
      await session.runTo("step-b")
      expect(session.snapshot().state.second).toEqual({ echo: "b" })

      const afterRerun = await session.rerun("step-a")
      expect(afterRerun.history["step-a"]?.status).toBe("completed")
      expect(afterRerun.history["step-b"]).toBeUndefined()
      expect(afterRerun.state.first).toEqual({ echo: "a" })
      expect(afterRerun.state.second).toBeUndefined()
      expect(afterRerun.cursor).toBe("step-a")
      expect(afterRerun.status).toBe("paused")
    } finally {
      await ecp.terminate()
    }
  })

  it("skips completed priors on subsequent runTo", async () => {
    const ecp = await (await createTestEnvironment("test-skip")).init()
    try {
      const manifest = workflow("two")
        .run([
          step("@executioncontrolprotocol/test.echo", "A")
            .id("step-a")
            .with({ value: "a" })
            .as("first"),
          step("@executioncontrolprotocol/test.echo", "B")
            .id("step-b")
            .with({ value: "b" })
            .as("second"),
        ])
        .toManifest()

      const session = await ecp.test(manifest).start()
      await session.runTo("step-a")
      const firstOutput = session.snapshot().history["step-a"]?.output

      const toEnd = await session.runTo("step-b")
      expect(toEnd.history["step-a"]?.output).toEqual(firstOutput)
      expect(toEnd.history["step-b"]?.status).toBe("completed")
      expect(toEnd.status).toBe("completed")
    } finally {
      await ecp.terminate()
    }
  })
})
