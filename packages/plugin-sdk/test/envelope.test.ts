import { describe, expect, it } from "vitest"
import { ECP_INPUT_INVALID, EXIT_USAGE } from "../src/codes.js"
import { EcpCommand } from "../src/ecp-command.js"
import { EcpCliError } from "../src/errors.js"
import { failureEnvelope, successEnvelope } from "../src/envelope.js"

describe("JSON envelope", () => {
  it("wraps success data", () => {
    expect(successEnvelope({ result: 1 })).toEqual({ ok: true, data: { result: 1 } })
  })

  it("wraps invalid input as ECP_INPUT_INVALID", () => {
    const err = new EcpCliError(ECP_INPUT_INVALID, "bad expression", {
      path: "expression",
      exitCode: EXIT_USAGE,
    })
    expect(failureEnvelope(err.toBody())).toEqual({
      ok: false,
      error: { code: ECP_INPUT_INVALID, message: "bad expression", path: "expression" },
    })
  })

  it("toSuccessJson uses the envelope, not the raw result", () => {
    const body = EcpCommand.prototype.toSuccessJson.call({ jsonEnabled: () => true } as never, {
      result: 2,
    })
    expect(body).toEqual({ ok: true, data: { result: 2 } })
  })

  it("capability failure envelopes keep the invoke code", () => {
    const err = new EcpCliError("INVOKE_FAILED", "capability failed", { exitCode: 1 })
    const body = EcpCommand.prototype.toErrorJson.call({ jsonEnabled: () => true } as never, err)
    expect(body).toEqual({
      ok: false,
      error: { code: "INVOKE_FAILED", message: "capability failed" },
    })
  })
})
