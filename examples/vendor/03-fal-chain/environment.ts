import { environment, extension, env, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import { falExtension } from "@executioncontrolprotocol/fal"

export default environment(NODE_ENVIRONMENT_ID, "fal-chain").with([
  extension(falExtension, "FAL").with({
    apiKey: env("FAL_KEY", { optional: true }),
    defaultMode: "subscribe",
  }),
])
