import {
  environment,
  extension,
  secrets,
  NODE_ENVIRONMENT_ID,
} from "@executioncontrolprotocol/node"
import { openaiExtension } from "@executioncontrolprotocol/extension-openai"

export default environment(NODE_ENVIRONMENT_ID, "weekly-brief").with([
  extension(openaiExtension, "OpenAI").with({
    apiKey: secrets("openai/api-key", { optional: true }),
    defaultModel: "gpt-4o-mini",
  }),
])
