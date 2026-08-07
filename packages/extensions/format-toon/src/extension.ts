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
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/format-toon", "encode")
      .withInput(ecpEncodeInputSchema)
      .withOutput(ecpEncodeResultSchema)
      .withHandler((input, ctx) => encodeToToon(input as import("@executioncontrolprotocol/types").EcpEncodeInput, ctx as never)),

    capabilityFor("@executioncontrolprotocol/format-toon", "decode")
      .withInput(ecpDecodeInputSchema)
      .withOutput(ecpDecodeResultSchema)
      .withHandler((input, ctx) => decodeFromToon(input as import("@executioncontrolprotocol/types").EcpDecodeInput, ctx as never)),
  ])
  .build()
