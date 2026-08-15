import { environment, extension } from "@executioncontrolprotocol/node"

import "@executioncontrolprotocol/core/testing"
import "@executioncontrolprotocol/format-toon"

export default (await environment("consumer-cli", "Consumer CLI fixture")).withExtensions([
  extension("@executioncontrolprotocol/test").with({}),
  extension("@executioncontrolprotocol/format-toon").with({}),
])
