import { workflow, step, ref } from "@executioncontrolprotocol/core"

/** Second step refs a missing field so the run fails after the first step completes. */
export default workflow("Fail ref")
  .run([
    step("@executioncontrolprotocol/test.echo", "Echo")
      .id("echo")
      .with({ value: "hi" })
      .as("echo"),
    step("@executioncontrolprotocol/test.echo", "Next")
      .id("next")
      .with({ value: ref("echo.missing") })
      .as("next"),
  ])
