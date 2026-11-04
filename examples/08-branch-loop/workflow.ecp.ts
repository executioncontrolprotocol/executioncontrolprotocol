import { workflow, step, extension, branch, loop, expr } from "@executioncontrolprotocol/core"

/**
 * Sample for App canvas structure: branch arms, a gated step, and a loop frame.
 * Requires `ecp plugins link plugins/plugin-test` (and `plugins/plugin-app` for the UI).
 *
 * Run with `{ "expand": true }` to take the expand arm; `{ "expand": false }` skips it.
 */
export default workflow("Branch and loop demo")
  .with([extension("@executioncontrolprotocol/test")])
  .accepts({
    type: "object",
    properties: {
      expand: { type: "boolean" },
      message: { type: "string" },
    },
    required: ["expand"],
  })
  .run([
    step("@executioncontrolprotocol/test.echo", "Seed")
      .with({ value: "seed" })
      .as("seed"),
    branch([
      step("@executioncontrolprotocol/test.echo", "Expand path")
        .with({ value: "expanded" })
        .when(expr.eq("expand", true))
        .as("expanded"),
      step("@executioncontrolprotocol/test.echo", "Skip path")
        .with({ value: "skipped-arm" })
        .when(expr.eq("expand", false))
        .as("compact"),
    ]),
    step("@executioncontrolprotocol/test.echo", "Gated follow-up")
      .with({ value: "only-when-expand" })
      .when(expr.eq("expand", true))
      .as("gated"),
    loop({ label: "retry", until: expr.eq("tick.echo", "tick"), maxRounds: 2 }, [
      step("@executioncontrolprotocol/test.echo", "Loop body")
        .with({ value: "tick" })
        .as("tick"),
    ]),
  ])
  .returns({
    type: "object",
    properties: {
      seed: { type: "string" },
    },
  })
