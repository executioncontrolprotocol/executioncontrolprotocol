import { workflow, step } from "@executioncontrolprotocol/core"

export default workflow("Encode decode echo")
  .run([
    step("@executioncontrolprotocol/test.echo", "Echo")
      .with({ value: "encode me" })
      .as("echo"),
  ])
