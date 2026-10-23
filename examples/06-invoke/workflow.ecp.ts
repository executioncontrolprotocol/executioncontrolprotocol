import { workflow, step } from "@executioncontrolprotocol/core"

/** Companion workflow; `ecp invoke` does not need a workflow file. */
export default workflow("Invoke companion").run([
  step("@executioncontrolprotocol/test.echo", "Echo")
    .with({ value: "unused in invoke path" })
    .as("echo"),
])
