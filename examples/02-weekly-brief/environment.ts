import { environment, extension, env } from "@executioncontrolprotocol/node"
import { registerMemoryExtension } from "@executioncontrolprotocol/extension-memory"
import { registerOpenaiExtension } from "@executioncontrolprotocol/extension-openai"
import { registerSlackExtension } from "@executioncontrolprotocol/extension-slack"

registerMemoryExtension()
registerOpenaiExtension()
registerSlackExtension()

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
    extension("@executioncontrolprotocol/slack", "Slack").with({
      botToken: env("SLACK_BOT_TOKEN", { optional: true }),
    }),
  ])
