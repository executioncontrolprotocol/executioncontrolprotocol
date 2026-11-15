import { describe, expect, it } from "vitest"
import {
  capabilityToolName,
  fitMcpToolName,
  sanitizeMcpToolName,
  uniqueMcpToolName,
} from "../src/names.js"
import { MCP_TOOL_NAME_MAX } from "../src/constants.js"

describe("MCP tool names", () => {
  it("sanitizes characters Claude clients reject", () => {
    expect(sanitizeMcpToolName("jsonata.transform")).toBe("jsonata_transform")
    expect(sanitizeMcpToolName("@scope/name.cap")).toBe("_scope_name_cap")
  })

  it("keeps names that already match the allowed set", () => {
    expect(sanitizeMcpToolName("jsonata_transform")).toBe("jsonata_transform")
    expect(sanitizeMcpToolName("format-toon_encode")).toBe("format-toon_encode")
  })

  it("truncates names longer than 64 characters and appends a 6-character hash", () => {
    const raw = `ext_${"a".repeat(80)}_cap`
    const fitted = fitMcpToolName(sanitizeMcpToolName(raw), raw)
    expect(fitted.length).toBe(MCP_TOOL_NAME_MAX)
    expect(fitted).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    expect(fitted.slice(-7)).toMatch(/^_[a-f0-9]{6}$/)
  })

  it("hashes two different long names to different tool names", () => {
    const a = `ext_${"a".repeat(80)}_one`
    const b = `ext_${"a".repeat(80)}_two`
    expect(fitMcpToolName(sanitizeMcpToolName(a), a)).not.toBe(
      fitMcpToolName(sanitizeMcpToolName(b), b)
    )
  })

  it("disambiguates collisions after sanitize", () => {
    const used = new Set<string>()
    const first = uniqueMcpToolName("foo.bar_baz", used)
    const second = uniqueMcpToolName("foo_bar.baz", used)
    expect(first).toBe("foo_bar_baz")
    expect(second).not.toBe(first)
    expect(second).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    expect(used.size).toBe(2)
  })

  it("builds capability names from extension name plus capability", () => {
    const used = new Set<string>()
    expect(capabilityToolName("jsonata", "transform", used)).toBe("jsonata_transform")
    expect(capabilityToolName("test", "echo", used)).toBe("test_echo")
  })
})
