import { describe, expect, it } from "vitest"
import {
  createBrowserDemoEnvironment,
  createEcp,
  getBrowserSessionValue,
  registerBrowserDefaults,
  setBrowserSessionValue,
} from "../src/index.js"

describe("@executioncontrolprotocol/browser-session-config terminate", () => {
  it("clears session values on ecp.terminate()", async () => {
    await registerBrowserDefaults()
    setBrowserSessionValue("OPENAI_API_KEY", "secret-test-key")
    const env = createBrowserDemoEnvironment("session-terminate")
    const ecp = await createEcp(env)
    expect(getBrowserSessionValue("OPENAI_API_KEY")).toBe("secret-test-key")
    await ecp.terminate()
    expect(getBrowserSessionValue("OPENAI_API_KEY")).toBeUndefined()
  })
})
