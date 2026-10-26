import { workflow, step, extension } from "@executioncontrolprotocol/core"

/** Companion workflow; `ecp invoke` does not need a workflow file. Requires plugin-test. */
export default workflow("Invoke companion")
  .with([extension("@executioncontrolprotocol/test")])
  .run([
    step("@executioncontrolprotocol/test.echo", "Echo")
      .with({ value: "unused in invoke path" })
      .as("echo"),
  ])

