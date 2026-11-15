import { workflow, step, extension } from "@executioncontrolprotocol/core"

/**
 * Secrets belong on the environment (process host or config.ecp.ts),
 * not in this workflow file. Bind them with `ecp config secrets add` and
 * `ecp config edit` — never `extension("@executioncontrolprotocol/secrets")` here.
 * `test.echo` requires `@executioncontrolprotocol/plugin-test`.
 */
export default workflow("Secrets bind echo")
  .with([extension("@executioncontrolprotocol/test")])
  .run([
    step("@executioncontrolprotocol/test.echo", "Echo")
      .with({ value: "secrets are bound in the environment, not this workflow" })
      .as("echo"),
  ])

