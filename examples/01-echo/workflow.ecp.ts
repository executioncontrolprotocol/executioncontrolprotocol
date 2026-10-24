import { workflow, step } from "@executioncontrolprotocol/core"

/** Built-in test.echo; no .with() and no environment file. */
export default workflow("Echo test").run([
  step("@executioncontrolprotocol/test.echo", "Echo")
    .with({ value: "hello from fluent API" })
    .as("echo"),
])
