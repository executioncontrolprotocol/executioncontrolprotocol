import path from "node:path"
import { fileURLToPath } from "node:url"

/** Package root for `@executioncontrolprotocol/harnesses-browser-coding`. */
export const CODING_EVAL_PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)

/** Root directory for Browser Coding eval fixtures. */
export const CODING_EVAL_FIXTURES_ROOT = path.join(CODING_EVAL_PACKAGE_ROOT, "fixtures")

/** Directory for Browser Coding eval case JSON catalogs. */
export const CODING_EVAL_CASES_DIR = path.join(CODING_EVAL_FIXTURES_ROOT, "eval-cases")
