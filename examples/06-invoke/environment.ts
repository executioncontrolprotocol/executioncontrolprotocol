import { environment, extension } from "@executioncontrolprotocol/node"
import "@executioncontrolprotocol/core/testing"

export default (await environment("invoke-demo", "Invoke demo")).withExtensions([
  extension("@executioncontrolprotocol/test").with({}),
])
