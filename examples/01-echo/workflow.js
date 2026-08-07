import { workflow, step } from "@executioncontrolprotocol/core"

export default workflow("Echo JS")
  .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hello from JavaScript" }).as("echo")])
