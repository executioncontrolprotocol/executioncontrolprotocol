import path from "node:path"
import { fileURLToPath } from "node:url"

/** Package root for `@executioncontrolprotocol/harnesses-browser-nano`. @category Harness */
export const NANO_PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
)

/** Directory for Browser Nano harness prompt JSON fixtures. @category Harness */
export const NANO_HARNESS_PROMPTS_DIR = path.join(NANO_PACKAGE_ROOT, "fixtures/harness-prompts")
