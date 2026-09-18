import { describe, expect, it, vi, beforeEach } from "vitest"

const init = vi.fn()
const withExtensions = vi.fn()
const addExtensionBinding = vi.fn()
const environmentFn = vi.fn()
const loadEnvironmentModule = vi.fn()
const registerOllamaExtension = vi.fn()
const registerStorageExtension = vi.fn()

vi.mock("@executioncontrolprotocol/core/loaders", () => ({
  loadEnvironmentModule: (...args: unknown[]) => loadEnvironmentModule(...args),
}))

vi.mock("@executioncontrolprotocol/extension-ollama", () => ({
  registerOllamaExtension: (...args: unknown[]) => registerOllamaExtension(...args),
}))

vi.mock("@executioncontrolprotocol/extension-storage", () => ({
  registerStorageExtension: (...args: unknown[]) => registerStorageExtension(...args),
  wipeEcpTemp: vi.fn(),
  ensureEcpHomeLayout: vi.fn(),
}))

vi.mock("@executioncontrolprotocol/node", () => ({
  environment: (...args: unknown[]) => environmentFn(...args),
  extension: (id: string) => ({ with: (config: unknown) => ({ id, config }) }),
}))

import { loadUpDaemonEcp } from "../../src/lib/up/create-daemon.js"

describe("loadUpDaemonEcp", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    init.mockResolvedValue({ id: "ecp" })
    withExtensions.mockReturnValue({ init })
    addExtensionBinding.mockReturnValue(undefined)
    environmentFn.mockResolvedValue({ withExtensions })
    registerOllamaExtension.mockResolvedValue(undefined)
    registerStorageExtension.mockResolvedValue(undefined)
  })

  it("loads the project environment and always adds Ollama and storage when envPath is set", async () => {
    const getRegistry = vi.fn(() => ({ id: "registry" }))
    loadEnvironmentModule.mockResolvedValue({ init, addExtensionBinding, getRegistry })
    await loadUpDaemonEcp({ envPath: "/proj/environment.ts", ollamaUrl: "http://127.0.0.1:11434" })
    expect(loadEnvironmentModule).toHaveBeenCalledWith("/proj/environment.ts")
    expect(registerOllamaExtension).toHaveBeenCalledTimes(2)
    expect(registerOllamaExtension).toHaveBeenLastCalledWith({ id: "registry" })
    expect(registerStorageExtension).toHaveBeenCalledTimes(2)
    expect(registerStorageExtension).toHaveBeenLastCalledWith({ id: "registry" })
    expect(addExtensionBinding).toHaveBeenCalledWith("@executioncontrolprotocol/ollama", {
      baseURL: "http://127.0.0.1:11434",
    })
    expect(addExtensionBinding).toHaveBeenCalledWith("@executioncontrolprotocol/storage", {})
    expect(init).toHaveBeenCalled()
    expect(environmentFn).not.toHaveBeenCalled()
  })

  it("hosts Ollama and storage when envPath is omitted", async () => {
    await loadUpDaemonEcp({ ollamaUrl: "http://127.0.0.1:11434" })
    expect(loadEnvironmentModule).not.toHaveBeenCalled()
    expect(environmentFn).toHaveBeenCalledWith("ecp-up")
    expect(withExtensions).toHaveBeenCalled()
    const bound = withExtensions.mock.calls[0]?.[0] as Array<{ id: string }>
    expect(bound.map((b) => b.id)).toEqual([
      "@executioncontrolprotocol/ollama",
      "@executioncontrolprotocol/storage",
    ])
    expect(init).toHaveBeenCalled()
  })
})
