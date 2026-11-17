import { describe, expect, it } from "vitest"

/**
 * The client subpath must not pull in the full host composition (engine, QuickJS, supervisor).
 */
describe("host client subpath", () => {
  it("exports client helpers without createLocalHost", async () => {
    const client = await import("@executioncontrolprotocol/host/client")
    expect(typeof client.readHostJson).toBe("function")
    expect(typeof client.checkHealth).toBe("function")
    expect(typeof client.HostClient).toBe("function")
    expect("createLocalHost" in client).toBe(false)
    expect("runSupervisor" in client).toBe(false)
  })
})