import {
  capabilityFor,
  defineExtension,
  ecpDecodeInputSchema,
  ecpDecodeResultSchema,
  ecpEncodeInputSchema,
  ecpEncodeResultSchema,
} from "@executioncontrolprotocol/core"
import { decodeFromEql } from "./decode/decode-eql.js"
import { encodeToEql } from "./encode/encode-eql.js"

/** EQL format extension definition. @category Extensions */
export const formatEqlExtension = defineExtension("@executioncontrolprotocol", "format-eql")
  .withMetadata({
    summary: "EQL encode and decode for ECP documents.",
    description:
      "Converts workflows, environments, patches, and harness artifacts to and from the compact EQL text format used by small-model harnesses.",
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/format-eql", "encode")
      .withInput(ecpEncodeInputSchema)
      .withOutput(ecpEncodeResultSchema)
      .withExecution("local")
      .withMetadata({
        summary: "Serialize an ECP document to EQL text.",
        description:
          "Encodes a supported source document into EQL for authoring panels, model prompts, or compact storage. Returns validation diagnostics when the source is invalid.",
        useCases: [
          "Harness prompt includes a compact workflow representation.",
          "Editor exports the current manifest as EQL for review.",
        ],
        samplePrompts: [
          "Encode this workflow as EQL.",
          "Convert the manifest to EQL for the nano harness.",
        ],
      })
      .withHandler((input, ctx) => encodeToEql(input as import("./schemas.js").EqlEncodeInput, ctx as never)),

    capabilityFor("@executioncontrolprotocol/format-eql", "decode")
      .withInput(ecpDecodeInputSchema)
      .withOutput(ecpDecodeResultSchema)
      .withExecution("local")
      .withMetadata({
        summary: "Parse EQL text into an ECP document.",
        description:
          "Decodes EQL input into the requested target document type. Surfaces parse and validation diagnostics when the text is malformed or incomplete.",
        useCases: [
          "Model-authored EQL is compiled back into a workflow manifest.",
          "Import pipeline ingests EQL files from disk.",
        ],
        samplePrompts: [
          "Decode this EQL into a workflow manifest.",
          "Parse the EQL patch document from the model reply.",
        ],
      })
      .withHandler((input, ctx) => decodeFromEql(input as import("./schemas.js").EqlDecodeInput, ctx as never)),
  ])
  .build()
