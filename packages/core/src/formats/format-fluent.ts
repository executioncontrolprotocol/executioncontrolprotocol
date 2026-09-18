import { capabilityFor, defineExtension } from "../definitions/index.js"
import { ecpEncodeInputSchema, ecpEncodeResultSchema } from "../encoding/schemas.js"
import { encodeFluent } from "../fluent/encode-fluent.js"
import type { EcpEncodeInput } from "@executioncontrolprotocol/types"

/** Core Fluent format extension (encode only in v1). @category Formats */
export const formatFluentExtension = defineExtension("@executioncontrolprotocol", "format-fluent")
  .withMetadata({
    summary: "Fluent TypeScript source generation from ECP documents.",
    description:
      "Renders workflow manifests into Fluent API TypeScript source for authoring panels and round-trip editing. Encode-only in v1.",
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/format-fluent", "encode")
      .withInput(ecpEncodeInputSchema)
      .withOutput(ecpEncodeResultSchema)
      .withMetadata({
        summary: "Render a workflow manifest as Fluent TypeScript.",
        description:
          "Produces editable Fluent API source from a workflow manifest. Used by authoring UIs and ecp encode --format fluent.",
        useCases: [
          "Editor code panel shows Fluent source for the active workflow.",
          "Harness converts a generated manifest back into editable TS.",
        ],
        samplePrompts: [
          "Show this workflow as Fluent TypeScript.",
          "Generate Fluent source from the current manifest.",
        ],
      })
      .withHandler((input) =>
        encodeFluent((input as EcpEncodeInput).source, {
          ...(input as EcpEncodeInput).options,
          sourceSchema: (input as EcpEncodeInput).sourceSchema,
          sourceVersion: (input as EcpEncodeInput).sourceVersion,
        })
      ),
  ])
  .build()
