import jsonata from "jsonata"
import type { JsonataTransformInput, JsonataTransformOutput } from "./schemas.js"

/**
 * Compile and evaluate a JSONata expression against a payload.
 * @category Extensions
 */
export async function runJsonataTransform(
  input: JsonataTransformInput
): Promise<JsonataTransformOutput> {
  let expr
  try {
    expr = jsonata(input.expression)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JSONata expression: ${message}`)
  }

  if (input.bindings) {
    for (const [name, value] of Object.entries(input.bindings)) {
      expr.assign(name, value)
    }
  }

  try {
    const result = await expr.evaluate(input.payload)
    return { result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`JSONata evaluation failed: ${message}`)
  }
}
