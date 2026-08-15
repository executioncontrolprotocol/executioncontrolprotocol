import { workflow, step } from "@executioncontrolprotocol/core"

export default workflow("Consumer CLI echo")
  .run([
    step("@executioncontrolprotocol/test.echo", "Echo")
      .with({ value: "hello from consumer-cli fixture" })
      .as("echo"),
  ])
