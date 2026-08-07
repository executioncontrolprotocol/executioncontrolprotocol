import { describe, expect, it, beforeEach } from "vitest"
import { globalRegistry } from "@executioncontrolprotocol/core"
import { registerTelemetryExtension, telemetryExtension } from "../src/index.js"

describe("@executioncontrolprotocol/telemetry", () => {
  beforeEach(async () => {
    await registerTelemetryExtension()
  })

  it("registers the extension with no capabilities", () => {
    const ext = globalRegistry.getExtension("@executioncontrolprotocol/telemetry")
    expect(ext).toBe(telemetryExtension)
    expect(ext?.capabilities).toHaveLength(0)
  })

  it("subscribes to the expected lifecycle events", () => {
    const events = telemetryExtension.hooks.map((h) => h.event)
    expect(events).toEqual(
      expect.arrayContaining([
        "run:started",
        "step:completed",
        "step:failed",
        "run:finally",
      ])
    )
  })

  it("hook handlers are no-ops that resolve without throwing", async () => {
    for (const h of telemetryExtension.hooks) {
      await expect(
        Promise.resolve(h.handler({ event: h.event } as never))
      ).resolves.toBeUndefined()
    }
  })
})
