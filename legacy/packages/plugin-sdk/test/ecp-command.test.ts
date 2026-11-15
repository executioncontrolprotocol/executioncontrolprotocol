import { describe, expect, it } from "vitest"
import { ECP_INPUT_INVALID, EXIT_FAILED, EXIT_USAGE } from "../src/codes.js"
import { EcpCommand } from "../src/ecp-command.js"
import { EcpCliError } from "../src/errors.js"
import { failureEnvelope } from "../src/envelope.js"

function stub(json: boolean): EcpCommand & { logs: string[]; exits: number[] } {
  const logs: string[] = []
  const exits: number[] = []
  const cmd = Object.create(EcpCommand.prototype) as EcpCommand & {
    logs: string[]
    exits: number[]
  }
  cmd.logs = logs
  cmd.exits = exits
  cmd.jsonEnabled = () => json
  cmd.log = (message?: string) => {
    logs.push(String(message ?? ""))
  }
  cmd.logJson = (payload: unknown) => {
    logs.push(JSON.stringify(payload))
  }
  cmd.exit = ((code?: number) => {
    exits.push(code ?? 0)
    const err = new Error("EEXIT") as Error & { exitCode: number }
    err.exitCode = code ?? 0
    throw err
  }) as EcpCommand["exit"]
  cmd.error = ((message: string, opts?: { exit?: number }) => {
    const err = new Error(message) as Error & { exitCode: number }
    err.exitCode = opts?.exit ?? 1
    throw err
  }) as EcpCommand["error"]
  return cmd
}

describe("EcpCommand", () => {
  it("writeSuccess skips output when --json is on", () => {
    const cmd = stub(true)
    cmd.writeSuccess({ a: 1 })
    expect(cmd.logs).toEqual([])
  })

  it("writeSuccess skips undefined, logs strings, and pretty-prints objects", () => {
    const cmd = stub(false)
    cmd.writeSuccess(undefined)
    cmd.writeSuccess("hello")
    cmd.writeSuccess({ a: 1 })
    expect(cmd.logs).toEqual(["hello", JSON.stringify({ a: 1 }, null, 2)])
  })

  it("catch with --json prints the ECP envelope and exits", async () => {
    const cmd = stub(true)
    const err = new EcpCliError(ECP_INPUT_INVALID, "bad", { path: "expression", exitCode: EXIT_USAGE })
    await expect(cmd.catch(err)).rejects.toThrow(/EEXIT/)
    expect(cmd.exits).toEqual([EXIT_USAGE])
    expect(JSON.parse(cmd.logs[0] ?? "{}")).toEqual(
      failureEnvelope({ code: ECP_INPUT_INVALID, message: "bad", path: "expression" })
    )
  })

  it("catch treats --json in argv as json when jsonEnabled is false", async () => {
    const cmd = stub(false)
    cmd.argv = ["--json"]
    const err = new EcpCliError(ECP_INPUT_INVALID, "bad", { exitCode: EXIT_USAGE })
    await expect(cmd.catch(err)).rejects.toThrow(/EEXIT/)
    expect(JSON.parse(cmd.logs[0] ?? "{}")).toEqual(failureEnvelope({ code: ECP_INPUT_INVALID, message: "bad" }))
  })

  it("catch without --json prints the message", async () => {
    const cmd = stub(false)
    await expect(cmd.catch(new EcpCliError("ECP_CLI_ERROR", "nope", { exitCode: EXIT_FAILED }))).rejects.toThrow(
      /nope/
    )
  })

  it("toErrorJson maps oclif usage errors to ECP_INPUT_INVALID", () => {
    const cmd = stub(true)
    const oclifErr = Object.assign(new Error("Required"), { oclif: { exit: EXIT_USAGE } })
    expect(cmd.toErrorJson(oclifErr)).toEqual(
      failureEnvelope({ code: ECP_INPUT_INVALID, message: "Required" })
    )
    const other = Object.assign(new Error("boom"), { oclif: { exit: EXIT_FAILED } })
    expect(cmd.toErrorJson(other)).toEqual(failureEnvelope({ code: "ECP_CLI_ERROR", message: "boom" }))
    expect(cmd.toErrorJson(new Error("plain"))).toEqual(
      failureEnvelope({ code: "ECP_CLI_ERROR", message: "plain" })
    )
    expect(cmd.toErrorJson("string-err")).toEqual(
      failureEnvelope({ code: "ECP_CLI_ERROR", message: "string-err" })
    )
  })

  it("wantsEnvelope follows jsonEnabled", () => {
    expect(stub(true).wantsEnvelope()).toBe(true)
    expect(stub(false).wantsEnvelope()).toBe(false)
  })
})
