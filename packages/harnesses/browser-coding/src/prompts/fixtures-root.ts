import path from "node:path"
import { fileURLToPath } from "node:url"

/** Package root for `@executioncontrolprotocol/harnesses-browser-coding`. @category Harness */
export const CODING_PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
)

/** Directory for Browser Coding harness prompt JSON fixtures. @category Harness */
export const CODING_HARNESS_PROMPTS_DIR = path.join(CODING_PACKAGE_ROOT, "fixtures/harness-prompts")
