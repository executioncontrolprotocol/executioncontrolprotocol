import { extension, testExtension } from "@executioncontrolprotocol/core"
import { BROWSER_ENVIRONMENT_ID, createBrowserEnvironment } from "../src/index.js"

/** Slim browser host environment for unit tests. */
export function createBrowserTestEnvironment(id = "browser-test") {
  return createBrowserEnvironment(BROWSER_ENVIRONMENT_ID, id).with([
    extension(testExtension),
  ])
}
