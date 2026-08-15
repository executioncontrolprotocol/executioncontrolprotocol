import { environment, extension } from "@executioncontrolprotocol/node"
import "@executioncontrolprotocol/core/testing"
import "@executioncontrolprotocol/format-toon"

export default (await environment("encode-decode", "Encode decode demo")).withExtensions([
  extension("@executioncontrolprotocol/test").with({}),
  extension("@executioncontrolprotocol/format-toon").with({}),
])
