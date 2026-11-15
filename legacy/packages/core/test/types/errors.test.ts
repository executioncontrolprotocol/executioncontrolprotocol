import { describe, expect, it } from "vitest"
import {
  ECP_CAPABILITY_UNKNOWN,
  ECP_ERROR_CODES,
  ECP_INPUT_INVALID,
  ECP_INVOKE_ERROR_CODES,
  ECP_OUTPUT_INVALID,
  ECP_PLUGIN_DENIED,
  ECP_POLICY_DENIED,
  ECP_SECRET_MISSING,
  ECP_STEP_FAILED,
  EcpError,
  isEcpError,
} from "../../src/types/index.js"

describe("ECP error catalogue", () => {
  it("exposes the §4.6 codes", () => {
    expect(ECP_ERROR_CODES.CAPABILITY_UNKNOWN).toBe("ECP_CAPABILITY_UNKNOWN")
    expect(ECP_ERROR_CODES.RERUN_INCOMPATIBLE).toBe("ECP_RERUN_INCOMPATIBLE")
    expect(ECP_CAPABILITY_UNKNOWN).toBe("ECP_CAPABILITY_UNKNOWN")
  })

  it("maps live invoke codes onto the catalogue", () => {
    expect(ECP_INVOKE_ERROR_CODES.CAPABILITY_NOT_FOUND).toBe(ECP_CAPABILITY_UNKNOWN)
    expect(ECP_INVOKE_ERROR_CODES.INVOKE_INPUT_INVALID).toBe(ECP_INPUT_INVALID)
    expect(ECP_INVOKE_ERROR_CODES.INVOKE_OUTPUT_INVALID).toBe(ECP_OUTPUT_INVALID)
    expect(ECP_INVOKE_ERROR_CODES.INVOKE_DENIED).toBe(ECP_POLICY_DENIED)
    expect(ECP_INVOKE_ERROR_CODES.INVOKE_FAILED).toBe(ECP_STEP_FAILED)
  })

  it("identifies EcpError instances", () => {
    const err = new EcpError(ECP_SECRET_MISSING, "Secret x is not set", { path: "config.x" })
    expect(isEcpError(err)).toBe(true)
    expect(err.code).toBe(ECP_SECRET_MISSING)
    expect(err.path).toBe("config.x")
    expect(isEcpError(new Error("nope"))).toBe(false)
  })

  it("keeps plugin-denied as the registry denial code", () => {
    expect(ECP_PLUGIN_DENIED).toBe("ECP_PLUGIN_DENIED")
  })
})
