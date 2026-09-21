import {
  defineExtension,
  capabilityFor,
  globalRegistry,
  catalogExtension,
  type Registry,
} from "@executioncontrolprotocol/core"
import {
  jsonataTransformInputSchema,
  jsonataTransformOutputSchema,
  type JsonataTransformInput,
} from "./schemas.js"
import { runJsonataTransform } from "./transform.js"

/** @executioncontrolprotocol/jsonata extension. @category Extensions */
export const jsonataExtension = defineExtension("@executioncontrolprotocol", "jsonata")
  .withMetadata({
    summary: "Transform JSON payloads with JSONata expressions",
    description:
      "Evaluates JSONata expressions locally against workflow data for mapping, filtering, and reshaping JSON without a remote service.",
    useCases: [
      "Map API responses into workflow-friendly shapes",
      "Filter or aggregate arrays inside a run",
    ],
    samplePrompts: [
      "Transform this JSON with a JSONata expression",
      "Extract the items array and keep only id and title fields",
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
          "Compiles and runs a JSONata expression against the provided payload with optional variable bindings, returning the evaluated result.",
        useCases: [
          "Project nested fields into a flat object for the next step",
          "Compute derived values from workflow input or prior step output",
        ],
        samplePrompts: [
          "Run this JSONata expression on the payload",
          "Map order lines to `{ sku, qty }` objects with JSONata",
        ],
      })
      .withHandler(async (input) => {
        const parsed = input as JsonataTransformInput
        return runJsonataTransform(parsed)
      }),
  ])
  .build()

catalogExtension(jsonataExtension)

/** Register @executioncontrolprotocol/jsonata. */
export async function registerJsonataExtension(
  registry: Registry = globalRegistry
): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/jsonata")) {
    await registry.registerExtension(jsonataExtension)
  }
}

export {
  jsonataTransformInputSchema,
  jsonataTransformOutputSchema,
  type JsonataTransformInput,
  type JsonataTransformOutput,
} from "./schemas.js"
export { runJsonataTransform } from "./transform.js"

export default jsonataExtension
