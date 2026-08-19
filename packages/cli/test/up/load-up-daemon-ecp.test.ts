import { describe, expect, it, vi, beforeEach } from "vitest"

const init = vi.fn()
const withExtensions = vi.fn()
const environmentFn = vi.fn()
const loadEnvironmentModule = vi.fn()
const registerOllamaExtension = vi.fn()

vi.mock("@executioncontrolprotocol/core/loaders", () => ({
  loadEnvironmentModule: (...args: unknown[]) => loadEnvironmentModule(...args),
}))

vi.mock("@executioncontrolprotocol/extension-ollama", () => ({
  registerOllamaExtension: (...args: unknown[]) => registerOllamaExtension(...args),
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
    environmentFn.mockResolvedValue({ withExtensions })
    registerOllamaExtension.mockResolvedValue(undefined)
  })

  it("loads the project environment when envPath is set", async () => {
    loadEnvironmentModule.mockResolvedValue({ init })
    await loadUpDaemonEcp({ envPath: "/proj/environment.ts", ollamaUrl: "http://127.0.0.1:11434" })
    expect(loadEnvironmentModule).toHaveBeenCalledWith("/proj/environment.ts")
    expect(init).toHaveBeenCalled()
    expect(environmentFn).not.toHaveBeenCalled()
  })

  it("hosts Ollama only when envPath is omitted", async () => {
    await loadUpDaemonEcp({ ollamaUrl: "http://127.0.0.1:11434" })
    expect(loadEnvironmentModule).not.toHaveBeenCalled()
    expect(environmentFn).toHaveBeenCalledWith("ecp-up")
    expect(withExtensions).toHaveBeenCalled()
    expect(init).toHaveBeenCalled()
  })
})
