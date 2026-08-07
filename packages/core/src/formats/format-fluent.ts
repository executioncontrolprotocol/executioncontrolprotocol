import { capabilityFor, defineExtension } from "../definitions/index.js"
import { ecpEncodeInputSchema, ecpEncodeResultSchema } from "../encoding/schemas.js"
import { encodeFluent } from "../fluent/encode-fluent.js"
import type { EcpEncodeInput } from "@executioncontrolprotocol/types"

/** Core Fluent format extension (encode only in v1). @category Formats */
export const formatFluentExtension = defineExtension("@executioncontrolprotocol", "format-fluent")
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/format-fluent", "encode")
      .withInput(ecpEncodeInputSchema)
      .withOutput(ecpEncodeResultSchema)
      .withHandler((input) =>
        encodeFluent((input as EcpEncodeInput).source, {
          ...(input as EcpEncodeInput).options,
          sourceSchema: (input as EcpEncodeInput).sourceSchema,
          sourceVersion: (input as EcpEncodeInput).sourceVersion,
        })
      ),
  ])
  .build()
