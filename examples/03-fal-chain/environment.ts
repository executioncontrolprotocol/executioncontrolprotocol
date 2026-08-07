import "@executioncontrolprotocol/extension-fal"
import { environment, extension, env } from "@executioncontrolprotocol/node"
import { registerFalExtension } from "@executioncontrolprotocol/extension-fal"

registerFalExtension()

export default environment("fal-chain", "FAL image chain")
  .withExtensions([
    extension("@executioncontrolprotocol/fal", "FAL").with({
      apiKey: env("FAL_KEY", { optional: true }),
      defaultMode: "subscribe",
    }),
  ])
