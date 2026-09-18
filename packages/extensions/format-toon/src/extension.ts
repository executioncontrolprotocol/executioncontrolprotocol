import {
  capabilityFor,
  defineExtension,
  ecpDecodeInputSchema,
  ecpDecodeResultSchema,
  ecpEncodeInputSchema,
  ecpEncodeResultSchema,
} from "@executioncontrolprotocol/core"
import { decodeFromToon } from "./decode.js"
import { encodeToToon } from "./encode.js"

/** TOON format extension definition. @category Extensions */
export const formatToonExtension = defineExtension("@executioncontrolprotocol", "format-toon")
  .withMetadata({
    summary: "TOON encode and decode for ECP documents.",
    description:
      "Converts workflows, environments, and patch documents to and from the token-oriented TOON text format with optional header and compaction settings.",
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/format-toon", "encode")
      .withInput(ecpEncodeInputSchema)
      .withOutput(ecpEncodeResultSchema)
      .withExecution("local")
      .withMetadata({
        summary: "Serialize an ECP document to TOON text.",
        description:
          "Encodes a supported source into TOON for compact interchange or CLI export. Honors encode options such as headers and compact layout.",
        useCases: [
          "CLI exports a validated workflow as TOON for sharing.",
          "Workflow panel shows a compact TOON view alongside JSON.",
        ],
        samplePrompts: [
          "Encode this workflow to TOON with headers disabled.",
          "Convert the environment manifest to TOON format.",
        ],
      })
      .withHandler((input, ctx) => encodeToToon(input as import("@executioncontrolprotocol/types").EcpEncodeInput, ctx as never)),

    capabilityFor("@executioncontrolprotocol/format-toon", "decode")
      .withInput(ecpDecodeInputSchema)
      .withOutput(ecpDecodeResultSchema)
      .withExecution("local")
      .withMetadata({
        summary: "Parse TOON text into an ECP document.",
        description:
          "Decodes TOON input into the requested target document. Validates the result and returns diagnostics when parsing or schema checks fail.",
        useCases: [
          "Import a TOON file back into an editable workflow manifest.",
          "Patch pipeline applies TOON-decoded changes to a workflow.",
        ],
        samplePrompts: [
          "Decode this TOON file into a workflow.",
          "Parse TOON patch text into a patch document.",
        ],
      })
      .withHandler((input, ctx) => decodeFromToon(input as import("@executioncontrolprotocol/types").EcpDecodeInput, ctx as never)),
  ])
  .build()
