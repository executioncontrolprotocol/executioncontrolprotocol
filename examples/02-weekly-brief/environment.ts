import { environment, extension, env } from "@executioncontrolprotocol/node"
import { registerMemoryExtension } from "@executioncontrolprotocol/extension-memory"
import { registerOpenaiExtension } from "@executioncontrolprotocol/extension-openai"

registerMemoryExtension()
registerOpenaiExtension()

export default environment("weekly-brief", "Weekly brief")
  .withExtensions([
    extension("@executioncontrolprotocol/memory", "Memory").with({
      hydrateModels: true,
      collections: ["leadership"],
    }),
    extension("@executioncontrolprotocol/openai", "OpenAI").with({
      apiKey: env("OPENAI_API_KEY", { optional: true }),
      defaultModel: "gpt-4o-mini",
    }),
  ])
