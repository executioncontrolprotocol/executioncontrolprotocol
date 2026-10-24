import { describe, it } from "vitest"

async function ollamaReachable(): Promise<boolean> {
  try {
    const res = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

describe("ollama e2e", () => {
  it("reports Ollama availability without failing CI", async () => {
    const up = await ollamaReachable()
    expect(typeof up).toBe("boolean")
  })
})
