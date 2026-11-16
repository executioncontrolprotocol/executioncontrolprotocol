import { describe, expect, it } from "vitest"
import type { CapabilityEntry } from "@executioncontrolprotocol/protocol"
import { validateExecution } from "../src/index.js"

const openEcho: CapabilityEntry = {
  id: "@executioncontrolprotocol/test.echo",
  plugin: "@executioncontrolprotocol/test",
  package: "@executioncontrolprotocol/plugin-test",
  pluginVersion: "fixture.1",
  summary: "Echo",
  description: "Echo",
  useCases: [],
  projections: [],
  accepts: {
    type: "object",
    properties: {
      value: {},
    },
  },
  returns: {
    type: "object",
    properties: { echo: {} },
  },
}

describe("validation $script on open fields", () => {
  it("allows $script when the accepts property is an open schema", async () => {
    const result = await validateExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "scripted",
            uses: openEcho.id,
            input: { value: { $script: { lang: "js", source: "const x = 1" } } },
            as: "out",
          },
        ],
      },
      { capabilities: [openEcho] },
    )
    expect(
      result.issues.filter(
        (issue) => issue.path.includes("/input/value") && issue.message.includes("boolean schema is false"),
      ),
    ).toEqual([])
    expect(result.valid).toBe(true)
  })
})
