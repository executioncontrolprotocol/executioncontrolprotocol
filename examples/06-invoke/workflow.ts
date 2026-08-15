import { workflow, step } from "@executioncontrolprotocol/core"

/** Present so compile/validate still have a workflow module if needed. */
export default workflow("Invoke companion")
  .run([
    step("@executioncontrolprotocol/test.echo", "Echo")
      .with({ value: "unused in invoke path" })
      .as("echo"),
  ])
