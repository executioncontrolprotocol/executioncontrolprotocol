import { describe, expect, it } from "vitest"
import { workflow, step } from "../../src/index.js"
import { createTestEnvironment } from "../helpers.js"

function twoStep() {
  return workflow("two")
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
}

describe("run stepping", () => {
  it("stopAfterStepId reports stopped and skips later steps", async () => {
    const ecp = await (await createTestEnvironment("step-to")).init()
    try {
      const result = await ecp.run(twoStep(), { stopAfterStepId: "step-a" })
      expect(result.run.status).toBe("stopped")
      expect(result.history?.["step-a"]?.status).toBe("completed")
      expect(result.history?.["step-b"]).toBeUndefined()
      expect(result.state?.first).toEqual({ echo: "a" })
      expect(result.state?.second).toBeUndefined()
    } finally {
      await ecp.terminate()
    }
  })

  it("onlyStepId re-runs one step and reports stopped when not last", async () => {
    const ecp = await (await createTestEnvironment("step-only")).init()
    try {
      const first = await ecp.run(twoStep())
      expect(first.run.status).toBe("completed")
      const rerun = await ecp.run(twoStep(), {
        seedState: { first: first.state?.first },
        seedHistory: { "step-a": first.history!["step-a"]! },
        onlyStepId: "step-a",
      })
      expect(rerun.run.status).toBe("stopped")
      expect(rerun.history?.["step-a"]?.status).toBe("completed")
      expect(rerun.history?.["step-b"]).toBeUndefined()
      expect(rerun.state?.second).toBeUndefined()
    } finally {
      await ecp.terminate()
    }
  })

  it("skips completed priors when resuming with seedHistory", async () => {
    const ecp = await (await createTestEnvironment("step-skip")).init()
    try {
      const first = await ecp.run(twoStep(), { stopAfterStepId: "step-a" })
      const firstOutput = first.history?.["step-a"]?.output
      const resumed = await ecp.run(twoStep(), {
        seedState: first.state,
        seedHistory: first.history,
      })
      expect(resumed.history?.["step-a"]?.output).toEqual(firstOutput)
      expect(resumed.history?.["step-b"]?.status).toBe("completed")
      expect(resumed.run.status).toBe("completed")
    } finally {
      await ecp.terminate()
    }
  })

  it("emits public events in order", async () => {
    const ecp = await (await createTestEnvironment("step-events")).init()
    try {
      const types: string[] = []
      await ecp.run(twoStep(), {
        stopAfterStepId: "step-a",
        onEvent: (event) => types.push(event.type),
      })
      expect(types[0]).toBe("run.start")
      expect(types).toContain("step.start")
      expect(types).toContain("step.end")
      expect(types.at(-1)).toBe("run.end")
    } finally {
      await ecp.terminate()
    }
  })
})
