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

  it("startModelDownload fails fast without user activation when downloadable", async () => {
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: vi.fn().mockResolvedValue("downloadable"),
      create: vi.fn(),
    }
    Object.defineProperty(globalThis.navigator, "userActivation", {
      configurable: true,
      value: { isActive: false },
    })
    try {
      const started = await startModelDownload()
      expect(started.started).toBe(false)
      expect(getModelInstallState().phase).toBe("error")
      expect(getModelInstallState().error).toMatch(/user click/i)
      expect(
        (globalThis as { LanguageModel: { create: ReturnType<typeof vi.fn> } }).LanguageModel.create
      ).not.toHaveBeenCalled()
    } finally {
      Reflect.deleteProperty(globalThis.navigator, "userActivation")
    }
  })

  it("startModelDownload reports progress and becomes ready", async () => {
    const availability = vi.fn().mockResolvedValue("available")
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability,
      create: vi.fn().mockImplementation(async ({ monitor }) => {
        monitor?.({
          addEventListener: (_type: string, fn: (e: { loaded: number; total: number }) => void) => {
            fn({ loaded: 0, total: 100 })
            fn({ loaded: 50, total: 100 })
            fn({ loaded: 100, total: 100 })
          },
        })
        return { prompt: vi.fn().mockResolvedValue({ text: "ok" }) }
      }),
    }
    Object.defineProperty(globalThis.navigator, "userActivation", {
      configurable: true,
      value: { isActive: true },
    })
    try {
      const started = await startModelDownload()
      expect(started.started).toBe(true)

      await vi.waitFor(() => {
        expect(getModelInstallState()).toMatchObject({ phase: "ready", status: "available" })
      }, { timeout: 2000 })
    } finally {
      Reflect.deleteProperty(globalThis.navigator, "userActivation")
    }
  })

  it("readAvailability prefers bare options when already available", async () => {
    const availability = vi.fn().mockImplementation(async (opts?: unknown) => {
      if (opts === undefined) return "available"
      return "downloadable"
    })
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = { availability }
    const result = await readAvailability()
    expect(result).toEqual({ available: true, supported: true, status: "available" })
    const { getPreferredCreateOptions } = await import("../src/model-install.js")
    expect(getPreferredCreateOptions()).toEqual({ kind: "bare" })
  })

  it("getModelInstallState capability returns snapshot", async () => {
    ;(globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: vi.fn().mockResolvedValue("available"),
      create: vi.fn().mockResolvedValue({ prompt: vi.fn() }),
    }
    Object.defineProperty(globalThis.navigator, "userActivation", {
      configurable: true,
      value: { isActive: true },
    })
    try {
      await startModelDownload()
      await vi.waitFor(() => {
        expect(getModelInstallState().phase).toBe("ready")
      }, { timeout: 2000 })
      const cap = chromeAiExtension.capabilities.find(
        (c) => c.id === "@executioncontrolprotocol/chrome-ai.getModelInstallState"
      )
      const result = await cap!.handler!({}, {} as never)
      expect(result).toMatchObject({ phase: "ready" })
    } finally {
      Reflect.deleteProperty(globalThis.navigator, "userActivation")
    }
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

  it("isChromeModelInstallStalled is false while progress is recent", async () => {
    const { isChromeModelInstallStalled, CHROME_MODEL_STALL_MS } = await import(
      "../src/model-install.js"
    )
    expect(
      isChromeModelInstallStalled({
        phase: "downloading",
        status: "downloading",
        loaded: 0,
        lastProgressAt: 1_000,
        now: 1_000 + CHROME_MODEL_STALL_MS - 1,
      })
    ).toBe(false)
  })

  it("isChromeModelInstallStalled suggests restart after no progress", async () => {
    const { isChromeModelInstallStalled, CHROME_MODEL_STALL_MS, CHROME_MODEL_STALL_HINT } =
      await import("../src/model-install.js")
    expect(
      isChromeModelInstallStalled({
        phase: "downloading",
        status: "downloading",
        lastProgressAt: 1_000,
        now: 1_000 + CHROME_MODEL_STALL_MS,
      })
    ).toBe(true)
    expect(CHROME_MODEL_STALL_HINT).toMatch(/quit and reopen Chrome/i)
  })

  it("registers on global registry once", async () => {
    expect(globalRegistry.getExtension("@executioncontrolprotocol/chrome-ai")).toBeDefined()
  })
})
