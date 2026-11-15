import { describe, expect, it } from "vitest"
import {
  environment,
  workflow,
  step,
  extension,
  BROWSER_ENVIRONMENT_ID,
} from "@executioncontrolprotocol/browser"

describe("browser import surface", () => {
  it("imports core builders and browser environment", () => {
    expect(typeof environment).toBe("function")
    expect(typeof workflow).toBe("function")
    expect(typeof step).toBe("function")
    const env = environment(BROWSER_ENVIRONMENT_ID, "import-test")
    expect(env).toBeDefined()
    expect(typeof env.init).toBe("function")
    expect(typeof env.with).toBe("function")
    expect(extension("@executioncontrolprotocol/browser-registry")).toBeDefined()
  })
})
