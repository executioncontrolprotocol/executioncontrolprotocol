import { workflow, step, ref } from "@executioncontrolprotocol/core"

export default workflow("Test session two-step")
  .run([
    step("@executioncontrolprotocol/test.echo", "Collect")
      .with({ value: "signal-a" })
      .as("collect"),
    step("@executioncontrolprotocol/test.echo", "Summarize")
      .with({ value: ref("collect.echo") })
      .as("summarize"),
  ])
