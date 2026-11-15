import { workflow, step, extension } from "@executioncontrolprotocol/core"

/** Dogfood A task 1 injected failure: wrong JSONata path (`ECP_STEP_FAILED`). */
export default workflow("dogfood-reshape-fail")
  .with([extension("@executioncontrolprotocol/jsonata")])
  .run([
    step("@executioncontrolprotocol/jsonata.transform", "Reshape")
      .with({
        expression: '$assert($exists(payload.export.summary), "wrong path")',
        payload: { items: [{ title: "Widget" }, { title: "Gadget" }] },
      })
      .as("summary"),
  ])
