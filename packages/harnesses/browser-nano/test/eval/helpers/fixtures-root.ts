import path from "node:path"
import { fileURLToPath } from "node:url"

/** Package root for `@executioncontrolprotocol/harnesses-browser-nano`. @category Harness */
export const NANO_EVAL_PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)

/** Root directory for Browser Nano eval fixtures. @category Harness */
export const NANO_EVAL_FIXTURES_ROOT = path.join(NANO_EVAL_PACKAGE_ROOT, "fixtures")

/** Directory for Browser Nano eval case JSON catalogs. @category Harness */
export const NANO_EVAL_CASES_DIR = path.join(NANO_EVAL_FIXTURES_ROOT, "eval-cases")
