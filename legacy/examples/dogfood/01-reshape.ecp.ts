import { workflow, step, extension } from "@executioncontrolprotocol/core"

/** Dogfood A task 1: reshape a JSON export (fixed expression). */
export default workflow("dogfood-reshape")
  .with([extension("@executioncontrolprotocol/jsonata")])
  .run([
    step("@executioncontrolprotocol/jsonata.transform", "Reshape")
      .with({
        expression: '{ "title": items[0].title, "count": $count(items) }',
        payload: { items: [{ title: "Widget" }, { title: "Gadget" }] },
      })
      .as("summary"),
  ])
