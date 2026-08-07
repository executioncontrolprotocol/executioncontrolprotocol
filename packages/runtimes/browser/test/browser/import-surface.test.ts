import { describe, expect, it } from "vitest"
import {
  environment,
  workflow,
  step,
  registerBrowserDefaults,
  extension,
  runtime,
} from "@executioncontrolprotocol/browser"

describe("browser import surface", () => {
  it("imports core builders and browser environment", async () => {
    await registerBrowserDefaults()
    expect(typeof environment).toBe("function")
    expect(typeof workflow).toBe("function")
    expect(typeof step).toBe("function")
    const env = await environment("import-test")
    expect(env).toBeDefined()
    expect(typeof env.init).toBe("function")
    expect(runtime("@executioncontrolprotocol/browser")).toBeDefined()
    expect(extension("@executioncontrolprotocol/browser-registry")).toBeDefined()
  })
})
