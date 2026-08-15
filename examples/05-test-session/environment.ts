import { environment, extension } from "@executioncontrolprotocol/node"
import "@executioncontrolprotocol/core/testing"

export default (await environment("test-session", "Test session demo")).withExtensions([
  extension("@executioncontrolprotocol/test").with({}),
])
