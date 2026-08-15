import { workflow, step, ref } from "@executioncontrolprotocol/core"

export default workflow("Two-step echo")
  .run([
    step("@executioncontrolprotocol/test.echo", "First")
      .id("first")
      .with({ value: "one" })
      .as("first"),
    step("@executioncontrolprotocol/test.echo", "Second")
      .id("second")
      .with({ value: ref("first.echo") })
      .as("second"),
  ])
