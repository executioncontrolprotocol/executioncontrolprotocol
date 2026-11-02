import { workflow, step, ref, extension } from "@executioncontrolprotocol/core"

export default workflow("Echo from input")
  .id("echo-from-input")
  .accepts({
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
  })
  .returns({
    type: "object",
    properties: { echo: { type: "object" } },
    required: ["echo"],
  })
  .with([extension("@executioncontrolprotocol/test")])
  .run([
    step("@executioncontrolprotocol/test.echo", "Echo")
      .with({ value: ref("value") })
      .as("echo"),
  ])
