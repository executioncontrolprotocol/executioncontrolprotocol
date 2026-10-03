import "@executioncontrolprotocol/fal"
import { environment, extension, env } from "@executioncontrolprotocol/node"
import { registerFalExtension } from "@executioncontrolprotocol/fal"

registerFalExtension()

export default environment("fal-chain", "FAL image chain")
  .withExtensions([
    extension("@executioncontrolprotocol/fal", "FAL").with({
      apiKey: env("FAL_KEY", { optional: true }),
      defaultMode: "subscribe",
    }),
  ])
