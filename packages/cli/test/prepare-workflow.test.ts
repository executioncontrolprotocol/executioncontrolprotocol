import { describe, expect, it } from "vitest"
import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/core/types"
import { EcpCliError, ECP_STEP_FAILED, EXIT_FAILED, EXIT_PAUSED } from "@executioncontrolprotocol/plugin-sdk"
import { throwIfRunFailed } from "../src/lib/prepare-workflow.js"

describe("throwIfRunFailed", () => {
  it("returns completed and stopped results", () => {
    const completed = {
      schema: "@executioncontrolprotocol.run.result" as const,
      version: LATEST_ECP_VERSION,
      run: { id: "a", status: "completed" as const },
    }
    expect(throwIfRunFailed(completed)).toBe(completed)
    const stopped = { ...completed, run: { id: "a", status: "stopped" as const } }
    expect(throwIfRunFailed(stopped)).toBe(stopped)
  })

  it("attaches the RunResult on failure", () => {
    const result = {
      schema: "@executioncontrolprotocol.run.result" as const,
      version: LATEST_ECP_VERSION,
      run: { id: "r1", status: "failed" as const },
      history: {
        call: {
          status: "failed" as const,
          output: { partial: true },
          diagnostics: [{ code: ECP_STEP_FAILED, message: "HTTP 400", details: { status: 400 } }],
        },
      },
    }
    try {
      throwIfRunFailed(result)
      throw new Error("expected throw")
    } catch (err) {
      expect(err).toBeInstanceOf(EcpCliError)
      const cli = err as EcpCliError
      expect(cli.code).toBe(ECP_STEP_FAILED)
      expect(cli.exitCode).toBe(EXIT_FAILED)
      expect(cli.data).toBe(result)
    }
  })

  it("attaches the RunResult on pause", () => {
    const result = {
      schema: "@executioncontrolprotocol.run.result" as const,
      version: LATEST_ECP_VERSION,
      run: { id: "r2", status: "paused" as const },
      history: {
        call: {
          status: "paused" as const,
          diagnostics: [{ code: "ECP_RUN_PAUSED", message: "needs approval" }],
        },
      },
    }
    try {
      throwIfRunFailed(result)
      throw new Error("expected throw")
    } catch (err) {
      expect(err).toBeInstanceOf(EcpCliError)
      const cli = err as EcpCliError
      expect(cli.exitCode).toBe(EXIT_PAUSED)
      expect(cli.data).toBe(result)
    }
  })
})
