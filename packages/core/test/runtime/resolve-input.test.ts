import { describe, expect, it } from "vitest"
import { resolveStepInput } from "../../src/runtime/resolve-input.js"
import { ECP_REF_UNRESOLVED, ref } from "../../src/index.js"
import { EcpError } from "../../src/types/index.js"

describe("resolveStepInput", () => {
  it("resolves refs from committed state", () => {
    const input = resolveStepInput({ value: ref("echo.echo") }, { echo: { echo: "hi" } })
    expect(input.value).toBe("hi")
  })

  it("throws ECP_REF_UNRESOLVED when a required ref is missing", () => {
    expect(() => resolveStepInput({ value: ref("missing") }, {})).toThrow(EcpError)
    try {
      resolveStepInput({ value: ref("missing") }, {})
    } catch (err) {
      expect(err).toBeInstanceOf(EcpError)
      expect((err as EcpError).code).toBe(ECP_REF_UNRESOLVED)
    }
  })

  it("uses optional fallback when the ref is missing", () => {
    const input = resolveStepInput(
      { value: ref("missing", { optional: true, fallback: "fb" }) },
      {}
    )
    expect(input.value).toBe("fb")
  })
})
