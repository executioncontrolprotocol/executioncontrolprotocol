import { describe, expect, it } from "vitest"
import { ECP_INPUT_INVALID, EcpError } from "@executioncontrolprotocol/core/types"
import { assertLoopbackBind, isLoopbackAddress } from "../src/http-bind.js"
import { AppCommand, COMMANDS } from "../src/oclif.js"
import { openBrowserCommand } from "../src/open-browser.js"
import { resolveAppWebRoot } from "../src/web-root.js"
import { workflowLoadError } from "../src/load-error.js"

describe("isLoopbackAddress", () => {
  it("accepts IPv4 loopback and localhost", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true)
    expect(isLoopbackAddress("localhost")).toBe(true)
    expect(isLoopbackAddress("::1")).toBe(true)
    expect(isLoopbackAddress("[::1]")).toBe(true)
  })

  it("rejects a non-loopback bind", () => {
    expect(isLoopbackAddress("0.0.0.0")).toBe(false)
    expect(isLoopbackAddress("192.168.1.1")).toBe(false)
  })
})

describe("assertLoopbackBind", () => {
  it("allows 127.0.0.1", () => {
    expect(() => assertLoopbackBind("127.0.0.1")).not.toThrow()
  })

  it("throws ECP_INPUT_INVALID beyond loopback", () => {
    try {
      assertLoopbackBind("0.0.0.0")
      expect.fail("expected bind to throw")
    } catch (err) {
      expect(err).toBeInstanceOf(EcpError)
      expect((err as EcpError).code).toBe(ECP_INPUT_INVALID)
    }
  })
})

describe("openBrowserCommand", () => {
  it("uses start on win32, open on darwin, xdg-open elsewhere", () => {
    expect(openBrowserCommand("win32", "http://example.invalid").command).toBe("cmd")
    expect(openBrowserCommand("darwin", "http://example.invalid").command).toBe("open")
    expect(openBrowserCommand("linux", "http://example.invalid").command).toBe("xdg-open")
  })
})

describe("resolveAppWebRoot", () => {
  it("ends with dist/web", () => {
    expect(resolveAppWebRoot().replaceAll("\\", "/")).toMatch(/dist\/web$/)
  })
})

describe("workflowLoadError", () => {
  it("wraps a plain error as ECP_WORKFLOW_LOAD", () => {
    const result = workflowLoadError(new Error("boom"))
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.code).toBe("ECP_WORKFLOW_LOAD")
    expect(result.errors[0]?.message).toBe("boom")
  })
})

describe("oclif command map", () => {
  it("exports ecp app as a hand-written command", () => {
    expect(COMMANDS.app).toBe(AppCommand)
    expect(AppCommand.id).toBe("app")
    expect(AppCommand.args.file.required).toBe(true)
    expect(AppCommand.flags["no-open"]).toBeDefined()
    expect(AppCommand.flags.config).toBeDefined()
  })
})
