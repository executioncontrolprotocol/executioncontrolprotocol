import {
  environment,
  extension,
  secrets,
  NODE_ENVIRONMENT_ID,
  testExtension,
} from "@executioncontrolprotocol/node"
import { openaiExtension } from "@executioncontrolprotocol/extension-openai"

export default environment(NODE_ENVIRONMENT_ID, "secrets-bind").with([
  extension(testExtension),
  extension(openaiExtension).with({
    apiKey: secrets("openai/api-key", { optional: true }),
    defaultModel: "gpt-4o-mini",
  }),
])
