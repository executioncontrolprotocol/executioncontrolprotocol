import { workflow, step } from "@executioncontrolprotocol/core"

export default workflow("approval echo").run([
  step("@executioncontrolprotocol/test.echo", "Echo")
    .id("echo")
    .with({ value: "needs-approval" })
    .as("echo"),
])
