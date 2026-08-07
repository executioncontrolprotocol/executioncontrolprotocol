import { workflow, step } from "@executioncontrolprotocol/core"

export default workflow("Echo test")
  .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hello from fluent API" }).as("echo")])
