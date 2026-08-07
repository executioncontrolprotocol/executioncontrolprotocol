import { describe, expect, it } from "vitest"
import { createBrowserDemoEnvironment, createEcp, registerBrowserDefaults } from "../src/index.js"

describe("@executioncontrolprotocol/browser.guideChat", () => {
  it("returns prose guidance without TOON", async () => {
    await registerBrowserDefaults()
    const env = createBrowserDemoEnvironment("guide-chat-test")
    const ecp = await createEcp(env)
    const result = await ecp.invoke("@executioncontrolprotocol/browser.guideChat").with({ message: "What is a workflow?" }).process()
    expect(result.success).toBe(true)
    const text = String((result.result as { text: string }).text)
    expect(text).toMatch(/workflow/i)
    expect(text).not.toMatch(/schema: "@executioncontrolprotocol.workflow"/)
    await ecp.terminate()
  })

  it("suggests explicit workflow creation phrasing", async () => {
    await registerBrowserDefaults()
    const env = createBrowserDemoEnvironment("guide-chat-test-2")
    const ecp = await createEcp(env)
    const result = await ecp
      .invoke("@executioncontrolprotocol/browser.guideChat")
      .with({ message: "create a workflow for me" })
      .process()
    expect(result.success).toBe(true)
    const text = String((result.result as { text: string }).text)
    expect(text).toMatch(/demo echo/i)
    await ecp.terminate()
  })

  it("introduces capabilities for identity questions", async () => {
    await registerBrowserDefaults()
    const env = createBrowserDemoEnvironment("guide-chat-test-3")
    const ecp = await createEcp(env)
    const result = await ecp
      .invoke("@executioncontrolprotocol/browser.guideChat")
      .with({ message: "What can you do?" })
      .process()
    expect(result.success).toBe(true)
    const text = String((result.result as { text: string }).text)
    expect(text).toMatch(/workflow/i)
    expect(text).toMatch(/@executioncontrolprotocol\/chrome-ai\.generate/)
    await ecp.terminate()
  })
})
