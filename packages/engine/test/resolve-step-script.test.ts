import path from "node:path"
import { describe, expect, it } from "vitest"
import { resolveStepScript } from "../src/execute/resolve.js"

const dir = path.resolve("/workflows/demo")

describe("resolveStepScript", () => {
  it("returns inline source and file contents", async () => {
    await expect(resolveStepScript({ $script: { lang: "js", source: "return 1" } })).resolves.toBe("return 1")
    const read = async (file: string) => {
      if (!/scripts[\\/]t\.js$/.test(file)) throw new Error(`unexpected ${file}`)
      return "return input"
    }
    await expect(resolveStepScript({ $script: { lang: "js", path: "scripts/t.js" } }, read, dir)).resolves.toBe(
      "return input",
    )
  })

  it("rejects a missing marker, missing code, and unreadable or missing files", async () => {
    await expect(resolveStepScript(undefined)).rejects.toMatchObject({ code: "ECP_SCRIPT_INVALID" })
    await expect(resolveStepScript({ $script: { lang: "js" } })).rejects.toThrow("Script must set source or path.")
    await expect(resolveStepScript({ $script: { lang: "js", path: "t.js" } })).rejects.toThrow("cannot be read")
    const missing = async () => {
      throw new Error("ENOENT")
    }
    await expect(resolveStepScript({ $script: { lang: "js", path: "t.js" } }, missing, dir)).rejects.toThrow(
      "was not found",
    )
  })

  it("checks syntax against the declared ecmaVersion", async () => {
    await expect(resolveStepScript({ $script: { lang: "js", source: "return {" } })).rejects.toMatchObject({
      code: "ECP_SCRIPT_INVALID",
    })
    await expect(
      resolveStepScript({ $script: { lang: "js", source: "return input?.a ?? 1", ecmaVersion: 2022 } }),
    ).resolves.toBe("return input?.a ?? 1")
  })
})
