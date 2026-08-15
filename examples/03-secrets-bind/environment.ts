import { environment, extension, secrets } from "@executioncontrolprotocol/node"
import "@executioncontrolprotocol/core/testing"
import "@executioncontrolprotocol/secrets"
import "@executioncontrolprotocol/extension-openai"

export default (await environment("secrets-bind", "Secrets bind demo")).withExtensions([
  extension("@executioncontrolprotocol/secrets").with({}),
  extension("@executioncontrolprotocol/test").with({}),
  extension("@executioncontrolprotocol/openai").with({
    apiKey: secrets("openai/api-key", { optional: true }),
    defaultModel: "gpt-4o-mini",
  }),
])
