import {
  environment,
  extension,
  NODE_ENVIRONMENT_ID,
  testExtension,
} from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "two-step-test").with([
  extension(testExtension),
])
