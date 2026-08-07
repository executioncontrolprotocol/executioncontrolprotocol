import path from "node:path"
import { fileURLToPath } from "node:url"

/** Package root for `@executioncontrolprotocol/core` (fixtures live beside `src` and `dist`). @category Harness */
export const CORE_PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)

/** Directory for schema output example JSON fixtures. @category Harness */
export const SCHEMA_EXAMPLES_DIR = path.join(CORE_PACKAGE_ROOT, "fixtures/schema-examples")
