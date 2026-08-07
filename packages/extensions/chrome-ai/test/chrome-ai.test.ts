import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { globalRegistry } from "@executioncontrolprotocol/core"
import {
  chromeAiExtension,
  getModelInstallState,
  readAvailability,
  registerChromeAiExtension,
  resetModelInstallState,
  startModelDownload,
} from "../src/index.js"

describe("@executioncontrolprotocol/chrome-ai", () => {
  const originalLanguageModel = (globalThis as { LanguageModel?: unknown }).LanguageModel

  beforeEach(async () => {
    resetModelInstallState()
    await registerChromeAiExtension()
  })

  afterEach(() => {
    resetModelInstallState()
    if (originalLanguageModel === undefined) {
      delete (globalThis as { LanguageModel?: unknown }).LanguageModel
    } else {
      ;(globalThis as { LanguageModel?: unknown }).LanguageModel = originalLanguageModel
    }
  })

  it("has generate but not generateText", () => {
    const ids = chromeAiExtension.capabilities.map((c) => c.id)
    expect(ids).toContain("@executioncontrolprotocol/chrome-ai.generate")
    expect(ids).not.toContain("@executioncontrolprotocol/chrome-ai.generateText")
  })

  it("checkAvailability returns unsupported when LanguageModel is missing", async () => {
    delete (globalThis as { LanguageModel?: unknown }).LanguageModel
    const cap = chromeAiExtension.capabilities.find((c) => c.id === "@executioncontrolprotocol/chrome-ai.checkAvailability")
    const result = await cap!.handler!({}, {} as never)
    expect(result).toEqual({ available: false, supported: false, status: "unsupported" })
  })

  it("checkAvailability returns supported when downloadable", async () => {
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: vi.fn().mockResolvedValue("downloadable"),
    }
    const cap = chromeAiExtension.capabilities.find((c) => c.id === "@executioncontrolprotocol/chrome-ai.checkAvailability")
    const result = await cap!.handler!({}, {} as never)
    expect(result).toEqual({ available: false, supported: true, status: "downloadable" })
  })

  it("checkAvailability returns available when LanguageModel reports available", async () => {
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: vi.fn().mockResolvedValue("available"),
    }
    const cap = chromeAiExtension.capabilities.find((c) => c.id === "@executioncontrolprotocol/chrome-ai.checkAvailability")
    const result = await cap!.handler!({}, {} as never)
    expect(result).toEqual({ available: true, supported: true, status: "available" })
  })

  it("startModelDownload reports progress and becomes ready", async () => {
    const availability = vi
      .fn()
      .mockResolvedValueOnce("downloadable")
      .mockResolvedValue("available")
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability,
      create: vi.fn().mockImplementation(async ({ monitor }) => {
        monitor?.({
          addEventListener: (_type: string, fn: (e: { loaded: number; total: number }) => void) => {
            fn({ loaded: 50, total: 100 })
            fn({ loaded: 100, total: 100 })
          },
        })
        return { prompt: vi.fn().mockResolvedValue({ text: "ok" }) }
      }),
    }

    const started = await startModelDownload()
    expect(started.started).toBe(true)

    await vi.waitFor(() => getModelInstallState().phase === "ready", { timeout: 2000 })
    expect(getModelInstallState()).toMatchObject({ phase: "ready", status: "available" })
  })

  it("getModelInstallState capability returns snapshot", async () => {
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: vi.fn().mockResolvedValue("available"),
    }
    await startModelDownload()
    const cap = chromeAiExtension.capabilities.find((c) => c.id === "@executioncontrolprotocol/chrome-ai.getModelInstallState")
    const result = await cap!.handler!({}, {} as never)
    expect(result).toMatchObject({ phase: "ready" })
  })

  it("generate returns text from LanguageModel session", async () => {
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: vi.fn().mockResolvedValue("available"),
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn().mockResolvedValue({ text: "hello from chrome" }),
      }),
    }
    const cap = chromeAiExtension.capabilities.find((c) => c.id === "@executioncontrolprotocol/chrome-ai.generate")
    const result = await cap!.handler!(
      { prompt: "hi", system: "be brief" },
      { usage: { increment: vi.fn() } } as never
    )
    expect(result).toEqual({ text: "hello from chrome" })
  })

  it("generate appends object context text field to prompt", async () => {
    const promptMock = vi.fn().mockResolvedValue({ text: "summary" })
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: vi.fn().mockResolvedValue("available"),
      create: vi.fn().mockResolvedValue({ prompt: promptMock }),
    }
    const cap = chromeAiExtension.capabilities.find((c) => c.id === "@executioncontrolprotocol/chrome-ai.generate")
    await cap!.handler!(
      {
        prompt: "Summarize the following poem:",
        context: { text: "poem body" },
      },
      { usage: { increment: vi.fn() } } as never
    )
    expect(promptMock).toHaveBeenCalledWith("Summarize the following poem:\n\npoem body")
  })

  it("generate appends string context to prompt", async () => {
    const promptMock = vi.fn().mockResolvedValue({ text: "summary" })
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: vi.fn().mockResolvedValue("available"),
      create: vi.fn().mockResolvedValue({ prompt: promptMock }),
    }
    const cap = chromeAiExtension.capabilities.find((c) => c.id === "@executioncontrolprotocol/chrome-ai.generate")
    await cap!.handler!(
      { prompt: "Summarize:", context: "raw context text" },
      { usage: { increment: vi.fn() } } as never
    )
    expect(promptMock).toHaveBeenCalledWith("Summarize:\n\nraw context text")
  })

  it("generate returns text when prompt() resolves to a string", async () => {
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: vi.fn().mockResolvedValue("available"),
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn().mockResolvedValue('WORKFLOW demo "Demo"\nSTEP echo USES @executioncontrolprotocol/test.echo'),
      }),
    }
    const cap = chromeAiExtension.capabilities.find((c) => c.id === "@executioncontrolprotocol/chrome-ai.generate")
    const result = await cap!.handler!(
      { prompt: "create echo workflow" },
      { usage: { increment: vi.fn() } } as never
    )
    expect(result.text).toContain("WORKFLOW")
  })

  it("generate throws when model not ready", async () => {
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: vi.fn().mockResolvedValue("downloadable"),
    }
    const cap = chromeAiExtension.capabilities.find((c) => c.id === "@executioncontrolprotocol/chrome-ai.generate")
    await expect(cap!.handler!({ prompt: "hi" }, {} as never)).rejects.toThrow(/downloading/i)
  })

  it("readAvailability maps unknown status to unsupported", async () => {
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: vi.fn().mockResolvedValue("weird"),
    }
    const result = await readAvailability()
    expect(result.status).toBe("unsupported")
  })

  it("registers on global registry once", async () => {
    expect(globalRegistry.getExtension("@executioncontrolprotocol/chrome-ai")).toBeDefined()
  })
})
