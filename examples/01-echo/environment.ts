import { environment, extension } from "@executioncontrolprotocol/node"

import "@executioncontrolprotocol/core/testing"
import "@executioncontrolprotocol/format-toon"

export default (await environment("echo-dev", "Echo development")).withExtensions([
  extension("@executioncontrolprotocol/test").with({}),
  extension("@executioncontrolprotocol/format-toon").with({}),
])
