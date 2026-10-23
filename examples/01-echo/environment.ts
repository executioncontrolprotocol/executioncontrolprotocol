import {
  environment,
  extension,
  NODE_ENVIRONMENT_ID,
  testExtension,
} from "@executioncontrolprotocol/node"
import { formatToonExtension } from "@executioncontrolprotocol/format-toon"

export default environment(NODE_ENVIRONMENT_ID, "echo-dev").with([
  extension(testExtension),
  extension(formatToonExtension),
])
