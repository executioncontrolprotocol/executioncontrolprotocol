import { workflow, step } from "@executioncontrolprotocol/core"

/** Echo keeps this example runnable without a live OpenAI key. */
export default workflow("Secrets bind echo")
  .run([
    step("@executioncontrolprotocol/test.echo", "Echo")
      .with({ value: "secrets are bound in the environment, not this workflow" })
      .as("echo"),
  ])
