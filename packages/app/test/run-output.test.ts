import { describe, expect, it } from "vitest"
import { LATEST_ECP_VERSION, type RunResult } from "@executioncontrolprotocol/core/types"
import {
  formatScalarDisplay,
  isStructuredReturnDisplay,
  valueForReturnPort,
} from "../src/ui/lib/run-output-view.js"
import { draftForPort, editorKindForValueSchema } from "../src/ui/lib/step-configure.js"
import { collectRunFailureMessages, isFailedRunResult } from "../src/ui/lib/run-progress-sync.js"
import { runFormPortsFromAccepts } from "../src/ui/lib/workflow-io.js"

describe("run output mapping", () => {
  it("reads a returns port from RunResult.output", () => {
    expect(valueForReturnPort({ value: "from-run" }, "value")).toBe("from-run")
    expect(valueForReturnPort({ value: "from-run" }, "missing")).toBeUndefined()
    expect(valueForReturnPort(undefined, "value")).toBeUndefined()
  })

  it("maps failed run diagnostics", () => {
    const result: RunResult = {
      schema: "@executioncontrolprotocol.run.result",
      version: LATEST_ECP_VERSION,
      run: { id: "run-1", status: "failed" },
      diagnostics: [{ code: "ECP_STEP_FAILED", message: "echo exploded", severity: "error" }],
    }
    expect(isFailedRunResult(result)).toBe(true)
    expect(collectRunFailureMessages(result)).toContain("echo exploded")
  })

  it("displays a string return without JSON quotes", () => {
    expect(formatScalarDisplay("hello from fluent API", "json")).toBe("hello from fluent API")
    expect(formatScalarDisplay("hello from fluent API", "string")).toBe("hello from fluent API")
    expect(isStructuredReturnDisplay("hello from fluent API", "json")).toBe(false)
  })

  it("treats an empty valueSchema as the typeLabel, not a JSON blob", () => {
    expect(editorKindForValueSchema({}, "string!")).toBe("string")
    expect(
      draftForPort(
        { id: "echo.echo", name: "echo.echo", typeLabel: "string!", valueSchema: {} },
        "hello from fluent API"
      )
    ).toBe("hello from fluent API")
  })

  it("builds an empty accepts form when the workflow has no accepts schema", () => {
    expect(runFormPortsFromAccepts(undefined)).toEqual([])
    expect(runFormPortsFromAccepts({ type: "object", properties: {} })).toEqual([])
  })
})
