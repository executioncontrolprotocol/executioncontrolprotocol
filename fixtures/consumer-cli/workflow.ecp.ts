import { workflow, step, extension } from "@executioncontrolprotocol/core"

export default workflow("Consumer CLI echo")
  .with([extension("@executioncontrolprotocol/test")])
  .run([
    step("@executioncontrolprotocol/test.echo", "Echo")
      .with({ value: "hello from consumer-cli fixture" })
      .as("echo"),
  ])
