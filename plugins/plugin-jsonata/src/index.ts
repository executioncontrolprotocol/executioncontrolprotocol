import {
  defineExtension,
  capabilityFor,
  type Registry
} from "@executioncontrolprotocol/core"
import {
  jsonataTransformInputSchema,
  jsonataTransformOutputSchema,
  type JsonataTransformInput
} from "./schemas.js"
import { runJsonataTransform } from "./transform.js"

/** @executioncontrolprotocol/jsonata extension. @category Extensions */
export const jsonataExtension = defineExtension("@executioncontrolprotocol", "jsonata")
  .withMetadata({
    summary: "Transform JSON payloads with JSONata expressions",
    description:
      "Evaluates JSONata expressions locally against workflow data for mapping, filtering, and reshaping JSON without a remote service.",
    useCases: [
      "Reduce bulky inspect or API JSON to a small object the next steps can consume",
      "Select and rename nested fields after a discovery or upstream step",
      "Filter or reshape arrays before a follow-up capability runs",
    ],
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/jsonata", "transform")
      .withInput(jsonataTransformInputSchema)
      .withOutput(jsonataTransformOutputSchema)
      .withExecution("local")
      .withMetadata({
        summary: "Evaluate a JSONata expression on a JSON payload",
        description:
          "Compiles and runs a JSONata expression against the provided payload with optional variable bindings, returning the evaluated result. Use after inspect or fetch when the raw object is too large for chat or later steps.",
        useCases: [
          "After an inspect or fetch, project only the fields needed (from that capability’s projections or the user’s ask) into workflow state",
          "Flatten nested objects so later steps take simple refs instead of deep paths",
          "Drop large nested bags while keeping the facts needed to continue authoring",
        ],
        projections: [
          {
            summary: "Take the evaluated result",
            description:
              "Use result as the transformed JSON value for refs, steps, or downstream mapping.",
          },
          {
            summary: "Project a complex object to a small fact bag",
            description:
              "Keep only the fields the next step needs (dimensions, ids, labels, status, and similar facts) and drop the rest of the payload.",
          },
        ],
      })
      .withHandler(async (input) => {
        const parsed = input as JsonataTransformInput
        return runJsonataTransform(parsed)
      })
  ])
  .build()

/** Register @executioncontrolprotocol/jsonata. */
export async function registerJsonataExtension(registry: Registry): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/jsonata")) {
    await registry.registerExtension(jsonataExtension)
  }
}

export {
  jsonataTransformInputSchema,
  jsonataTransformOutputSchema,
  type JsonataTransformInput,
  type JsonataTransformOutput
} from "./schemas.js"
export { runJsonataTransform } from "./transform.js"

export default jsonataExtension
