import { environment, extension } from "@executioncontrolprotocol/node"

import "@executioncontrolprotocol/core/testing"

export default (await environment("two-step-test", "Two-step test")).withExtensions([
  extension("@executioncontrolprotocol/test").with({}),
])
