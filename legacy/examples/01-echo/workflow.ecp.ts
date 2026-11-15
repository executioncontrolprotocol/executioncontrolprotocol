import { workflow, step, extension } from "@executioncontrolprotocol/core"

/** Requires `@executioncontrolprotocol/plugin-test` (`ecp plugins link plugins/plugin-test`). */
export default workflow("Echo test")
  .with([extension("@executioncontrolprotocol/test")])
  .run([
    step("@executioncontrolprotocol/test.echo", "Echo")
      .with({ value: "hello from fluent API" })
      .as("echo"),
  ])
