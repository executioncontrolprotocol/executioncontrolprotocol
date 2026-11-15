import { workflow, step, extension } from "@executioncontrolprotocol/core"

export default workflow("Echo JS")
  .with([extension("@executioncontrolprotocol/test")])
  .run([
    step("@executioncontrolprotocol/test.echo", "Echo")
      .with({ value: "hello from JavaScript" })
      .as("echo"),
  ])
