import { environment, extension, secrets } from "@executioncontrolprotocol/node"
import "@executioncontrolprotocol/extension-memory"
import "@executioncontrolprotocol/extension-openai"
import "@executioncontrolprotocol/secrets"

export default (await environment("weekly-brief", "Weekly brief")).withExtensions([
  extension("@executioncontrolprotocol/secrets").with({}),
  extension("@executioncontrolprotocol/memory", "Memory").with({
    hydrateModels: true,
    collections: ["leadership"],
  }),
  extension("@executioncontrolprotocol/openai", "OpenAI").with({
    apiKey: secrets("openai/api-key", { optional: true }),
    defaultModel: "gpt-4o-mini",
  }),
])
