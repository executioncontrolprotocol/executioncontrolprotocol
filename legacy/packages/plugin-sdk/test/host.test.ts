import { describe, expect, it, afterEach } from "vitest"
import { clearHost, getHost, setHost, type EcpHost } from "../src/host.js"

describe("getHost", () => {
  afterEach(() => {
    clearHost()
  })

  it("throws when the init hook has not run", () => {
    expect(() => getHost()).toThrow(/init hook/)
  })

  it("round-trips a process-wide host", () => {
    const host = { environmentId: "node", output: "json" } as EcpHost
    setHost(host)
    expect(getHost()).toBe(host)
    clearHost()
    expect(() => getHost()).toThrow(/init hook/)
  })
})
