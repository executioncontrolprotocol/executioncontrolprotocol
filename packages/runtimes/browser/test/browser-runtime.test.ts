import { describe, expect, it, vi } from "vitest"
import { workflow, step, ref, registerTestExtension } from "@executioncontrolprotocol/core"
import { createBrowserTestEnvironment } from "./helpers.js"
import { registerRuntimeConformanceTests } from "../../../core/test/runtime-conformance.js"

registerRuntimeConformanceTests("@executioncontrolprotocol/browser", () => createBrowserTestEnvironment("browser-conformance"))

describe("@executioncontrolprotocol/browser runtime", () => {
  it("runs echo workflow", async () => {
    await registerTestExtension()
    const env = await createBrowserTestEnvironment("browser-test")
    env.addExtensionBinding("@executioncontrolprotocol/test", {})
    const manifest = workflow("Browser Echo")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hello browser" }).as("echo")])
      .toManifest()
    const ecp = await env.init()
    const result = await ecp.run(manifest)
    expect(result.run.status).toBe("completed")
    expect(result.state.echo).toEqual({ echo: "hello browser" })
  })

  it("runs chrome-ai.generate workflow step with vanilla prompt (no harness)", async () => {
    const originalLanguageModel = (globalThis as { LanguageModel?: unknown }).LanguageModel
    const promptMock = vi.fn().mockResolvedValue("short summary")
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: vi.fn().mockResolvedValue("available"),
      create: vi.fn().mockResolvedValue({ prompt: promptMock }),
    }

    try {
      const env = await createBrowserTestEnvironment("browser-chrome-generate")
      const manifest = workflow("Chrome Summarize")
        .run([
          step("@executioncontrolprotocol/chrome-ai.generate", "Summarize")
            .with({ prompt: "Summarize: hello" })
            .as("summary"),
        ])
        .toManifest()
      const ecp = await env.init()
      const result = await ecp.run(manifest)
      expect(result.run.status).toBe("completed")
      expect(promptMock).toHaveBeenCalledWith("Summarize: hello")
      expect(promptMock.mock.calls[0]?.[0]).not.toMatch(/EQL/i)
      expect(result.state.summary).toEqual({ text: "short summary" })
    } finally {
      if (originalLanguageModel === undefined) {
        delete (globalThis as { LanguageModel?: unknown }).LanguageModel
      } else {
        ;(globalThis as { LanguageModel?: unknown }).LanguageModel = originalLanguageModel
      }
    }
  })

  it("runs two-step chrome-ai chain with context ref from prior step", async () => {
    const originalLanguageModel = (globalThis as { LanguageModel?: unknown }).LanguageModel
    const promptMock = vi
      .fn()
      .mockResolvedValueOnce({ text: "ocean poem lines" })
      .mockResolvedValueOnce({ text: "short summary" })
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: vi.fn().mockResolvedValue("available"),
      create: vi.fn().mockResolvedValue({ prompt: promptMock }),
    }

    try {
      const env = await createBrowserTestEnvironment("browser-chrome-chain")
      const manifest = workflow("Poem Summarization")
        .id("poem-summarize")
        .run([
          step("@executioncontrolprotocol/chrome-ai.generate", "Generate Poem")
            .id("poem")
            .with({ prompt: "Write a short poem about the ocean." })
            .as("poem"),
          step("@executioncontrolprotocol/chrome-ai.generate", "Summarize Poem")
            .id("summarize")
            .with({
              prompt: "Summarize the following poem:",
              context: ref("poem.text"),
            })
            .as("summary"),
        ])
        .toManifest()
      const ecp = await env.init()
      const result = await ecp.run(manifest)
      expect(result.run.status).toBe("completed")
      expect(promptMock).toHaveBeenCalledTimes(2)
      expect(promptMock.mock.calls[1]?.[0]).toContain("Summarize the following poem:")
      expect(promptMock.mock.calls[1]?.[0]).toContain("ocean poem lines")
      expect(result.state.summary).toEqual({ text: "short summary" })
    } finally {
      if (originalLanguageModel === undefined) {
        delete (globalThis as { LanguageModel?: unknown }).LanguageModel
      } else {
        ;(globalThis as { LanguageModel?: unknown }).LanguageModel = originalLanguageModel
      }
    }
  })
})
