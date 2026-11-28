import { describe, expect, it } from "vitest"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { validateExecution } from "../src/index.js"
import { ifTrueThenElse } from "./manifest-helpers.js"

const echo = {
  id: "@executioncontrolprotocol/test.echo",
  plugin: "@executioncontrolprotocol/test",
  package: "@executioncontrolprotocol/test",
  pluginVersion: "0.0.0",
  summary: "",
  description: "",
  useCases: [],
  projections: [],
  accepts: { type: "object", properties: { value: {} } },
  returns: { type: "object", properties: { echo: {} } },
}

const step = (id: string, as: string, value: unknown = id) => ({
  id,
  uses: echo.id,
  input: { value },
  as,
  mode: "replace" as const,
})

function manifest(steps: ExecutionManifest["steps"]): ExecutionManifest {
  return { schema: "@executioncontrolprotocol.execution", version: "2.0", steps }
}

async function errorCodes(steps: ExecutionManifest["steps"]) {
  const report = await validateExecution(manifest(steps), { capabilities: [echo] })
  return report.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code)
}

describe("merge port dataflow", () => {
  it("accepts then and else writers on one merge port", async () => {
    const codes = await errorCodes([
      ifTrueThenElse([step("a", "left")], [step("b", "right")]),
      {
        id: "join",
        uses: echo.id,
        input: { value: { $ref: ["state.left", "state.right"] } },
        as: "joined",
      },
    ])
    expect(codes).toEqual([])
  })

  it("accepts nested if in else with merge on inner sides", async () => {
    const codes = await errorCodes([
      {
        type: "if",
        id: "outer",
        expression: "true",
        then: [step("t", "only_then")],
        else: [
          ifTrueThenElse([step("in-t", "inner_a")], [step("in-e", "inner_b")], "false"),
          {
            id: "outer-pick",
            uses: echo.id,
            input: { value: { $ref: ["state.inner_a", "state.inner_b"] } },
            as: "merged",
          },
        ],
      },
    ])
    expect(codes).not.toContain("ECP_REF_AMBIGUOUS")
  })

  it("rejects same-side refs as ECP_REF_AMBIGUOUS", async () => {
    const codes = await errorCodes([
      ifTrueThenElse([step("a", "x"), step("b", "y")], [step("c", "z")]),
      {
        id: "join",
        uses: echo.id,
        input: { value: { $ref: ["state.x", "state.y"] } },
        as: "bad",
      },
    ])
    expect(codes).toContain("ECP_REF_AMBIGUOUS")
  })

  it("rejects parallel paths as ECP_REF_AMBIGUOUS", async () => {
    const codes = await errorCodes([
      {
        type: "parallel",
        id: "p",
        paths: [[step("a", "pa")], [step("b", "pb")]],
      },
      {
        id: "join",
        uses: echo.id,
        input: { value: { $ref: ["state.pa", "state.pb"] } },
        as: "bad",
      },
    ])
    expect(codes).toContain("ECP_REF_AMBIGUOUS")
  })

  it("requires optional when only one if side is covered", async () => {
    const codes = await errorCodes([
      {
        type: "if",
        id: "outer",
        expression: "true",
        then: [step("a", "left")],
        else: [
          {
            type: "if",
            id: "inner",
            expression: "true",
            then: [step("in-t", "inner_only")],
          },
        ],
      },
      {
        id: "outer-join",
        uses: echo.id,
        input: { value: { $ref: ["state.left", "state.inner_only"] } },
        as: "bad",
      },
    ])
    expect(codes).toContain("ECP_REF_MAYBE_MISSING")
  })

  it("allows partial coverage with optional and fallback", async () => {
    const codes = await errorCodes([
      ifTrueThenElse([step("a", "left")], []),
      {
        id: "join",
        uses: echo.id,
        input: { value: { $ref: ["state.left", "state.right"], optional: true, fallback: null } },
        as: "ok",
      },
    ])
    expect(codes).not.toContain("ECP_REF_MAYBE_MISSING")
  })

  it("rejects a single-path merge list at validation", async () => {
    const codes = await errorCodes([
      ifTrueThenElse([step("a", "left")], [step("b", "right")]),
      {
        id: "join",
        uses: echo.id,
        input: { value: { $ref: ["state.left"] } },
        as: "bad",
      },
    ])
    expect(codes).toContain("ECP_MANIFEST_INVALID")
  })
})